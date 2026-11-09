// 무장애(휠체어·유모차) 정보: 한국관광공사 무장애 여행 정보(KorWithService2)에서 앱 장소를 찾아 detailWithTour2의 편의시설을 붙인다.
// 출력: public/access-data.js (ACCESS: {장소 id: {wheel, ramp, elevator, toilet, parking, stroller, nursing, text: {항목: 원문}}}), reports/access.md
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-access.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { candidates, tour, maxKmFor } from "./tour-api.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };
const { PLACES } = await import("../public/data.js");
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// 화면에 보여 줄 항목 (관광공사 필드 → 한국어 이름)
const FIELDS = { parking: "주차", publictransport: "대중교통", route: "접근로", exit: "출입구", wheelchair: "휠체어", elevator: "엘리베이터", restroom: "화장실", stroller: "유모차", lactationroom: "수유실", babysparechair: "유아 의자" };
// 원문에서 "있다/된다"를 읽는다 ("없음", "불가"는 아니라고 본다)
// "턱이 없음"·"단차 없음"·"계단 없음"은 좋은 뜻이라 부정어로 보지 않는다
const yes = (s, re) => { if (!s || !re.test(s)) return false; const t = s.replace(/(턱|단차|계단|문턱)\s*(이|가)?\s*없[음어고는]?/g, ""); return !/없음|불가|어려움|미설치/.test(t); };

const ACCESS = {}, rows = [];
// API가 실패하면(하루 호출 한도 등) 지난번 값을 그대로 둔다 — 실패를 "등록 안 됨"으로 덮어쓰지 않게
const PREV = await import("../public/access-data.js").then((m) => m.ACCESS || {}).catch(() => ({}));
let failed = 0;
const FAIL = Symbol("fail");
for (const p of PLACES.filter((x) => !x.multi)) {
  // 장소 번호(contentid)는 국문 관광정보와 같다. 사진·운영시간에서 이미 받아 둔 국문 검색 결과(캐시)로 번호를 얻고,
  // 무장애 상세는 장소당 한 번만 부른다 (하루 호출 한도 보호)
  let id = p.kto;
  if (!id) {
    const list = await candidates("KorService2", p, opts).catch(() => FAIL);
    if (list === FAIL) { failed++; if (PREV[p.id]) { ACCESS[p.id] = PREV[p.id]; rows.push({ p, why: "검색 실패 → 지난 값 유지" }); } else rows.push({ p, why: "검색 실패" }); continue; }
    id = list.find((c) => c.ok && c.km <= maxKmFor(p))?.contentid;
  }
  if (!id) { rows.push({ p, why: "관광공사 항목 없음" }); continue; }
  const res = await tour("KorWithService2", "detailWithTour2", { contentId: String(id) }, opts).catch(() => FAIL);
  if (res === FAIL) { failed++; if (PREV[p.id]) { ACCESS[p.id] = PREV[p.id]; rows.push({ p, why: "무장애 조회 실패 → 지난 값 유지" }); } else rows.push({ p, why: "무장애 조회 실패" }); continue; }
  const [d] = res;
  if (!d) { rows.push({ p, why: "무장애 정보에 등록되지 않음" }); continue; }
  const m = { contentid: id };
  const text = {};
  for (const [f, label] of Object.entries(FIELDS)) { const v = clean(d[f]); if (v) text[label] = v; }
  if (!Object.keys(text).length) { rows.push({ p, why: "편의시설 항목이 비어 있음" }); continue; }
  const a = {
    wheel: yes(text["휠체어"], /대여|가능|있음/),
    ramp: yes(`${text["접근로"] || ""} ${text["출입구"] || ""}`, /경사로|평탄|(턱|단차|계단|문턱)\s*(이|가)?\s*없|무단차|자동문|휠체어\s*(접근|이동)\s*가능/),
    elevator: yes(text["엘리베이터"], /있음|설치|가능/),
    toilet: yes(text["화장실"], /장애인|있음/),
    parking: yes(text["주차"], /장애인|전용|주차/),
    stroller: yes(text["유모차"], /대여|가능|있음/),
    nursing: yes(text["수유실"], /있음|설치/),
  };
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
