// 정적 파일 + AI(/api/start, /api/guide, /api/lodging-check, /api/menu-scan) + 사진(/api/photo) + 가게 등록(/api/shops, /api/qr)
// AI(OpenAI 호환 API)는 말을 이해하고 설명만 하고, 장소 선택·시간 계산은 검증된 데이터 기반 엔진이 한다.
// 그래서 존재하지 않는 장소나 문 닫은 곳이 일정에 들어갈 수 없다.
import http from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { tourPhoto } from "./scripts/photo-sources.mjs";
import { startFromText, guide, lodgingCheck, menuScan, AI_MODEL, AI_PROVIDER } from "./ai.mjs";
import { REGIONS, PLACES, FESTIVALS } from "./public/data.js";

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

const SHOPS_FILE = path.join(here, "data", "shops.json");
async function loadShops() { try { return JSON.parse(await readFile(SHOPS_FILE, "utf8")); } catch { return []; } }

function logAIError(err) {
  if (err instanceof Anthropic.APIConnectionTimeoutError) console.error("Claude 응답이 대기 상한을 넘어 무료 간단 모드로 답했어요");
  else if (err instanceof Anthropic.AuthenticationError) console.error("Claude 인증 실패: ANTHROPIC_API_KEY를 확인하세요.");
  else if (err instanceof Anthropic.NotFoundError) console.error(`Claude 모델을 찾을 수 없음: CLAUDE_AI_MODEL(${AI_MODEL})을 확인하세요.`);
  else if (err instanceof Anthropic.RateLimitError) console.error("Claude 요청 한도 초과");
  else if (err instanceof Anthropic.APIError) console.error(`Claude API 오류 ${err.status}: ${err.message}`);
  else if (err instanceof OpenAI.AuthenticationError) console.error("AI 인증 실패: AI_API_KEY를 확인하세요.");
  else if (err instanceof OpenAI.NotFoundError) console.error(`모델을 찾을 수 없음: AI_MODEL(${AI_MODEL})을 확인하세요.`);
  else if (err instanceof OpenAI.RateLimitError) console.error("요청 한도 초과");
  else if (err instanceof OpenAI.APIError) console.error(`AI API 오류 ${err.status}: ${err.message}`);
  else console.error(err.message);
}
const json = (res, code, obj) => res.writeHead(code, { "content-type": MIME[".json"] }).end(JSON.stringify(obj));
const clean = (v, max) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);

// 요청 본문 읽기: 너무 크거나 중간에 끊기면 기다리지 않고 실패
function readBody(req, limit = 60_000) {
  return new Promise((resolve, reject) => {
    let data = "", done = false;
    req.on("data", (c) => { data += c; if (data.length > limit) { done = true; reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { done = true; resolve(data); });
    req.on("error", (e) => { done = true; reject(e); });
    req.on("close", () => { if (!done) reject(new Error("aborted")); });
  });
}

// 가게 등록 파일은 한 번에 하나씩 쓴다 (동시에 등록해도 서로 덮어쓰지 않게)
let shopWrite = Promise.resolve();
function saveShop(shop) {
  shopWrite = shopWrite.then(async () => {
    const shops = await loadShops();
    shops.push(shop);
    await writeFile(SHOPS_FILE, JSON.stringify(shops, null, 2));
  });
  return shopWrite;
}

// 요청 하나에서 오류가 나도 서버 전체가 꺼지지 않게 감싼다
const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("요청 처리 오류:", req.method, req.url, err.message);
    if (!res.headersSent) res.writeHead(500).end(); else res.end();
  });
});

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "POST" && (url.pathname === "/api/start" || url.pathname === "/api/guide")) {
    try {
      const body = JSON.parse(await readBody(req));
      const text = url.pathname === "/api/start" ? body.text : body.question;
      if (typeof text !== "string" || !text.trim() || text.length > 300) { res.writeHead(400).end(); return; }
      const t0 = Date.now();
      const result = url.pathname === "/api/start"
        ? await startFromText(text.trim(), body.today, body.lang)
        : await guide({ question: text.trim(), history: body.history, trip: body.trip, lang: body.lang });
      console.log(`AI ${url.pathname} ${Date.now() - t0}ms`); // 실제 응답 속도 확인용
      res.writeHead(200, { "content-type": MIME[".json"] }).end(JSON.stringify(result));
    } catch (err) { logAIError(err); res.writeHead(503).end(); }
    return;
  }

  // 숙소 안심 체크 (붙여넣은 숙소 페이지 글 분석)
  if (req.method === "POST" && url.pathname === "/api/lodging-check") {
    try {
      const body = JSON.parse(await readBody(req, 20_000));
      if (typeof body.text !== "string" || body.text.trim().length < 20) return json(res, 400, {});
      json(res, 200, await lodgingCheck(body));
    } catch (err) { logAIError(err); res.writeHead(503).end(); }
    return;
  }

  // 메뉴판 사진 → 다국어 메뉴 (사진은 저장하지 않음)
  if (req.method === "POST" && url.pathname === "/api/menu-scan") {
    try {
      const body = JSON.parse(await readBody(req, 6_000_000));
      if (!/^image\/(jpeg|png|webp)$/.test(body.mediaType || "") || typeof body.image !== "string") return json(res, 400, {});
      json(res, 200, await menuScan(body));
    } catch (err) { logAIError(err); res.writeHead(503).end(); }
    return;
  }

  // 가게 등록·조회
  if (url.pathname === "/api/shops") {
    if (req.method === "GET") {
      const shops = await loadShops();
      const id = url.searchParams.get("id"), region = url.searchParams.get("region");
      if (id) { const shop = shops.find((x) => x.id === id); return shop ? json(res, 200, shop) : json(res, 404, {}); }
      return json(res, 200, shops.filter((x) => !region || x.region === region).map(({ id, name, region, address, hours, items }) => ({ id, name, region, address, hours, count: items.length })));
    }
    if (req.method === "POST") {
      try {
        const b = JSON.parse(await readBody(req, 200_000));
        const items = (Array.isArray(b.items) ? b.items : []).slice(0, 80)
          .map((i) => ({ ko: clean(i.ko, 60), price: clean(i.price, 30), en: clean(i.en, 120), ja: clean(i.ja, 120), zh: clean(i.zh, 120), note: clean(i.note, 120) }))
          .filter((i) => i.ko);
        const shop = {
          id: randomBytes(5).toString("hex"),
          name: clean(b.name, 40), region: REGIONS[b.region] ? b.region : null,
          address: clean(b.address, 100), phone: clean(b.phone, 20), hours: clean(b.hours, 60),
          card: !!b.card, items, createdAt: new Date().toISOString(),
        };
        if (!shop.name || !shop.region || !items.length) return json(res, 400, { error: "가게 이름, 권역, 메뉴 1개 이상이 필요해요" });
        await saveShop(shop);
        return json(res, 200, { id: shop.id });
      } catch { return json(res, 400, {}); }
    }
  }

  // 다국어 메뉴 QR 코드
  if (req.method === "GET" && url.pathname === "/api/qr") {
    const id = (url.searchParams.get("id") || "").replace(/[^a-f0-9]/g, "");
    if (!id) { res.writeHead(400).end(); return; }
    const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0];
    const origin = `${proto}://${req.headers.host}`;
    const svg = await QRCode.toString(`${origin}/menu.html?id=${id}`, { type: "svg", margin: 1, color: { dark: "#111111", light: "#ffffff" } });
    res.writeHead(200, { "content-type": MIME[".svg"] }).end(svg);
    return;
  }

  // 장소 사진: 한국관광공사 TourAPI (TOUR_API_KEY가 있을 때만)
  if (req.method === "GET" && url.pathname === "/api/photo") {
    // 앱 데이터에 있는 장소만 (이름·좌표·여러 가게 여부를 데이터에서 가져와 같은 검증 규칙으로 찾는다)
    const id = url.searchParams.get("id") || "";
    const place = PLACES.find((p) => p.id === id) || FESTIVALS.find((f) => f.id === id);
    if (!process.env.TOUR_API_KEY) { res.writeHead(404).end(); return; } // 키 없음: 앱이 이후 요청을 건너뜀
    if (!place) { json(res, 200, { url: "" }); return; }
    try {
      if (!photoCache.has(id)) photoCache.set(id, await tourPhoto(place, process.env.TOUR_API_KEY));
      res.writeHead(200, { "content-type": MIME[".json"], "cache-control": "public, max-age=86400" }).end(JSON.stringify({ url: photoCache.get(id) }));
    } catch {
      res.writeHead(502).end();
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }

  let rel;
  try { rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname); }
  catch { res.writeHead(400).end(); return; } // 잘못된 주소
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
      // 파일이 바뀌면(수정 시각) 다시 압축 — 옛 버전을 보내지 않도록
      const mtime = (await stat(file)).mtimeMs;
      const hit = gzipCache.get(file);
      if (hit && hit.mtime === mtime) body = hit.body;
      else { body = gzipSync(body); gzipCache.set(file, { mtime, body }); }
      headers["content-encoding"] = "gzip";
    }
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`포트 ${PORT}을(를) 이미 쓰고 있어요. 다른 포트로 실행하세요: PORT=8081 npm start`);
  else console.error(err.message);
  process.exit(1);
});
process.on("unhandledRejection", (err) => console.error("처리되지 않은 오류:", err?.message || err));

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  console.log(AI_MODEL ? `AI: ${AI_PROVIDER === "claude" ? "Claude" : "OpenAI 호환"} · ${AI_MODEL}` : "AI 키 미설정: AI 기능은 규칙 기반으로 대체됩니다");
});
