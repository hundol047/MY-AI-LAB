// 무장애(휠체어·유모차) 정보: 한국관광공사 무장애 여행 정보(KorWithService2)에서 앱 장소를 찾아 detailWithTour2의 편의시설을 붙인다.
// 출력: public/access-data.js (ACCESS: {장소 id: {wheel, ramp, elevator, toilet, parking, stroller, nursing, text: {항목: 원문}}}), reports/access.md
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-access.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { candidates, tour, maxKmFor, km, judge } from "./tour-api.mjs";
import { textOf, flagsOf } from "./access-flags.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };
const { PLACES } = await import("../public/data.js");
const ACCESS = {}, rows = [];
// API가 실패하면(하루 호출 한도 등) 지난번 값을 그대로 둔다 — 실패를 "등록 안 됨"으로 덮어쓰지 않게
const PREV = await import("../public/access-data.js").then((m) => m.ACCESS || {}).catch(() => ({}));
let failed = 0;
const FAIL = Symbol("fail");
// 무장애 정보에 등록된 강원 목록 (관광지·문화·레포츠·숙박·음식·쇼핑). 국문 번호로 못 찾은 곳을 이름·위치로 한 번 더 찾는다.
// 이름이 같거나 앞에 지역명만 더 붙은 경우만 (스키장 ↔ 같은 리조트 호텔처럼 비슷한 이름은 다른 시설로 본다)
const WITH_LIST = [];
for (const t of ["12", "14", "28", "32", "38", "39"]) WITH_LIST.push(...await tour("KorWithService2", "areaBasedList2", { lDongRegnCd: "51", contentTypeId: t, numOfRows: "1000", pageNo: "1" }, opts).catch(() => []));
const withMatch = (p) => WITH_LIST
  .map((it) => ({ it, d: km(p, { lat: Number(it.mapy), lng: Number(it.mapx) }), j: judge(p, it.title, it.contenttypeid) }))
  .filter((x) => x.j.ok && x.j.score >= 2.5 && x.d <= 1.5)
  .sort((a, b) => b.j.score - a.j.score || a.d - b.d)[0]?.it.contentid;
for (const p of PLACES.filter((x) => !x.multi)) {
  // 장소 번호(contentid)는 국문 관광정보와 같다. 사진·운영시간에서 이미 받아 둔 국문 검색 결과(캐시)로 번호를 얻고,
  // 무장애 상세는 장소당 한 번만 부른다 (하루 호출 한도 보호)
  let id = p.kto;
  if (!id) {
    const list = await candidates("KorService2", p, opts).catch(() => FAIL);
    if (list === FAIL) { failed++; if (PREV[p.id]) { ACCESS[p.id] = PREV[p.id]; rows.push({ p, why: "검색 실패 → 지난 값 유지" }); } else rows.push({ p, why: "검색 실패" }); continue; }
    id = list.find((c) => c.ok && c.km <= maxKmFor(p))?.contentid;
  }
  const alt = withMatch(p);
  if (!id) id = alt;
  if (!id) { rows.push({ p, why: "관광공사 항목 없음" }); continue; }
  let res = await tour("KorWithService2", "detailWithTour2", { contentId: String(id) }, opts).catch(() => FAIL);
  // 국문 번호에 무장애 정보가 없으면 무장애 목록에서 찾은 번호로 한 번 더
  if (res !== FAIL && !res[0] && alt && String(alt) !== String(id)) { id = alt; res = await tour("KorWithService2", "detailWithTour2", { contentId: String(id) }, opts).catch(() => FAIL); }
  if (res === FAIL) { failed++; if (PREV[p.id]) { ACCESS[p.id] = PREV[p.id]; rows.push({ p, why: "무장애 조회 실패 → 지난 값 유지" }); } else rows.push({ p, why: "무장애 조회 실패" }); continue; }
  const [d] = res;
  if (!d) { rows.push({ p, why: "무장애 정보에 등록되지 않음" }); continue; }
  const m = { contentid: id };
  const text = textOf(d);
  if (!Object.keys(text).length) { rows.push({ p, why: "편의시설 항목이 비어 있음" }); continue; }
  const { room, ...a } = flagsOf(text);
  ACCESS[p.id] = { ...Object.fromEntries(Object.entries(a).filter(([, v]) => v)), kto: String(m.contentid), text };
  rows.push({ p, a });
  process.stdout.write(".");
}
await writeFile(new URL("../public/access-data.js", import.meta.url),
  `// 무장애 편의시설 (scripts/bake-access.mjs가 만듦 — 한국관광공사 무장애 여행 정보. 직접 고치지 않는다)\nexport const ACCESS = ${JSON.stringify(ACCESS)};\n`);
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
const flag = (a, k) => (a?.[k] ? "○" : "");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/access.md", import.meta.url), [
  "# 무장애 편의시설 리포트 (한국관광공사 무장애 여행 정보)", "", "생성: node scripts/bake-access.mjs. ○는 관광공사 원문에 '있음·대여 가능' 등으로 적힌 항목. 없거나 '없음'이면 비움.", "",
  `- 정보 있음 ${Object.keys(ACCESS).length}곳 / 대상 ${rows.length}곳`, "",
  "| id | 이름 | 휠체어 | 경사로 | 엘리베이터 | 장애인 화장실 | 주차 | 유모차 | 수유실 |", "|---|---|---|---|---|---|---|---|---|",
  ...rows.filter((r) => r.a).map((r) => `| ${r.p.id} | ${esc(r.p.name)} | ${flag(r.a, "wheel")} | ${flag(r.a, "ramp")} | ${flag(r.a, "elevator")} | ${flag(r.a, "toilet")} | ${flag(r.a, "parking")} | ${flag(r.a, "stroller")} | ${flag(r.a, "nursing")} |`), "",
  "## 정보 없는 곳", "", ...rows.filter((r) => !r.a).map((r) => `- ${r.p.id} ${esc(r.p.name)}: ${r.why}`), "",
].join("\n"));
console.log(`\n무장애 정보 ${Object.keys(ACCESS).length}곳${failed ? ` (API 실패 ${failed}곳)` : ""} → public/access-data.js, reports/access.md`);
