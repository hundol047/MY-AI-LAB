// 정적 파일 + AI(/api/start, /api/guide) + 사진(/api/photo)
// AI는 말을 이해하고 설명만 하고, 장소 선택·시간 계산은 검증된 데이터 기반 엔진이 한다.
// 그래서 존재하지 않는 장소나 문 닫은 곳이 일정에 들어갈 수 없다.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { tourPhoto } from "./scripts/photo-sources.mjs";
import { startFromText, guide } from "./ai.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

const photoCache = new Map();
const gzipCache = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 60_000) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "POST" && (url.pathname === "/api/start" || url.pathname === "/api/guide")) {
    try {
      const body = JSON.parse(await readBody(req));
      const text = url.pathname === "/api/start" ? body.text : body.question;
      if (typeof text !== "string" || !text.trim() || text.length > 300) { res.writeHead(400).end(); return; }
      const result = url.pathname === "/api/start"
        ? await startFromText(text.trim(), body.today)
        : await guide({ question: text.trim(), history: body.history, trip: body.trip });
      res.writeHead(200, { "content-type": MIME[".json"] }).end(JSON.stringify(result));
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) console.error("Anthropic 인증 실패: ANTHROPIC_API_KEY를 확인하세요.");
      else if (err instanceof Anthropic.RateLimitError) console.error("요청 한도 초과");
      else if (err instanceof Anthropic.APIError) console.error(`API 오류 ${err.status}: ${err.message}`);
      else console.error(err.message);
      res.writeHead(503).end();
    }
    return;
  }

  // 장소 사진: 한국관광공사 TourAPI (TOUR_API_KEY가 있을 때만)
  if (req.method === "GET" && url.pathname === "/api/photo") {
    const id = url.searchParams.get("id") || "";
    const place = { name: url.searchParams.get("name") || "", lat: Number(url.searchParams.get("lat")), lng: Number(url.searchParams.get("lng")) };
    if (!process.env.TOUR_API_KEY || !place.name || !Number.isFinite(place.lat)) { res.writeHead(404).end(); return; }
    try {
      if (!photoCache.has(id)) photoCache.set(id, await tourPhoto(place, process.env.TOUR_API_KEY));
      const photo = photoCache.get(id);
      if (!photo) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-type": MIME[".json"], "cache-control": "public, max-age=86400" }).end(JSON.stringify({ url: photo }));
    } catch {
      res.writeHead(502).end();
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }

  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  try {
    const ext = path.extname(file);
    let body = await readFile(file);
    const headers = {
      "content-type": MIME[ext] || "application/octet-stream",
      // 라이브러리·글꼴은 오래 캐시, 앱 파일은 매번 새 버전 확인
      "cache-control": rel.startsWith("/vendor/") ? "public, max-age=2592000, immutable" : "no-cache",
    };
    if (/\.(html|js|css|json|svg|webmanifest)$/.test(ext) && /gzip/.test(req.headers["accept-encoding"] || "")) {
      body = gzipCache.get(file) || gzipSync(body);
      gzipCache.set(file, body);
      headers["content-encoding"] = "gzip";
    }
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end();
  }
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
