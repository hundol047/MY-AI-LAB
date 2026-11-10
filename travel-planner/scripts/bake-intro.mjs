// 장소 소개: 한국관광공사 국문 관광정보 공통정보(detailCommon2)의 소개글(overview) 첫 문장을 그대로 붙인다 (요약·창작 없음)
// 장소 카드의 "소개"를 누르면 보인다. 한국어 화면에서만 쓴다 (외국어는 data-en.json 등의 설명).
// 장소 번호(contentid)는 p.kto, 없으면 국문 검색 결과(캐시)에서 이름·거리로 맞춘 것만 쓴다
// 출력: public/intro.json ({builtAt, source, places: {장소 id: 첫 문장}}), reports/intro.md
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-intro.mjs
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { candidates, tour, maxKmFor } from "./tour-api.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };
const { PLACES } = await import("../public/data.js");
const MAX = 160;
// 한국어 첫 문장: "~다." "~요." "~음." 다음에서 자른다 ("1.4km"·"Mt." 같은 점에서는 자르지 않게)
const firstKo = (t) => (t.split(/(?<=(?:다|요|음|함|임)[.!])\s*/)[0] || "").trim();
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// API가 실패하면 지난 값을 그대로 둔다
const prev = JSON.parse(await readFile(new URL("../public/intro.json", import.meta.url), "utf8").catch(() => "{}")).places || {};
const out = {}, rows = [];
let failed = 0;
for (const p of PLACES.filter((x) => !x.petOnly && !x.multi && x.cat !== "festival")) {
  let id = p.kto;
  if (!id) {
    const list = await candidates("KorService2", p, opts).catch(() => null);
    if (!list) { failed++; if (prev[p.id]) out[p.id] = prev[p.id]; rows.push(`- ${p.name}: 검색 실패`); continue; }
    id = list.find((c) => c.ok && c.km <= maxKmFor(p))?.contentid;
  }
  if (!id) { rows.push(`- ${p.name}: 관광공사 항목 없음`); continue; }
  const res = await tour("KorService2", "detailCommon2", { contentId: String(id) }, opts).catch(() => null);
  if (!res) { failed++; if (prev[p.id]) out[p.id] = prev[p.id]; rows.push(`- ${p.name}: 소개 조회 실패`); continue; }
  let s = firstKo(clean(res[0]?.overview));
  // 너무 길거나 너무 짧으면 쓰지 않는다 (카드에 한두 줄로 보이게)
  if (!s || s.length < 15) { rows.push(`- ${p.name}: 소개 없음`); continue; }
  if (s.length > MAX) { rows.push(`- ${p.name}: 첫 문장이 너무 김 (${s.length}자)`); continue; }
  out[p.id] = s;
  process.stdout.write(".");
}
await writeFile(new URL("../public/intro.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), source: "한국관광공사 국문 관광정보 (소개 첫 문장)", places: out }) + "\n");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/intro.md", import.meta.url), ["# 장소 소개 (한국관광공사 소개 첫 문장)", "", `생성: node scripts/bake-intro.mjs. 붙인 곳 ${Object.keys(out).length}곳${failed ? ` · API 실패 ${failed}곳` : ""}`, "", "## 못 붙인 곳", "", ...rows, ""].join("\n"));
console.log(`\n장소 소개 ${Object.keys(out).length}곳${failed ? ` (API 실패 ${failed}곳)` : ""} → public/intro.json, reports/intro.md`);
