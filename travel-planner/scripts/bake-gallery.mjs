// 장소 사진 여러 장 (3D 화면 "실내·사진"): 한국관광공사 TourAPI에서 "같은 곳"으로 판정된 항목의 대표 사진 + 추가 사진(detailImage2, 포스터 제외)을
// 장소마다 6장까지 public/gallery.json에 담는다. 판정 규칙은 대표 사진(bake-photos.mjs)과 같다: 이름 대응 + 좌표 2km 안.
// 지역 사진(photoAt)처럼 그 장소 자체가 아닌 사진은 넣지 않는다 — 실내·입구를 확인하는 용도라 다른 곳 사진이 섞이면 안 된다.
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-gallery.mjs   → public/gallery.json, reports/gallery.md
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { PLACES } from "../public/data.js";
import { tourPhotoMatch } from "./photo-sources.mjs";
import { REJECT } from "./bake-photos-reject.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const MAX = 6;
const prev = await readFile(new URL("../public/gallery.json", import.meta.url), "utf8").then(JSON.parse).then((j) => j.places || {}).catch(() => ({}));
const out = {}, lines = [];
let failed = 0;
for (const p of PLACES.filter((x) => !x.petOnly && x.cat !== "festival" && !x.multi)) {
  let r;
  try { r = await tourPhotoMatch(p, key, { cache: true, reject: REJECT[p.id], allowArea: false }); }
  catch (e) { failed++; if (prev[p.id]) out[p.id] = prev[p.id]; if (/22|LIMITED/.test(String(e.message))) { console.error("\n하루 호출 한도 — 받은 데까지 저장합니다"); break; } continue; }
  const urls = (r.urls || []).filter((u) => /^https:\/\/tong\.visitkorea\.or\.kr\//.test(u)).slice(0, MAX);
  if (urls.length >= 2) { out[p.id] = urls; lines.push(`- ${p.name}: ${urls.length}장 (${r.match?.title || ""})`); }
  else if (prev[p.id]) out[p.id] = prev[p.id];
}
// 한도에 걸려 못 돈 장소는 지난 값을 유지
for (const [id, v] of Object.entries(prev)) out[id] ??= v;
await writeFile(new URL("../public/gallery.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), source: "한국관광공사 TourAPI (KorService2 detailImage2)", places: out }).replace(/\],"/g, '],\n"') + "\n");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/gallery.md", import.meta.url), ["# 장소 사진 여러 장 (관광공사 추가 사진)", "", `생성: node scripts/bake-gallery.mjs · 사진 2장 이상인 장소 ${Object.keys(out).length}곳 · 실패 ${failed}곳`, "", ...lines, ""].join("\n"));
console.log(`사진 여러 장 ${Object.keys(out).length}곳 → public/gallery.json (실패 ${failed})`);
