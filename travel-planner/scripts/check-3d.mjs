// 장소 3D 화면 점검: 모든 장소에서 3D 화면에 필요한 자료가 실제로 오는지 확인한다.
//  - 위성 사진(Esri World Imagery): 17·18단계 조각이 오는지, "자료 없음" 안내 그림(작은 회색 그림)이 아닌지
//  - 지형 고도: 조각이 오는지, 장소 좌표가 바다·물 위(0.5m 이하)로 읽히지 않는지
//  - 지도 조각(OpenFreeMap): 둘레 400m에 건물·걷는 길·도로가 있는지
//  - 좌표가 강원 범위 안인지
// 출력: reports/view3d-check.md   실행: node scripts/check-3d.mjs  (프록시를 거치는 곳에서는 NODE_USE_ENV_PROXY=1)
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { decodePng, tileXY, tilesAround } from "./bake-walk-info.mjs";
import { PLACES } from "../public/data.js";

const SAT = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const TERRAIN = (x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/${x}/${y}.png`;
const xyAt = (lng, lat, z) => { const n = 2 ** z; return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n)]; };
async function get(url) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (res?.ok) return Buffer.from(await res.arrayBuffer());
    if (res && res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return undefined; // 받지 못함(일시 오류)
}
const meta = JSON.parse((await get("https://tiles.openfreemap.org/planet")).toString());
const tpl = meta.tiles[0];
const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const places = PLACES.filter((p) => p.cat !== "festival");
const rows = [], satHash = new Map();
let done = 0;
async function check(p) {
  const r = { id: p.id, name: p.name, issues: [] };
  if (!(p.lat > 36.9 && p.lat < 38.7 && p.lng > 127 && p.lng < 129.5)) { r.issues.push("좌표가 강원 범위 밖"); return r; }
  for (const z of [17, 18]) {
    const [x, y] = xyAt(p.lng, p.lat, z);
    const b = await once(`s${z}/${x}/${y}`, () => get(SAT(z, x, y)));
    r[`sat${z}`] = b ? b.length : b === null ? 0 : -1;
    if (b) { const h = createHash("md5").update(b).digest("hex"); if (!satHash.has(h)) satHash.set(h, new Set()); satHash.get(h).add(`${z}/${x}/${y}`); r[`h${z}`] = h; } // 서로 다른 조각인데 그림이 똑같은지 본다
  }
  const [fx, fy] = tileXY(p.lng, p.lat), tx = Math.floor(fx), ty = Math.floor(fy);
  const d = await once(`d/${tx}/${ty}`, async () => { const b = await get(TERRAIN(tx, ty)); return b ? decodePng(b) : b; });
  if (d) { const px = Math.min(d.w - 1, Math.floor((fx - tx) * d.w)), py = Math.min(d.h - 1, Math.floor((fy - ty) * d.h)), i = (py * d.w + px) * d.bpp; r.elev = Math.round(d.px[i] * 256 + d.px[i + 1] + d.px[i + 2] / 256 - 32768); } else r.elev = null;
  r.bld = 0; r.road = 0; r.path = 0;
  for (const [x, y] of tilesAround(p.lng, p.lat, 400)) {
    const t = await once(`v/${x}/${y}`, async () => { const b = await get(tpl.replace("{z}", 14).replace("{x}", x).replace("{y}", y)); return b ? new VectorTile(new PbfReader(b)) : b; });
    if (!t) { if (t === undefined) r.issues.push("지도 조각을 받지 못함"); continue; }
    r.bld += t.layers.building?.length || 0;
    const tr = t.layers.transportation;
    for (let i = 0; i < (tr?.length || 0); i++) (tr.feature(i).properties.class === "path" ? r.path++ : r.road++);
  }
  return r;
}
// 한 번에 8곳씩
for (let i = 0; i < places.length; i += 8) {
  rows.push(...(await Promise.all(places.slice(i, i + 8).map(check))));
  if ((done += 8) % 80 === 0) process.stdout.write(`${done} `);
}
// "자료 없음" 안내 그림: 여러 곳에서 똑같은 조각이 나오면 그것으로 본다 (바다 한가운데 등 실제로 같은 그림일 수도 있어 3곳 이상일 때만)
const placeholder = new Set([...satHash].filter(([, set]) => set.size >= 3).map(([h]) => h));
for (const r of rows) {
  if (r.sat17 === undefined) continue;
  for (const z of [17, 18]) {
    if (r[`sat${z}`] === -1) r.issues.push(`위성 사진 ${z}단계를 받지 못함(일시 오류일 수 있음)`);
    else if (r[`sat${z}`] === 0 || placeholder.has(r[`h${z}`])) r[`noSat${z}`] = true;
    else if (r[`sat${z}`] < 2500) r[`flat${z}`] = true; // 아주 작은 그림 = 한 가지 색(바다·호수 한가운데). 사진이 없는 것은 아니다
  }
  if (r.noSat17) r.issues.push("위성 사진 없음(17단계) — 3D 화면이 비어 보임");
  else if (r.noSat18) r.notes = [...(r.notes || []), "가까이 당기면(18단계) 위성 사진이 흐림"];
  if (r.flat17 && !r.noSat17) r.notes = [...(r.notes || []), "좌표가 바다·호수 위라 3D 화면이 물만 보임(전망대·호수공원·항구) — 화면을 움직여 뭍을 봐야 함"];
  if (r.elev === null) r.issues.push("지형 고도 없음");
  else if (r.elev <= 0) r.notes = [...(r.notes || []), `좌표가 물 위·해수면(${r.elev}m)으로 읽힘 — 경사는 '모름'으로 나옴`];
  if (!r.bld && !r.road && !r.path) r.issues.push("둘레 400m에 건물·도로·걷는 길 지도 자료가 전혀 없음");
  else if (!r.path) r.notes = [...(r.notes || []), "걷는 길 지도 자료 없음(요약 칸에 '자료 없음'으로 표시됨)"];
}
const bad = rows.filter((r) => r.issues.length), noted = rows.filter((r) => !r.issues.length && r.notes?.length);
await writeFile(new URL("../reports/view3d-check.md", import.meta.url), ["# 장소 3D 화면 점검", "",
  `생성: node scripts/check-3d.mjs (${new Date().toISOString().slice(0, 10)}) · 장소 ${rows.length}곳`, "",
  `- 문제 없음: ${rows.length - bad.length - noted.length}곳`, `- 볼 수는 있지만 알아둘 점 있음: ${noted.length}곳`, `- 문제 있음: ${bad.length}곳`, "",
  `## 문제 있음 (${bad.length}곳)`, "", ...bad.map((r) => `- ${r.name} (${r.id}): ${r.issues.join(" / ")}`), "",
  `## 알아둘 점 (${noted.length}곳)`, "", ...noted.map((r) => `- ${r.name} (${r.id}): ${r.notes.join(" / ")}`), ""].join("\n"));
const tally = {}; for (const r of rows) for (const s of [...r.issues, ...(r.notes || [])]) { const k = s.replace(/\(-?\d+m\)/, "").slice(0, 40); tally[k] = (tally[k] || 0) + 1; }
console.log(`\n장소 ${rows.length}곳 · 문제 ${bad.length}곳 · 알아둘 점 ${noted.length}곳`); console.log(tally);
console.log("자료 없음 그림", placeholder.size, "종", [...satHash].filter(([, set]) => set.size >= 2).map(([h, set]) => `${h.slice(0, 6)}×${set.size}`).join(" "));
