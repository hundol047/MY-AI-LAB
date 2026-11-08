import {loadLodgings} from "./lodging-api.mjs";
import {createPushSender,startPushWorker} from './web-push.mjs';
import { scheduleMaintenance } from "./maintenance.mjs";
import { serviceAPI } from "./service-api.mjs";
// 정적 파일 + 공식 사진 + 가게 등록. 대화와 숙소 문구 점검은 브라우저의 내장 가이드가 처리한다.
// 장소 선택·시간 계산은 내장 데이터 기반 엔진이 한다.
// 그래서 존재하지 않는 장소나 문 닫은 곳이 일정에 들어갈 수 없다.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import QRCode from "qrcode";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tourPhoto } from "./scripts/photo-sources.mjs";
import { fetchWarnings } from "./scripts/kma-warnings.mjs";
import { PLACES, FESTIVALS } from "./public/data.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT || 8080);
let pushSender=null;
try {pushSender=await createPushSender({keyFile:path.join(path.dirname(process.env.APP_DB_PATH || path.join(here,'.local','app.sqlite')),'vapid.json'),appURL:process.env.PUBLIC_APP_URL});}catch{console.error('웹 푸시 키를 초기화하지 못했습니다.');}
const services = serviceAPI({file:process.env.APP_DB_PATH || path.join(here,".local","app.sqlite"),adminToken:process.env.ADMIN_API_TOKEN,pushSender});
if(pushSender)startPushWorker(services.store,pushSender);
try { const legacy=JSON.parse(await readFile(path.join(here,"data","shops.json"),"utf8")); if(Array.isArray(legacy))services.store.importShops(legacy); } catch { /* 기존 파일 없음: 새 승인 목록을 사용 */ }
scheduleMaintenance(services.store,process.env.APP_BACKUP_DIR || path.join(path.dirname(process.env.APP_DB_PATH || path.join(here,".local","app.sqlite")),"backups"));

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
const lodgingCache=new Map();
let lodgingRequests=0;
const gzipCache = new Map();

const json = (res, code, obj) => res.writeHead(code, { "content-type": MIME[".json"] }).end(JSON.stringify(obj));

// 요청 하나에서 오류가 나도 서버 전체가 꺼지지 않게 감싼다
let warningsCache = null;
const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("요청 처리 오류:", req.method, req.url, err.message);
    if (!res.headersSent) res.writeHead(500).end(); else res.end();
  });
});

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (await services(req,res,url)) return;

  if(req.method==='GET' && url.pathname==='/api/lodgings'){
    const point={lat:Number(url.searchParams.get('lat')),lng:Number(url.searchParams.get('lng'))};
    if(!url.searchParams.has('lat')||!url.searchParams.has('lng')||!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||point.lat<33||point.lat>39||point.lng<124||point.lng>132)return json(res,400,{error:'INVALID_LOCATION'});
    const cacheKey=point.lat.toFixed(3)+','+point.lng.toFixed(3),hit=lodgingCache.get(cacheKey);
    if(hit&&Date.now()-hit.at<1800000)return json(res,200,{hotels:hit.hotels});
    if(lodgingRequests>=4)return json(res,429,{error:'TRY_LATER'});
    lodgingRequests++;
    try{const hotels=await loadLodgings(point,{key:process.env.TOUR_API_KEY||process.env.BOPok_TOURAPI_KEY});if(lodgingCache.size>=100)lodgingCache.delete(lodgingCache.keys().next().value);lodgingCache.set(cacheKey,{at:Date.now(),hotels});return json(res,200,{hotels});}
    catch(e){return json(res,e.status||502,{error:e.status===503?'PROVIDER_NOT_CONFIGURED':'PROVIDER_UNAVAILABLE'});}finally{lodgingRequests--;}
  }

  // 내장 가이드만 사용한다. 예전 클라이언트 요청도 유료 모델로 전달하지 않는다.
  if (["/api/start", "/api/guide", "/api/guide-translate", "/api/lodging-check", "/api/menu-scan"].includes(url.pathname)) {
    return json(res, 410, {error:"LOCAL_GUIDE_ONLY", message:"Use the built-in travel guide. Menu entry is manual."});
  }

  // 기상특보: 서버의 TOUR_API_KEY(공공데이터포털 키)로 기상청 특보 현황을 받아 30분 동안 재사용한다 (키는 브라우저로 보내지 않는다)
  if (req.method === "GET" && url.pathname === "/api/warnings") {
    try {
      if (!warningsCache || Date.now() - warningsCache.at > 30 * 60e3) warningsCache = { at: Date.now(), data: await fetchWarnings(process.env.TOUR_API_KEY) };
      return json(res, 200, warningsCache.data);
    } catch { return json(res, 503, { error: "WARNINGS_UNAVAILABLE" }); }
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
