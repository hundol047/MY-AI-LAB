// 추천 코스 미리 만들기: 지역 × 동행 × 기간 × 걷기 정도(상관없음·걷기 힘듦·휠체어) × 테마 × 계절 조합을 일정 엔진으로 짜서,
// 품질 기준을 통과하고 서로 겹치지 않는 코스만 public/courses.json에 담는다 (AI 없이도 조건에 맞는 코스를 바로 고를 수 있게).
// 코스는 장소 순서만 담고, 사용자가 고른 날짜에 맞춰 앱이 운영시간·휴무를 다시 확인한다 (쉬는 곳은 건너뛰고 빈 시간은 채움).
// 실행: node scripts/build-courses.mjs [목표 개수=500]
import { writeFile, mkdir } from "node:fs/promises";
import { planTrip, verify, dayWalkMeters, setBus } from "../public/planner.js";
import { readFileSync } from "node:fs";
import { FESTIVALS, AREAS } from "../public/data.js";

const TARGET = Number(process.argv[2]) || 500;
// 대중교통 코스는 버스 노선(같은 버스로 몇 정류장·막차)을 반영해 짠다 (앱과 같은 조건)
setBus(JSON.parse(readFileSync(new URL("../public/bus.json", import.meta.url), "utf8")).places);
const REGIONS = ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"];
const WHO = ["parents", "couple", "family", "solo", "pet"];
const THEMES = { sea: ["sea"], culture: ["culture"], nature: ["nature"], food: ["food"], cafe: ["cafe"] };
// 계절마다 토요일 하루를 기준 날짜로 (운영 계절·스키장·꽃 시기가 맞는 곳이 들어가게)
const SEASONS = { spring: "2027-04-17", summer: "2027-07-17", autumn: "2027-10-16", winter: "2027-01-16" };
const ACCESS = (who) => (who === "pet" ? [[]] : who === "parents" ? [[], ["walker"], ["wheelchair"]] : [[], ["wheelchair"], ["walker"]]);
const BUDGET = { walker: 1500, wheelchair: 2000 };
const festivalIds = FESTIVALS.map((f) => f.id);

// 조합 목록 (앞쪽일수록 먼저): 기간 1·2일 먼저, 3일은 뒤에
const combos = [];
for (const days of [1, 2, 3]) for (const who of WHO) for (const access of ACCESS(who)) for (const region of REGIONS) for (const theme of Object.keys(THEMES)) {
  if (days === 3 && (access.length || theme === "cafe")) continue; // 2박 3일은 대표 조합만
  combos.push({ days, who, access, region, theme });
}
// 같은 조건이 몰리지 않게 섞되 늘 같은 순서 (재현 가능)
let rnd = 12345; const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let i = combos.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [combos[i], combos[j]] = [combos[j], combos[i]]; }
// 테마 한 바퀴마다 모든 조건(지역·동행·걷기·기간)을 한 번씩: 목표 개수에서 멈춰도 어느 조건도 비지 않게
const TORDER = Object.keys(THEMES);
// 조건 묶음마다 시작 테마를 돌려서(묶음 번호만큼 밀어서) 테마도 고르게
const groupKey = (c) => [c.days, c.who, c.access.join(), c.region].join("/");
const groups = [...new Set(combos.map(groupKey))];
const round = (c) => (TORDER.indexOf(c.theme) - groups.indexOf(groupKey(c)) % TORDER.length + TORDER.length) % TORDER.length;
combos.sort((a, b) => round(a) - round(b) || a.days - b.days);

const seasonKeys = Object.keys(SEASONS);
const courses = [], rejected = { quality: 0, dup: 0 };
const overlap = (a, b) => { const A = new Set(a), n = b.filter((x) => A.has(x)).length; return n / Math.max(A.size, b.length); };
let ci = 0;
for (const c of combos) {
  if (courses.length >= TARGET) break;
  const season = seasonKeys[ci++ % seasonKeys.length];
  const move = c.who === "solo" && c.theme !== "nature" && c.days < 3 && ci % 2 ? "transit" : "car";
  const input = { region: c.region, date: SEASONS[season], days: c.days, who: c.who, move, likes: THEMES[c.theme] };
  let made = null;
  for (let attempt = 0; attempt < 8 && !made; attempt++) {
    // 같은 지역·동행·걷기 조건의 앞 코스에 나온 장소는 뒤로 미뤄 코스마다 다른 곳이 나오게
    const seen = [...new Set(courses.filter((k) => k.region === c.region && k.who === c.who && k.access === (c.access[0] || "")).slice(-6).flatMap((k) => k.items.flat()))];
    const opts = { seed: 1000 + courses.length * 7919 + attempt * 104729, exclude: festivalIds, ...(seen.length ? { seen } : {}), ...(c.access.length ? { access: c.access, lessWalk: true } : {}), ...(c.who === "parents" ? { lessWalk: true } : {}) };
    const t = planTrip(input, opts);
    // 품질: 운영시간 충돌 0, 날마다 관광지 2곳 이상·점심, 숙박하는 날 저녁, 걷기 힘듦·휠체어는 걷는 양 한도
    const ok = verify(t.days) === 0 && t.days.every((d, i) => d.items.filter((x) => x.kind === "visit").length >= 2 && d.items.some((x) => x.kind === "lunch")
      && (i === c.days - 1 || d.items.some((x) => x.kind === "dinner")) && (!c.access.length || dayWalkMeters(d) <= BUDGET[c.access[0]]));
    if (!ok) { rejected.quality++; continue; }
    const ids = t.days.flatMap((d) => d.items.map((x) => x.id));
    // 겹침: 같은 지역·기간·동행·걷기 조건에서 장소가 70% 넘게 같은 코스가 이미 있으면 버리고 다른 번호로
    if (courses.some((k) => k.region === c.region && k.days === c.days && k.who === c.who && k.access === (c.access[0] || "") && overlap(k.items.flat(), ids) > 0.7)) { rejected.dup++; continue; }
    made = { t, move, season };
  }
  if (!made) continue;
  const { t } = made;
  const visits = t.days.flatMap((d) => d.items.filter((x) => x.kind === "visit"));
  const top = [...visits].sort((a, b) => b.place.pop - a.place.pop).slice(0, 3).map((x) => x.id);
  courses.push({
    id: `c${String(courses.length + 1).padStart(3, "0")}`,
    region: c.region, days: c.days, who: c.who, move: made.move, access: c.access[0] || "", theme: c.theme, season: made.season,
    areas: t.days.map((d) => d.area),
    items: t.days.map((d) => d.items.map((x) => x.id)),
    lodging: t.lodging?.id || null,
    top,
    stats: { places: t.totals.places, moveMin: t.totals.moveMin, walkKm: Math.round(t.days.reduce((a, d) => a + dayWalkMeters(d), 0) / 100) / 10 },
  });
}

await writeFile(new URL("../public/courses.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), count: courses.length, courses }) + "\n");
const count = (k) => Object.entries(courses.reduce((m, x) => ((m[x[k] || "-"] = (m[x[k] || "-"] || 0) + 1), m), {})).map(([a, b]) => `${a} ${b}`).join(" · ");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/courses.md", import.meta.url), ["# 추천 코스", "", `생성: node scripts/build-courses.mjs. 코스 ${courses.length}개 (조합 ${combos.length}개 중, 품질 탈락 ${rejected.quality}번 · 겹침 탈락 ${rejected.dup}번)`, "",
  `- 지역: ${count("region")}`, `- 기간: ${count("days")}`, `- 동행: ${count("who")}`, `- 걷기: ${count("access")}`, `- 테마: ${count("theme")}`, `- 계절: ${count("season")}`, `- 이동: ${count("move")}`, "",
  "| id | 지역 | 기간 | 동행 | 걷기 | 테마 | 장소 |", "|---|---|---|---|---|---|---|",
  ...courses.map((x) => `| ${x.id} | ${x.region} | ${x.days} | ${x.who} | ${x.access || "-"} | ${x.theme} | ${x.items.map((d) => d.join(" → ")).join(" / ")} |`), ""].join("\n"));
console.log(`추천 코스 ${courses.length}개 → public/courses.json (품질 탈락 ${rejected.quality}, 겹침 탈락 ${rejected.dup})`);
console.log(count("region")); console.log(count("who")); console.log(count("access")); console.log(count("days"));
void AREAS;
