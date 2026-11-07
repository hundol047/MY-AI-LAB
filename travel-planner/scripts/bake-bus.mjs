// 권역 안 시내·농어촌버스: 국토교통부 TAGO 버스노선정보(BusRouteInfoInqireService)로
// 앱 장소마다 400m 안 정류장을 지나는 노선의 첫차·막차·배차 간격을 붙인다.
// - TAGO가 노선을 주는 강원 시군: 춘천·원주(횡성 포함)·태백·홍천·철원 (강릉·속초 등은 TAGO에 없다)
// - 노선 목록 1회 + 노선마다 경유 정류장 1회 + 장소 근처 노선만 상세 1회 (하루 한도 약 1000회 안)
// - 응답은 .cache/bus/에 하루 동안 저장해 다시 돌릴 때 호출을 아낀다
// 출력: public/bus.json ({builtAt, cities, places: {장소 id: {stop, m, routes: [{no, tp, first, last, gap}]}}}), reports/bus.md
// 실행: TOUR_API_KEY=공공데이터포털키 node scripts/bake-bus.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY(공공데이터포털 인증키)가 필요합니다"); process.exit(1); }
const CACHE = new URL("../.cache/bus/", import.meta.url);
await mkdir(CACHE, { recursive: true });
let calls = 0;
async function call(op, params) {
  const pub = new URLSearchParams({ _type: "json", ...params }).toString();
  const file = new URL(createHash("sha1").update(`${op}?${pub}`).digest("hex") + ".json", CACHE);
  const hit = await readFile(file, "utf8").then(JSON.parse).catch(() => null);
  if (hit && Date.now() - hit.at < 864e5) return hit.items;
  for (let i = 0; i < 4; i++) {
    calls++;
    const res = await fetch(`https://apis.data.go.kr/1613000/BusRouteInfoInqireService/${op}?serviceKey=${encodeURIComponent(key)}&${pub}`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!res) { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); continue; }
    const j = await res.json().catch(() => null);
    const code = j?.response?.header?.resultCode;
    if (code !== "00") throw new Error(`${op}: HTTP ${res.status}, 결과 코드 ${String(code || j?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode || "?").replace(/[^\w]/g, "")}`);
    const it = j.response.body?.items?.item || [];
    const items = Array.isArray(it) ? it : [it];
    await writeFile(file, JSON.stringify({ at: Date.now(), items }));
    return items;
  }
  throw new Error(`${op}: 연결 실패`);
}

const CITIES = { 32010: "춘천", 32020: "원주·횡성", 32050: "태백", 32310: "홍천", 32360: "철원" };
const RADIUS = 400; // m
const hm = (v) => { if (v == null || v === "") return null; const s = String(v).padStart(4, "0"); return /^\d{4}$/.test(s) && +s.slice(0, 2) < 30 ? `${s.slice(0, 2)}:${s.slice(2)}` : null; };
const dist = (a, b) => Math.round(Math.hypot((a.lat - b.lat) * 111000, (a.lng - b.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180)));

const { PLACES } = await import("../public/data.js");
const spots = PLACES.filter((p) => p.lat && p.lng);
const near = {}; // 장소 id → [{routeKey, stop, m}]
const routes = new Map(); // `${city}:${routeid}` → {city, id, no, tp, first, last}
const log = [];
for (const [city, name] of Object.entries(CITIES)) {
  const list = await call("getRouteNoList", { cityCode: city, numOfRows: "500", pageNo: "1" });
  let served = 0;
  for (const r of list) {
    const stops = await call("getRouteAcctoThrghSttnList", { cityCode: city, routeId: r.routeid, numOfRows: "400", pageNo: "1" }).catch(() => []);
    const rk = `${city}:${r.routeid}`;
    routes.set(rk, { city, id: r.routeid, no: String(r.routeno), tp: r.routetp || "", first: hm(r.startvehicletime), last: hm(r.endvehicletime) });
    let any = false;
    for (const p of spots) {
      let best = null;
      for (const s of stops) { if (!s.gpslati) continue; const m = dist(p, { lat: +s.gpslati, lng: +s.gpslong }); if (m <= RADIUS && (!best || m < best.m)) best = { stop: s.nodenm, m }; }
      if (best) { (near[p.id] ??= []).push({ rk, ...best }); any = true; }
    }
    if (any) served++;
  }
  log.push(`${name}: 노선 ${list.length}개 · 앱 장소 근처를 지나는 노선 ${served}개`);
}
// 장소 근처 노선만 상세(배차 간격)를 받는다
const need = new Set(Object.values(near).flat().map((x) => x.rk));
for (const rk of need) {
  const r = routes.get(rk);
  const [d] = await call("getRouteInfoIem", { cityCode: r.city, routeId: r.id }).catch(() => [null]);
  if (!d) continue;
  r.first = hm(d.startvehicletime) || r.first;
  r.last = hm(d.endvehicletime) || r.last;
  // 첫차가 비어 있는 노선은 배차 간격이 음수(-1265 등)로 온다 → 1~300분만 믿는다
  const ok = (v) => (Number(v) > 0 && Number(v) <= 300 ? Number(v) : null);
  r.gap = ok(d.intervaltime);
}
// 장소마다: 같은 번호 노선(방면·회차 다른 노선)은 하나로 합쳐 가장 이른 첫차·늦은 막차를 쓴다. 하루 1회뿐인 노선(첫차=막차)도 그대로 보여 준다
const places = {};
for (const [id, list] of Object.entries(near)) {
  const by = new Map();
  for (const x of list) {
    const r = routes.get(x.rk);
    if (!r.first && !r.last) continue;
    const o = by.get(r.no);
    if (!o) { by.set(r.no, { no: r.no, tp: r.tp, first: r.first, last: r.last, gap: r.gap || null, stop: x.stop, m: x.m }); continue; }
    if (r.first && (!o.first || r.first < o.first)) o.first = r.first;
    if (r.last && (!o.last || r.last > o.last)) o.last = r.last;
    if (r.gap && (!o.gap || r.gap < o.gap)) o.gap = r.gap;
    if (x.m < o.m) { o.stop = x.stop; o.m = x.m; }
  }
  // 등하교·출근 특별 노선처럼 운행 시간이 3시간도 안 되는 노선은 여행자에게 쓸모가 적어, 다른 노선이 있으면 뺀다
  const mins = (t) => (t ? +t.slice(0, 2) * 60 + +t.slice(3) : null);
  const all = [...by.values()];
  const long = all.filter((r) => !(r.first && r.last && mins(r.last) - mins(r.first) < 180));
  const rs = (long.length ? long : all).sort((a, b) => (a.gap || 999) - (b.gap || 999) || a.m - b.m || a.no.localeCompare(b.no, "ko", { numeric: true }));
  if (!rs.length) continue;
  const top = rs[0];
  const shown = rs.slice(0, 6);
  // 요약의 막차는 카드에 보이는 노선 중에서 고른다 (안 보이는 노선의 막차를 쓰면 근거를 찾을 수 없다)
  places[id] = { stop: top.stop, m: top.m, last: shown.reduce((a, r) => (r.last && r.last > a ? r.last : a), ""), routes: shown.map(({ no, tp, first, last, gap, stop, m }) => ({ no, tp, first, last, gap, stop, m })) };
}
if (!Object.keys(places).length) throw new Error("근처 버스를 하나도 찾지 못했습니다. 기존 파일을 유지합니다.");
const out = { builtAt: new Date().toISOString(), source: "국토교통부 TAGO 버스노선정보", cities: Object.values(CITIES), radius: RADIUS, places };
await writeFile(new URL("../public/bus.json", import.meta.url), JSON.stringify(out) + "\n");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
const names = Object.fromEntries(PLACES.map((p) => [p.id, p.name]));
await writeFile(new URL("../reports/bus.md", import.meta.url), [
  "# 장소 근처 시내·농어촌버스 (국토교통부 TAGO 버스노선정보)", "",
  `생성: node scripts/bake-bus.mjs. 정류장 ${RADIUS}m 안. TAGO가 노선을 주는 시군만: ${Object.values(CITIES).join(", ")}.`, "",
  ...log.map((l) => `- ${l}`), "", `장소 ${Object.keys(places).length}곳에 버스 정보를 붙였다.`, "",
  "| 장소 | 정류장 | 노선 (첫차–막차, 배차) |", "|---|---|---|",
  ...Object.entries(places).map(([id, v]) => `| ${names[id] || id} | ${v.stop} ${v.m}m | ${v.routes.map((r) => `${r.no}번 ${r.first || "?"}–${r.last || "?"}${r.gap ? ` ${r.gap}분` : ""}`).join(", ")} |`), "",
].join("\n"));
console.log(`장소 ${Object.keys(places).length}곳 · API 호출 ${calls}회 → public/bus.json, reports/bus.md`);
