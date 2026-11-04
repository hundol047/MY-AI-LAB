// 장소별 입장료·이용료를 한국관광공사 정보에서 모아 public/fees.json({id: {adult, child, text}})과 reports/fees.md를 만든다.
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-fees.mjs
// - 출처: 반복정보(detailInfo2)의 입장료·관람료·이용요금·시설이용료, 소개정보(detailIntro2)의 usefee(문화시설)·usefeeleports(레포츠)
// - 어른 요금: 대인·어른·성인·일반·개인 뒤의 첫 금액, 어린이 요금: 소인·어린이 뒤의 첫 금액. "무료"만 있으면 0
// - 찾지 못한 곳은 넣지 않는다 (화면에서 "요금 정보 없음"으로 따로 보여 준다)
import { writeFile, mkdir } from "node:fs/promises";
import { PLACES } from "../public/data.js";
import { candidates, tour, maxKmFor } from "./tour-api.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const won = (s) => Number(String(s).replace(/,/g, ""));

export function parseFee(text) {
  const t = clean(text).replace(/\([^)]*\)/g, " "); // "소인(36개월 이상) 7,000원"의 괄호 속 숫자 무시
  if (!t) return null;
  const adult = t.match(/(대인|어른|성인|일반|개인|중학생\s*이상|13세\s*이상)[^0-9/]{0,12}([\d,]{3,})\s*원/);
  const child = t.match(/(소인|어린이|아동|초등학생)[^0-9]{0,12}([\d,]{3,})\s*원/); // "어린이/군인 2,000원"
  const plain = t.match(/^([\d,]{3,})\s*(원)?/) || t.match(/(?:입장료|관람료)\s*([\d,]{3,})\s*원/); // "2,000(춘천사랑상품권 제공)", "입장료 2,000원"
  if (adult || plain) {
    const a = adult ? won(adult[2]) : won(plain[1]);
    return { adult: a, child: child ? won(child[2]) : a };
  }
  if (/무료/.test(t) && !/\d[\d,]*\s*원/.test(t)) return { adult: 0, child: 0 };
  return null;
}

const NAMES = /입장료|관람료|이용요금|이용료|시설이용료/; // 주차요금은 제외
// 관광공사 요금이 그 장소가 아닌 옆 시설 것인 경우 (사람이 원문을 보고 정함)
const OVERRIDE = {
  hwajinpo: { adult: 0, child: 0, text: "화진포 호수는 무료 (역사안보전시관·생태박물관은 별도, 성인 3,000원)" },
  "ganhyeon-park": { adult: 0, child: 0, text: "간현유원지 강변 산책로는 무료 (소금산 그랜드밸리는 별도)" },
  // 관광공사에 요금이 없지만 앱 혜택 데이터(data.js BENEFITS, 지자체 공고)에 입장료가 있는 곳
  "hantan-trail": { adult: 10000, child: 10000, text: "입장료 10,000원 (5,000원은 철원사랑상품권으로 환급) — 앱 혜택 정보" },
  "hoengseong-lake": { adult: 2000, child: 2000, text: "입장료 2,000원 (같은 금액 관광상품권으로 환급) — 앱 혜택 정보" },
};
const INTRO = { 14: "usefee", 28: "usefeeleports" };
const out = {}, rows = [];
for (const p of PLACES.filter((x) => !x.multi && !["food", "cafe"].includes(x.cat))) {
  const list = await candidates("KorService2", p, opts);
  const m = list.find((c) => c.ok && c.km <= maxKmFor(p));
  if (!m) { rows.push({ p, why: "관광공사 항목 없음" }); continue; }
  const texts = [];
  const info = await tour("KorService2", "detailInfo2", { contentId: String(m.contentid), contentTypeId: String(m.contenttypeid) }, opts).catch(() => []);
  for (const x of info) if (NAMES.test(x.infoname || "")) texts.push(`${x.infoname}: ${clean(x.infotext)}`);
  if (INTRO[m.contenttypeid]) {
    const [d] = await tour("KorService2", "detailIntro2", { contentId: String(m.contentid), contentTypeId: String(m.contenttypeid) }, opts).catch(() => [{}]);
    const f = clean(d?.[INTRO[m.contenttypeid]]);
    if (f) texts.push(f);
  }
  // 문화시설 요금(소개정보) → 입장료·관람료 → 시설이용료(케이블카 등) 순
  if (OVERRIDE[p.id]) { out[p.id] = OVERRIDE[p.id]; rows.push({ p, fee: OVERRIDE[p.id], used: `사람이 정함: ${OVERRIDE[p.id].text}` }); continue; }
  let fee = null, used = "";
  for (const t of [...texts.filter((x) => !x.includes(":")), ...texts.filter((x) => /입장료|관람료/.test(x)), ...texts]) { fee = parseFee(t.replace(/^(입장료|관람료|이용요금|이용료|시설이용료):\s*/, "")); if (fee) { used = t; break; } }
  if (!fee) { rows.push({ p, why: texts.length ? `요금을 읽지 못함 (${texts[0].slice(0, 50)})` : "요금 정보 없음" }); continue; }
  out[p.id] = { ...fee, text: used.slice(0, 160) };
  rows.push({ p, fee, used });
  process.stdout.write(".");
}
await writeFile(new URL("../public/fees.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
const esc = (s) => String(s).replace(/\|/g, "\\|");
const md = [
  "# 입장료 리포트 (한국관광공사 정보)", "",
  "생성: node scripts/bake-fees.mjs. 어른·어린이 요금을 관광공사 반복정보·소개정보에서 읽는다. 요금은 바뀔 수 있으니 방문 전 확인.", "",
  `- 요금을 찾은 곳 ${Object.keys(out).length}곳 · 못 찾은 곳 ${rows.filter((r) => !r.fee).length}곳 (해변·산책로 등 대부분 무료 장소)`, "",
  "## 찾은 곳", "", "| id | 이름 | 어른 | 어린이 | 관광공사 원문 |", "|---|---|---|---|---|",
  ...rows.filter((r) => r.fee).map((r) => `| ${r.p.id} | ${esc(r.p.name)} | ${r.fee.adult.toLocaleString()}원 | ${r.fee.child.toLocaleString()}원 | ${esc(r.used.slice(0, 90))} |`), "",
  "## 못 찾은 곳", "", "| id | 이름 | 이유 |", "|---|---|---|",
  ...rows.filter((r) => !r.fee).map((r) => `| ${r.p.id} | ${esc(r.p.name)} | ${esc(r.why)} |`), "",
];
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/fees.md", import.meta.url), md.join("\n"));
console.log(`\n요금 찾음 ${Object.keys(out).length}곳 → public/fees.json, reports/fees.md`);
