// 모든 장소·날짜 확정 축제의 사진을 한국관광공사 TourAPI에서 찾아 public/photos.json에 저장하고
// 매칭 근거(관광공사 제목·거리)를 reports/photos.md에 남긴다.
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-photos.mjs
//  - 응답은 .cache/tour/에 저장되어 다시 돌려도 호출하지 않는다 (새로 받으려면 폴더 삭제)
//  - 수동 검토로 틀린 매칭을 발견하면 아래 REJECT에 contentid를 넣고 다시 돌린다
import { writeFile, mkdir } from "node:fs/promises";
import { PLACES, FESTIVALS } from "../public/data.js";
import { tourPhotoMatch, MAX_KM } from "./photo-sources.mjs";

// 장소 id → 쓰면 안 되는 관광공사 contentid (리포트를 사람이 보고 판단한 것)
export const REJECT = {};

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다 (data.go.kr 한국관광공사 국문 관광정보 서비스 Decoding 키)"); process.exit(1); }

async function opens(url) {
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1023" } });
    return (r.ok || r.status === 206) && /^image\//.test(r.headers.get("content-type") || "");
  } catch { return false; }
}

const targets = [...PLACES, ...FESTIVALS.filter((f) => f.start)];
const photos = {}, rows = [], dropped = [], missing = [];
const used = new Set();
// 지역 사진(photoAt)을 쓰는 곳은 나중에: 자기 사진이 있는 곳이 먼저 자리를 잡고, 같은 사진이면 다른 컷을 쓴다
const ordered = [...targets.filter((p) => !p.photoAt), ...targets.filter((p) => p.photoAt)];
for (const p of ordered) {
  let r;
  try { r = await tourPhotoMatch(p, key, { cache: true, reject: REJECT[p.id] }); }
  catch (e) { missing.push({ p, why: e.message }); process.stdout.write("!"); continue; }
  let url = "";
  for (const u of r.urls) {
    if (used.has(u)) continue; // 다른 카드와 같은 사진은 피한다
    if (await opens(u)) { url = u; break; }
    dropped.push({ p, title: r.match.title, km: r.match.km, why: "이미지가 https로 열리지 않음" });
  }
  if (url) {
    photos[p.id] = url; used.add(url);
    rows.push({ p, m: r.match, how: r.how + (url !== r.urls[0] ? " · 겹치지 않게 다른 컷" : "") });
  } else missing.push({ p, why: r.match ? "사진이 열리지 않거나 다른 카드와 겹침" : r.registered ? "관광공사에 등록은 있으나 사진이 없음" : r.rejected.length ? "2km 안에 이름이 맞는 사진 없음 (아래 버린 후보 참고)" : "2km 안에 이름이 맞는 결과 없음" });
  for (const x of r.rejected) dropped.push({ p, ...x });
  process.stdout.write(url ? "." : "x");
}
// photos.json은 data.js 순서로
const sorted = Object.fromEntries(targets.filter((p) => photos[p.id]).map((p) => [p.id, photos[p.id]]));
rows.sort((a, b) => targets.indexOf(a.p) - targets.indexOf(b.p));
missing.sort((a, b) => targets.indexOf(a.p) - targets.indexOf(b.p));
await writeFile(new URL("../public/photos.json", import.meta.url), JSON.stringify(sorted, null, 2) + "\n");

const f = (n) => n.toFixed(2);
const esc = (s) => String(s).replace(/\|/g, "\\|");
const md = [
  "# 장소 사진 매칭 리포트", "",
  `출처: 한국관광공사 TourAPI 국문 관광정보(KorService2) searchKeyword2·locationBasedList2의 firstimage. 생성: node scripts/bake-photos.mjs`, "",
  `규칙: 좌표 ${MAX_KM}km 안(탐방로는 길이까지) + 이름 대응(지역명·띄어쓰기 제외, 해변=해수욕장). 여러 가게가 모인 곳(multi)은 거리·시장 자체 결과만. 사진은 대표사진 → 같은 항목의 추가 사진(포스터 제외) → 사람이 검토한 지역 사진(data.js photoAt, 그 거리가 있는 항구·역·시장) 순. 다른 카드와 같은 사진이면 다른 컷. 이미지는 https 열림 확인.`, "",
  `- 대상 ${targets.length}곳 (장소 ${PLACES.length} + 날짜 확정 축제 ${targets.length - PLACES.length})`,
  `- 사진 찾음 ${rows.length}곳 · 못 찾음 ${missing.length}곳 · 버린 후보 ${dropped.length}건`, "",
  "## 찾은 곳", "", "| id | 우리 이름 | 관광공사 제목 | 거리(km) | 판정 | 사진 |", "|---|---|---|---|---|---|",
  ...rows.map(({ p, m, how }) => `| ${p.id} | ${esc(p.name)}${p.multi ? " (multi)" : ""} | ${esc(m.title)} | ${f(m.km)} | ${m.why} | ${esc(how)} |`), "",
  "## 못 찾은 곳", "", "| id | 우리 이름 | 이유 |", "|---|---|---|",
  ...missing.map(({ p, why }) => `| ${p.id} | ${esc(p.name)}${p.multi ? " (multi)" : ""} | ${esc(why)} |`), "",
  "## 버린 후보", "", "| id | 우리 이름 | 관광공사 제목 | 거리(km) | 이유 |", "|---|---|---|---|---|",
  ...dropped.map((d) => `| ${d.p.id} | ${esc(d.p.name)} | ${esc(d.title)} | ${f(d.km)} | ${esc(d.why)} |`), "",
];
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/photos.md", import.meta.url), md.join("\n"));
console.log(`\n사진 ${rows.length}/${targets.length}곳 · 못 찾음 ${missing.length} · 버린 후보 ${dropped.length} → public/photos.json, reports/photos.md`);
