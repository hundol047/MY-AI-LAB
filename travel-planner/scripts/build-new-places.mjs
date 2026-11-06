// 장소 확대: 관광공사 초안(reports/new-places-draft.json, 좌표·제목)과 사람이 정한 규칙(scripts/new-places-review.json)을
// 합쳐 public/places-more.js를 만든다. 규칙이 없는 후보는 넣지 않는다.
// 실행: node scripts/build-new-places.mjs
import { readFile, writeFile } from "node:fs/promises";
const draft = JSON.parse(await readFile(new URL("../reports/new-places-draft.json", import.meta.url), "utf8"));
const review = JSON.parse(await readFile(new URL("./new-places-review.json", import.meta.url), "utf8"));
const out = [];
for (const d of draft) {
  const r = review[d.id];
  if (!r || !d.found) continue;
  const { name, cat, ...rule } = r;
  const alias = d.title.replace(/\s*[[(].*$/, "").trim();
  out.push({
    region: d.region, id: d.id, name, ...(alias !== name ? { alias: [alias] } : {}), cat: cat || d.cat, area: d.area, lat: d.lat, lng: d.lng,
    ...rule, wiki: alias, kto: String(d.contentid),
  });
}
// 관광공사 항목 하나로 대응하지 않는 "읍내 식당가"처럼 사람이 좌표를 정한 곳 (review에 region·area·lat·lng가 있음)
for (const [id, r] of Object.entries(review)) {
  if (id.startsWith("_") || out.some((p) => p.id === id) || !(r.lat && r.lng && r.area && r.region)) continue;
  const { name, cat, region, area, lat, lng, ...rule } = r;
  out.push({ region, id, name, cat, area, lat, lng, ...rule, wiki: rule.wiki || name });
}
const body = `// 2026년 11월 장소 확대: 18개 시군이 모두 일정에 들어가도록 더한 곳 (scripts/build-new-places.mjs가 만듦 — 직접 고치지 말고 new-places-review.json을 고친다)
// 운영시간·휴무는 한국관광공사 소개정보 원문을 사람이 보고 정했다 (reports/new-places.md)
export const MORE_PLACES = [
${out.map((p) => "  " + JSON.stringify(p).replace(/"(\w+)":/g, "$1: ")).join(",\n")},
];
`;
await writeFile(new URL("../public/places-more.js", import.meta.url), body);
console.log(`places-more.js: ${out.length}곳`);
