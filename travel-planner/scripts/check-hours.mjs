// 운영시간·휴무를 한국관광공사 소개정보(detailIntro2)의 이용시간·쉬는날과 나란히 놓고, 다른 곳을 표시한다.
// 실행: TOUR_API_KEY=Decoding키 node scripts/check-hours.mjs   → reports/hours.md
// 관광공사 정보도 오래됐을 수 있으므로 자동으로 고치지 않는다. 표시된 곳은 공식 홈페이지·전화로 확인한 뒤 data.js를 고친다.
import { writeFile, mkdir } from "node:fs/promises";
import { PLACES } from "../public/data.js";
import { candidates, tour, maxKmFor } from "./tour-api.mjs";

if (!process.env.TOUR_API_KEY) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const FIELDS = { // 관광지·문화시설·레포츠·쇼핑·음식점
  12: ["usetime", "restdate"], 14: ["usetimeculture", "restdateculture"], 28: ["usetimeleports", "restdateleports"],
  38: ["opentime", "restdateshopping"], 39: ["opentimefood", "restdatefood"],
};
// 사람이 검토해 그대로 두기로 한 곳 (2026년 11월)
const REVIEWED = {
  "chodang-tofu": "화요일(15시)·주말(18:30)·브레이크타임이 byDay·breaks에 이미 있음",
  ojukheon: "관광공사 앞 시간은 매표 마감(17:00) — 우리 입장 마감 17:00과 같음",
  chamsori: "관광공사 시간 15:40은 입장 마감으로 보임 — 우리 입장 마감 15:30이 더 이름",
  chuam: "관광공사 시간은 출렁다리 기준. 촛대바위 해변은 상시 개방이라 일출 시간대 유지",
  "hoengseong-lake": "계절별(동절기 09–17·매표 16, 하절기 09–18·매표 17)로 맞춤",
  "ganhyeon-park": "관광공사 시간·휴무는 소금산 유료구간 기준(소금산 그랜드밸리에 반영). 강변 산책로는 상시 개방",
};
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const fmtClosed = (c) => (c?.length ? c.map((d) => DAYS[d]).join("·") : "없음");

const rows = [], failures = [];
for (const p of PLACES.filter((x) => !x.multi)) {
  const list = await candidates("KorService2", p, { cache: true });
  const m = list.find((c) => c.ok && c.km <= maxKmFor(p) && FIELDS[c.contenttypeid]);
  if (!m) { rows.push({ p, none: true }); continue; }
  // 소개정보를 못 받으면(하루 호출 한도 초과 등) 빈 칸으로 비교하지 않는다: 빈 리포트가 "확인 필요 0곳"처럼 보이기 때문
  let d;
  try { [d] = await tour("KorService2", "detailIntro2", { contentId: String(m.contentid), contentTypeId: String(m.contenttypeid) }, { cache: true }); }
  catch (e) { failures.push(`${p.id}: ${e.message}`); if (e.code === "22") break; continue; }
  const [tf, rf] = FIELDS[m.contenttypeid];
  const use = clean(d?.[tf]), rest = clean(d?.[rf]);
  const flags = [];
  // 쉬는날: "매주 월요일"처럼 요일 휴무가 있는데 우리는 그날 문을 연다고 한 경우
  const weekly = [...rest.matchAll(/매주\s*([월화수목금토일])요일/g)].map((x) => DAYS.indexOf(x[1]));
  const missingDays = weekly.filter((w) => !(p.closed || []).includes(w));
  if (missingDays.length) flags.push(`관광공사 휴무 ${missingDays.map((w) => DAYS[w]).join("·")}요일을 우리는 영업으로 봄`);
  // 이용시간: 첫 "HH:MM~HH:MM"보다 우리가 일찍 열거나 늦게 닫는 경우 (우리가 덜 보수적)
  const t = use.match(/(\d{1,2}:\d{2})\s*[~∼-]\s*(\d{1,2}:\d{2})/);
  if (t && p.hours) {
    const [o, c] = [toMin(t[1]), toMin(t[2])];
    if (toMin(p.hours[0]) < o) flags.push(`우리가 더 일찍 엶 (${p.hours[0]} < ${t[1]})`);
    if (c > o && toMin(p.hours[1]) > c) flags.push(`우리가 더 늦게 닫음 (${p.hours[1]} > ${t[2]})`);
  }
  if (flags.length && (p.seasons || p.byDay)) flags.push("※ 우리 데이터에 계절·요일별 시간이 따로 있음 (기본 시간만 비교)");
  rows.push({ p, m, use, rest, flags });
  process.stdout.write(flags.length ? "!" : ".");
}
const esc = (s) => String(s).replace(/\|/g, "\\|");
const flagged = rows.filter((r) => r.flags?.length && !REVIEWED[r.p.id]);
const kept = rows.filter((r) => r.flags?.length && REVIEWED[r.p.id]);
const md = [
  "# 운영시간 대조 리포트 (한국관광공사 소개정보)", "",
  "생성: node scripts/check-hours.mjs. 관광공사 정보도 오래됐을 수 있어 자동으로 고치지 않는다. 표시된 곳은 공식 홈페이지·전화로 확인한다.", "",
  `- 대조 ${rows.filter((r) => !r.none).length}곳 / 관광공사 정보 없음 ${rows.filter((r) => r.none).length}곳 / 확인 필요 ${flagged.length}곳 / 검토 후 유지 ${kept.length}곳`, "",
  "## 확인 필요", "", "| id | 이름 | 우리 시간 | 우리 휴무 | 관광공사 이용시간 | 관광공사 쉬는날 | 차이 |", "|---|---|---|---|---|---|---|",
  ...flagged.map((r) => `| ${r.p.id} | ${esc(r.p.name)} | ${r.p.hours.join("–")}${r.p.lastEntry ? ` (마감 ${r.p.lastEntry})` : ""} | ${fmtClosed(r.p.closed)} | ${esc(r.use || "-")} | ${esc(r.rest || "-")} | ${esc(r.flags.join(" / "))} |`), "",
  "## 검토 후 그대로 둔 곳", "", "| id | 이름 | 차이 | 이유 |", "|---|---|---|---|",
  ...kept.map((r) => `| ${r.p.id} | ${esc(r.p.name)} | ${esc(r.flags.join(" / "))} | ${esc(REVIEWED[r.p.id])} |`), "",
  "## 전체", "", "| id | 이름 | 우리 시간 | 우리 휴무 | 관광공사 이용시간 | 관광공사 쉬는날 |", "|---|---|---|---|---|---|",
  ...rows.filter((r) => !r.none).map((r) => `| ${r.p.id} | ${esc(r.p.name)} | ${r.p.hours.join("–")} | ${fmtClosed(r.p.closed)} | ${esc(r.use || "-")} | ${esc(r.rest || "-")} |`), "",
];
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
if (failures.length) {
  console.error(`\n관광공사 소개정보를 ${failures.length}곳 받지 못해 리포트를 바꾸지 않았습니다 (하루 호출 한도는 한국 시간 자정에 초기화):\n${failures.slice(0, 5).join("\n")}`);
  process.exit(1);
}
await writeFile(new URL("../reports/hours.md", import.meta.url), md.join("\n"));
console.log(`\n확인 필요 ${flagged.length}곳 → reports/hours.md`);
