// 화면 언어: 영어 사전에 있는 모든 문구와 지역·숙소·혜택·축제·장소 이름이 일본어·중국어에도 있는지
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JA, ZH, REGION, AREA, BASE, LODGING as LODGING_T, TYPE, REASON, BENEFIT, FEST, SOUVENIR } from "../public/i18n-cjk.js";
import { NAMES_JA, NAMES_ZH, TIPS_JA, TIPS_ZH } from "../public/knowledge-intl.js";
import { PLACES, FESTIVALS, REGIONS, AREAS, LODGING, BENEFITS } from "../public/data.js";

const src = readFileSync(new URL("../public/i18n.js", import.meta.url), "utf8");
const block = src.slice(src.indexOf("const EN = {") + 11, src.indexOf("\n};", src.indexOf("const EN = {")) + 2);
const EN = (0, eval)(`(${block})`);
for (const [name, d] of [["JA", JA], ["ZH", ZH]]) {
  const missing = Object.keys(EN).filter((k) => !Object.hasOwn(d, k));
  assert.deepEqual(missing, [], `${name} 사전에 없는 문구`);
  // {이름} 자리 표시가 같아야 값이 들어간다
  for (const k of Object.keys(EN)) {
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    assert.equal(vars(d[k]), vars(EN[k]), `${name} "${k}"의 {자리} 다름`);
  }
}
for (const l of ["ja", "zh"]) {
  for (const k of Object.keys(REGIONS)) assert.ok(REGION[l][k], `${l} 권역 ${k}`);
  for (const a of Object.values(AREAS)) assert.ok(AREA[l][a.name], `${l} 지역 ${a.name}`);
  for (const r of Object.values(REGIONS)) assert.ok(BASE[l][r.base.name], `${l} 기준 역 ${r.base.name}`);
  for (const x of LODGING) assert.equal(LODGING_T[l][x.id]?.length, 2, `${l} 숙소 지역 ${x.id}`);
  for (const ty of ["guesthouse", "business", "ocean", "pension", "resort", "hanok"]) assert.ok(TYPE[l][ty] && REASON[l][ty], `${l} 숙소 종류 ${ty}`);
  for (const b of BENEFITS) assert.ok(BENEFIT[l][b.id]?.title && BENEFIT[l][b.id]?.how, `${l} 혜택 ${b.id}`);
  for (const f of FESTIVALS) assert.ok(FEST[l][f.id], `${l} 축제 ${f.name}`);
}
for (const s of new Set([...PLACES, ...FESTIVALS].map((p) => p.souvenir).filter(Boolean))) for (const l of ["en", "ja", "zh"]) assert.ok(SOUVENIR[l][s], `${l} 특산물 ${s}`);
for (const p of PLACES) assert.ok(NAMES_JA[p.id] && NAMES_ZH[p.id] && TIPS_JA[p.id] && TIPS_ZH[p.id], `장소 ${p.name}`);
// 화면 HTML의 번역 대상 문구도 모두 사전에 있어야 한다
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
for (const m of html.matchAll(/<(\w+)\b[^>]*\sdata-i18n(?=[\s>])[^>]*>(.*?)<\/\1>/g)) assert.ok(Object.hasOwn(EN, m[2].trim()) && Object.hasOwn(JA, m[2].trim()), `HTML 문구 사전에 없음: ${m[2]}`);
console.log(`ok - 화면 언어 (문구 ${Object.keys(EN).length}개 × 일본어·중국어, 축제 ${FESTIVALS.length}개, 숙소 지역 ${LODGING.length}개)`);
