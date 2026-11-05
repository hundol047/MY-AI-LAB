import { serviceAPI } from "./service-api.mjs";
// 정적 파일 + 공식 사진 + 가게 등록. 대화와 숙소 문구 점검은 브라우저의 내장 가이드가 처리한다.
// 장소 선택·시간 계산은 내장 데이터 기반 엔진이 한다.
// 그래서 존재하지 않는 장소나 문 닫은 곳이 일정에 들어갈 수 없다.
import http from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tourPhoto } from "./scripts/photo-sources.mjs";
import { REGIONS, PLACES, FESTIVALS } from "./public/data.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT || 8080);
const services = serviceAPI({file:process.env.APP_DB_PATH || path.join(here,".local","app.sqlite"),adminToken:process.env.ADMIN_API_TOKEN});

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

  if (await services(req,res,url)) return;

  // 내장 가이드만 사용한다. 예전 클라이언트 요청도 유료 모델로 전달하지 않는다.
  if (["/api/start", "/api/guide", "/api/guide-translate", "/api/lodging-check", "/api/menu-scan"].includes(url.pathname)) {
    return json(res, 410, {error:"LOCAL_GUIDE_ONLY", message:"Use the built-in travel guide. Menu entry is manual."});
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
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
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
  console.log("내장 여행 가이드: 유료 AI API를 호출하지 않습니다");
});
