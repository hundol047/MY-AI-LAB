// 장소·숙소 지역·축제 좌표를 지도 서비스 검색 결과와 비교해 어긋난 곳을 찾고, --write로 고친다.
// 실행: KAKAO_REST_KEY=키 node scripts/check-coords.mjs [--write]
//   KAKAO_REST_KEY가 없으면 오픈스트리트맵(Nominatim)으로 검색한다 (1초에 1번 제한을 지킴).
import { readFile, writeFile } from "node:fs/promises";
import { PLACES, FESTIVALS, LODGING } from "../public/data.js";

const WRITE = process.argv.includes("--write");
const LIMIT_KM = 1.0; // 이보다 멀면 어긋난 것으로 본다
const KEY = process.env.KAKAO_REST_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function kakao(q, near) {
  const u = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  u.search = new URLSearchParams({ query: q, x: near.lng, y: near.lat, sort: "distance", size: "5" });
  const r = await fetch(u, { headers: { Authorization: `KakaoAK ${KEY}` } });
  if (!r.ok) return [];
  const j = await r.json();
  return j.documents.filter((d) => /강원/.test(d.address_name || d.road_address_name)).map((d) => ({ lat: +d.y, lng: +d.x, label: d.place_name }));
}

async function nominatim(q) {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.search = new URLSearchParams({ q: `${q} 강원특별자치도`, format: "jsonv2", limit: "3", "accept-language": "ko" });
  const r = await fetch(u, { headers: { "User-Agent": "ohneul-gangwon-coord-check/1.0" } });
  await sleep(1100);
  if (!r.ok) return [];
  return (await r.json()).map((d) => ({ lat: +d.lat, lng: +d.lon, label: d.display_name.split(",")[0] }));
}

const targets = [
  ...PLACES.filter((p) => !p.multi).map((p) => ({ id: p.id, q: p.name.replace(/[·()]/g, " "), lat: p.lat, lng: p.lng })),
  ...FESTIVALS.filter((f) => f.start).map((f) => ({ id: f.id, q: f.name, lat: f.lat, lng: f.lng })),
];
const fixes = [];
for (const t of targets) {
  let found = [];
  try { found = KEY ? await kakao(t.q, t) : await nominatim(t.q); }
  catch (e) { console.log(`!  ${t.q}: 지도 서비스에 연결하지 못함 (${e.cause?.code || e.message})`); if (t === targets[0]) { console.log("네트워크를 확인한 뒤 다시 실행하세요."); process.exit(1); } continue; }
  if (!found.length) { console.log(`?  ${t.q}: 검색 결과 없음 (직접 확인 필요)`); continue; }
  const best = found.sort((a, b) => km(t, a) - km(t, b))[0];
  const d = km(t, best);
  if (d > LIMIT_KM) { console.log(`✗  ${t.q}: ${d.toFixed(1)}km 어긋남 → ${best.lat.toFixed(4)}, ${best.lng.toFixed(4)} (${best.label})`); fixes.push({ ...t, to: best }); }
  else console.log(`✓  ${t.q}: ${d.toFixed(2)}km`);
}
console.log(`\n어긋난 곳 ${fixes.length}곳 / 검사 ${targets.length}곳 (숙소 지역 ${LODGING.length}곳은 넓은 지역이라 제외)`);

if (WRITE && fixes.length) {
  const file = new URL("../public/data.js", import.meta.url);
  let src = await readFile(file, "utf8");
  for (const f of fixes) {
    const i = src.indexOf(`id: "${f.id}"`);
    const end = src.indexOf("}", i);
    const block = src.slice(i, end)
      .replace(/lat: [\d.]+/, `lat: ${f.to.lat.toFixed(4)}`)
      .replace(/lng: [\d.]+/, `lng: ${f.to.lng.toFixed(4)}`);
    src = src.slice(0, i) + block + src.slice(end);
  }
  await writeFile(file, src);
  console.log("public/data.js 좌표를 고쳤습니다. 결과를 눈으로 한 번 확인하세요.");
}
