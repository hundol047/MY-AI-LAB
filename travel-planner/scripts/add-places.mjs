// 새 장소 한꺼번에 넣기: 사람이 확인한 장소 묶음(JSON)을 일정 규칙·번역·안내 파일에 모두 넣는다.
// 입력: [{ id, review: {name, cat, region, area, lat, lng, kto, hours, closed, ...}, en: {name, desc}, ko: "안내", enTip: "Tip", ja: [이름, 안내], zh: [이름, 안내] }]
// 넣는 곳: scripts/new-places-review.json, scripts/en-manual.json, scripts/new-places-intl.json, public/data-en.json,
//          public/knowledge.js(TIPS·TIPS_EN), public/knowledge-intl.js(NAMES_JA·NAMES_ZH·TIPS_JA·TIPS_ZH) → 그 뒤 build-new-places.mjs
// 이미 있는 id는 건너뛴다. 실행: node scripts/add-places.mjs 묶음.json && node scripts/build-new-places.mjs
import { readFile, writeFile } from "node:fs/promises";

const U = (p) => new URL(p, import.meta.url);
const rows = JSON.parse(await readFile(process.argv[2], "utf8"));
const readJ = async (p) => JSON.parse(await readFile(U(p), "utf8"));
const review = await readJ("./new-places-review.json");
const en = await readJ("./en-manual.json");
const intl = await readJ("./new-places-intl.json");
const dataEn = await readJ("../public/data-en.json");
let know = await readFile(U("../public/knowledge.js"), "utf8");
let kintl = await readFile(U("../public/knowledge-intl.js"), "utf8");
const q = (s) => JSON.stringify(s);
// "export const NAME = {" 바로 아래 줄에 넣는다
const addTo = (src, name, id, val) => {
  const head = `export const ${name} = {`;
  const i = src.indexOf(head); if (i < 0) throw new Error(`${name} 없음`);
  return src.slice(0, i + head.length) + `\n  ${q(id)}: ${q(val)},` + src.slice(i + head.length);
};
let added = 0;
for (const r of rows) {
  if (review[r.id]) { console.log("이미 있음:", r.id); continue; }
  for (const k of ["name", "cat", "region", "area", "lat", "lng", "hours"]) if (r.review[k] == null) throw new Error(`${r.id}: review.${k} 없음`);
  if (!r.en?.name || !r.ko || !r.enTip || r.ja?.length !== 2 || r.zh?.length !== 2) throw new Error(`${r.id}: 번역·안내 빠짐`);
  review[r.id] = r.review;
  en[r.id] = { name: r.en.name, desc: r.en.desc };
  intl[r.id] = [r.ja[0], r.zh[0], r.ja[1], r.zh[1]];
  dataEn[r.id] = { name: r.en.name, nameSrc: "app", desc: r.en.desc, descSrc: "app" };
  know = addTo(know, "TIPS", r.id, r.ko);
  know = addTo(know, "TIPS_EN", r.id, r.enTip);
  kintl = addTo(kintl, "NAMES_JA", r.id, r.ja[0]);
  kintl = addTo(kintl, "NAMES_ZH", r.id, r.zh[0]);
  kintl = addTo(kintl, "TIPS_JA", r.id, r.ja[1]);
  kintl = addTo(kintl, "TIPS_ZH", r.id, r.zh[1]);
  added++;
}
await writeFile(U("./new-places-review.json"), JSON.stringify(review, null, 1)); // 이 파일은 끝 줄바꿈이 없다
await writeFile(U("./en-manual.json"), JSON.stringify(en, null, 2) + "\n");
await writeFile(U("./new-places-intl.json"), JSON.stringify(intl, null, 1) + "\n");
await writeFile(U("../public/data-en.json"), JSON.stringify(dataEn, null, 2) + "\n");
await writeFile(U("../public/knowledge.js"), know);
await writeFile(U("../public/knowledge-intl.js"), kintl);
console.log(`새 장소 ${added}곳을 넣었어요. 다음: node scripts/build-new-places.mjs`);
