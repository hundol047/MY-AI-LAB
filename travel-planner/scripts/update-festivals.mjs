// 축제 날짜 자동 갱신: 한국관광공사 행사정보(searchFestival2)에 새로 발표된 강원 축제 날짜를 찾아 public/data.js에 반영한다.
// 실행: TOUR_API_KEY=Decoding키 node scripts/update-festivals.mjs            → 바뀔 내용만 reports/festivals.md에 (파일은 그대로)
//       TOUR_API_KEY=Decoding키 node scripts/update-festivals.mjs --write    → data.js까지 고침
// 하는 일
//   - 오늘 이후에 열리는 강원 행사를 모두 받아, 우리 축제와 이름으로 대조한다 (scripts/tour-api.mjs의 judge, 회차·연도 표기는 무시)
//   - "매년 ○월 · 날짜 발표 전"이던 축제에 날짜가 나오면 확정 축제로 바꾼다: 기간, 행사장 좌표, 가까운 지역(area),
//     운영시간(관광공사 소개정보 playtime의 첫 "HH:MM~HH:MM"). 운영시간을 읽지 못하면 일정에 넣지 않고 리포트에 "확인 필요"로 남긴다
//   - 이미 확정된 축제도 관광공사 날짜가 바뀌었으면 고친다
//   - 우리 목록에 없는 새 축제는 추가하지 않고 리포트에만 적는다 (축제인지 사람이 보고 넣는다)
// 관광공사 정보가 틀릴 수도 있으니, 자동 실행(GitHub Actions)은 바로 반영하지 않고 검토용 PR을 만든다.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { FESTIVALS, AREAS } from "../public/data.js";
import { tour, judge, km } from "./tour-api.mjs";

const WRITE = process.argv.includes("--write");
const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다 (공공데이터포털 한국관광공사 국문 관광정보 서비스 Decoding 키)"); process.exit(1); }

const todayKST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
// "2027 평창송어축제", "제25회 동강국제사진제", "제77주년 K-밀리터리…" → 연도·회차 빼고 비교
const bare = (t) => String(t).replace(/^\s*\d{4}\s*/, "").replace(/제\s*\d+\s*(회|주년)\s*/g, "").trim();

// 1) 오늘 이후 강원 행사 전부
let events = [];
for (let page = 1; page <= 20; page++) {
  const items = await tour("KorService2", "searchFestival2", { eventStartDate: todayKST.replaceAll("-", ""), lDongRegnCd: "51", numOfRows: "100", pageNo: String(page) }, { key });
  events = events.concat(items);
  if (items.length < 100) break;
}
events = events.filter((e) => e.eventenddate && ymd(e.eventenddate) >= todayKST);

// 2) 우리 축제와 대조. 축제는 이름이 비슷해도 다른 행사가 많아(연어축제 ≠ 송어축제) 유사도는 쓰지 않고
//    이름이 같거나 앞에 지역명만 더 붙은 경우 + 행사 주소의 시군이 우리 권역에 속할 때만 인정한다
const REGION_TOWNS = {
  gangneung: ["강릉", "동해", "삼척"], seorak: ["속초", "양양", "고성", "인제"],
  chuncheon: ["춘천", "철원", "화천", "홍천", "양구"], pyeongchang: ["평창", "정선", "영월", "태백"], wonju: ["원주", "횡성"],
};
const regionOfAddr = (addr) => Object.keys(REGION_TOWNS).find((r) => REGION_TOWNS[r].some((t) => String(addr).includes(t)));
function matchFor(f) {
  let best = null;
  for (const e of events) {
    const r = regionOfAddr(e.addr1);
    if (r && r !== f.region) continue;
    const j = judge({ name: f.name, alias: f.alias }, bare(e.title), "15");
    if (!j.ok || j.score < 2 || /유사/.test(j.why)) continue;
    if (!best || j.score > best.j.score || (j.score === best.j.score && e.eventstartdate < best.e.eventstartdate)) best = { e, j };
  }
  return best;
}
const nearestArea = (region, lat, lng) => Object.entries(AREAS)
  .filter(([, a]) => a.region === region)
  .sort(([, a], [, b]) => km(a, { lat, lng }) - km(b, { lat, lng }))[0]?.[0];
const hm = (s) => s.padStart(5, "0");

const changes = [], unsure = [], used = new Set();
for (const f of FESTIVALS) {
  const m = matchFor(f);
  if (!m) continue;
  used.add(m.e.contentid);
  const start = ymd(m.e.eventstartdate), end = ymd(m.e.eventenddate);
  if (f.start === start && f.end === end) continue;
  const next = { ...f, start, end };
  if (!f.start) {
    // 날짜 발표 전 → 확정: 좌표·지역·운영시간이 있어야 일정 엔진이 배치할 수 있다
    const lat = Number(m.e.mapy), lng = Number(m.e.mapx);
    const [intro] = await tour("KorService2", "detailIntro2", { contentId: String(m.e.contentid), contentTypeId: "15" }, { key }).catch(() => []);
    const play = String(intro?.playtime || "").replace(/<[^>]+>/g, " ");
    const t = play.match(/(\d{1,2}:\d{2})\s*[~∼\-–]\s*(\d{1,2}:\d{2})/);
    if (!(lat > 0 && lng > 0) || !t) {
      unsure.push({ f, e: m.e, why: !t ? `운영시간을 읽지 못함 (${play.trim().slice(0, 40) || "정보 없음"})` : "행사장 좌표 없음" });
      continue;
    }
    Object.assign(next, { area: nearestArea(f.region, lat, lng), lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)), hours: [hm(t[1]), hm(t[2])], stay: f.stay || 90 });
  }
  changes.push({ f, next, e: m.e, kind: f.start ? "날짜 변경" : "날짜 확정" });
}
const fresh = events.filter((e) => !used.has(e.contentid));

// 3) 리포트
const esc = (s) => String(s).replace(/\|/g, "\\|");
const md = [
  "# 축제 날짜 갱신 리포트", "",
  `생성: node scripts/update-festivals.mjs (${todayKST} 기준, 한국관광공사 행사정보). ${WRITE ? "data.js에 반영함" : "확인만 함 (--write로 반영)"}`, "",
  `- 오늘 이후 강원 행사 ${events.length}건 · 바꿀 축제 ${changes.length}개 · 확인 필요 ${unsure.length}개 · 목록에 없는 행사 ${fresh.length}건`, "",
  "## 바꿀 축제", "", "| id | 이름 | 종류 | 전 | 후 | 관광공사 제목 |", "|---|---|---|---|---|---|",
  ...changes.map((c) => `| ${c.f.id} | ${esc(c.f.name)} | ${c.kind} | ${c.f.start ? `${c.f.start}~${c.f.end}` : `매년 ${(c.f.months || []).join("·")}월`} | ${c.next.start}~${c.next.end}${c.f.start ? "" : ` · ${c.next.hours.join("–")} · ${c.next.area}`} | ${esc(c.e.title)} |`), "",
  "## 확인 필요 (날짜는 나왔지만 일정에 넣을 정보가 부족)", "", "| id | 이름 | 기간 | 이유 |", "|---|---|---|---|",
  ...unsure.map((u) => `| ${u.f.id} | ${esc(u.f.name)} | ${ymd(u.e.eventstartdate)}~${ymd(u.e.eventenddate)} | ${esc(u.why)} |`), "",
  "## 우리 목록에 없는 행사 (축제면 data.js에 직접 추가)", "", "| 기간 | 관광공사 제목 | 주소 |", "|---|---|---|",
  ...fresh.map((e) => `| ${ymd(e.eventstartdate)}~${ymd(e.eventenddate)} | ${esc(e.title)} | ${esc(e.addr1 || "")} |`), "",
];
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/festivals.md", import.meta.url), md.join("\n"));

// 4) data.js 반영: 바뀐 축제의 한 줄만 다시 쓴다 (나머지는 그대로)
if (WRITE && changes.length) {
  const file = new URL("../public/data.js", import.meta.url);
  let src = await readFile(file, "utf8");
  const ORDER = ["id", "group", "name", "alias", "region", "area", "lat", "lng", "months", "start", "end", "hours", "stay", "desc", "wiki"];
  const ser = (v) => (Array.isArray(v) ? `[${v.map(ser).join(", ")}]` : typeof v === "string" ? JSON.stringify(v) : String(v));
  for (const { f, next } of changes) {
    const keys = [...ORDER.filter((k) => k in next), ...Object.keys(next).filter((k) => !ORDER.includes(k))];
    const line = `  { ${keys.map((k) => `${k}: ${ser(next[k])}`).join(", ")} },`;
    const re = new RegExp(`^ *\\{ id: "${f.id.replace(/[-]/g, "\\-")}",.*\\},?$`, "m");
    if (!re.test(src)) { console.log(`!  ${f.id}: data.js에서 한 줄짜리 항목을 찾지 못해 건너뜀`); continue; }
    src = src.replace(re, line);
  }
  await writeFile(file, src);
}
console.log(`바꿀 축제 ${changes.length}개 · 확인 필요 ${unsure.length}개 · 목록에 없는 행사 ${fresh.length}건 → reports/festivals.md${WRITE ? " (data.js 반영)" : ""}`);
