// 장소·축제 좌표를 외부 자료와 비교해 어긋난 곳을 찾고, --write로 고친다.
// 실행: node scripts/check-coords.mjs [--write [--only=id1,id2]]
// 출처 (있는 키 순서대로):
//   1) KAKAO_REST_KEY    카카오 로컬 장소 검색
//   2) TOUR_API_KEY      한국관광공사 TourAPI (무료, 사진·영문과 같은 키). 이름 대조 규칙(scripts/tour-api.mjs)을 통과한
//                        강원 지역 결과만 쓴다. 관광공사에 없는 곳(작은 가게 등)은 "결과 없음"으로 남는다.
//   3) 키가 없으면 오픈스트리트맵(Nominatim) (1초에 1번 제한을 지킴, 한국 장소 정확도 낮음)
import { readFile, writeFile } from "node:fs/promises";
import { PLACES, FESTIVALS, LODGING } from "../public/data.js";
import { candidates, maxKmFor } from "./tour-api.mjs";

const WRITE = process.argv.includes("--write");
// --only=id1,id2: 눈으로 확인한 곳만 고친다 (다른 지점·긴 해변처럼 자동으로 고치면 안 되는 경우가 있음)
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const LIMIT_KM = 1.0; // 이보다 멀면 어긋난 것으로 본다
const KEY = process.env.KAKAO_REST_KEY;
const TOUR = !KEY && process.env.TOUR_API_KEY;
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

// 관광공사: 이름이 같은 곳으로 판정된 강원(법정동 51) 결과. 같은 이름의 먼 곳(다른 시군)은 30km 밖이면 버린다.
async function tourapi(place) {
  const list = await candidates("KorService2", place, { cache: true });
  return list
    .filter((c) => c.ok && (c.lDongRegnCd === "51" || /강원/.test(c.addr1 || "")) && c.km < 30)
    .sort((a, b) => b.score - a.score || a.km - b.km)
    .slice(0, 1)
    .map((c) => ({ lat: +c.mapy, lng: +c.mapx, label: `${c.title} · ${c.addr1}` }));
}

async function nominatim(q) {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.search = new URLSearchParams({ q: `${q} 강원특별자치도`, format: "jsonv2", limit: "3", "accept-language": "ko" });
  const r = await fetch(u, { headers: { "User-Agent": "ohneul-gangwon-coord-check/1.0" } });
  await sleep(1100);
  if (!r.ok) return [];
  return (await r.json()).map((d) => ({ lat: +d.lat, lng: +d.lon, label: d.display_name.split(",")[0] }));
}

// 관광공사는 시장·거리 자체 등록만 인정하므로 여러 가게가 모인 곳(multi)도 검사할 수 있다
const targets = [
  ...PLACES.filter((p) => TOUR || !p.multi).map((p) => ({ id: p.id, q: p.name.replace(/[·()]/g, " "), lat: p.lat, lng: p.lng, place: p })),
  ...FESTIVALS.filter((f) => f.start).map((f) => ({ id: f.id, q: f.name, lat: f.lat, lng: f.lng, place: f })),
];
console.log(`출처: ${KEY ? "카카오" : TOUR ? "한국관광공사 TourAPI" : "오픈스트리트맵"}\n`);
const fixes = [];
for (const t of targets) {
  let found = [];
  try { found = KEY ? await kakao(t.q, t) : TOUR ? await tourapi(t.place) : await nominatim(t.q); }
  catch (e) { console.log(`!  ${t.q}: 지도 서비스에 연결하지 못함 (${e.cause?.code || e.message})`); if (t === targets[0]) { console.log("네트워크를 확인한 뒤 다시 실행하세요."); process.exit(1); } continue; }
  if (!found.length) { console.log(`?  ${t.q}: 검색 결과 없음 (직접 확인 필요)`); continue; }
  const best = found.sort((a, b) => km(t, a) - km(t, b))[0];
  const d = km(t, best);
  if (d > maxKmFor(t.place, LIMIT_KM)) { console.log(`✗  ${t.q}: ${d.toFixed(1)}km 어긋남 → ${best.lat.toFixed(4)}, ${best.lng.toFixed(4)} (${best.label})`); fixes.push({ ...t, to: best }); }
  else console.log(`✓  ${t.q}: ${d.toFixed(2)}km`);
}
console.log(`\n어긋난 곳 ${fixes.length}곳 / 검사 ${targets.length}곳 (숙소 지역 ${LODGING.length}곳은 넓은 지역이라 제외)`);

if (ONLY.length) fixes.splice(0, fixes.length, ...fixes.filter((f) => ONLY.includes(f.id)));
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
