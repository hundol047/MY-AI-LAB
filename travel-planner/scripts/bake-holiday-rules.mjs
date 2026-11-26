// 명절·공휴일 휴무 규칙: 관광공사 '쉬는 날' 원문(reports/hours.md, check-hours.mjs가 매일 만든다)에서
// 설·추석(당일/오전/연휴), 1월 1일, 법정공휴일 휴무, "월요일이 공휴일이면 그날은 열고 다음 평일에 쉰다" 같은 규칙을 읽어
// public/holiday-rules.js로 만든다. 일정 엔진(planner.js closedOn)이 쓴다. 원문에 적힌 것만 읽는다(지어내지 않는다).
// 실행: node scripts/bake-holiday-rules.mjs
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// 원문 한 줄 → 규칙. 해당 없으면 null
export function parseRest(text) {
  const t = String(text || "").replace(/\s+/g, "");
  if (!t || t === "-") return null;
  const r = {};
  if (/1월1일|신정|1\/1(?!\d)/.test(t)) r.newYear = true;
  // 설·추석: 가까이 적힌 '연휴'·'오전'·'당일'로 종류를 정한다 (없으면 당일)
  const kind = (word) => {
    const i = t.search(word); if (i < 0) return null;
    const near = t.slice(i, i + 14);
    if (/연휴/.test(near)) return "holiday";
    if (/오전/.test(near)) return "am";
    return "day";
  };
  const s = kind(/설날|설연휴|구정|설[·\/및,]|설당일|설오전/);
  if (s) r.seollal = s;
  const c = kind(/추석/);
  if (c) r.chuseok = c;
  if (/(법정)?공휴일(휴무|휴관|휴장)|\/법정공휴일(?!인)/.test(t) && !/공휴일인경우/.test(t.match(/(법정)?공휴일(휴무|휴관|휴장)|\/법정공휴일/)?.[0] || "")) r.holidayClosed = true;
  // 정기 휴일이 공휴일과 겹칠 때
  if (/(휴관일|휴무일|월요일|화요일|해당일)이(법정)?공휴일인경우(그)?(다음|익일)|공휴일인경우(그)?(다음|익일)|공휴일인경우개방하며,?그다음|공휴일인경우개관하며,?그다음|그다음첫번째평일|다음첫번째평일|다음평일휴/.test(t)) { r.shiftNext = true; r.holidayOpen = true; }
  else if (/공휴일(및대체휴무일)?인경우(정상)?(운영|개관|개방)|휴관일이공휴일인경우개관/.test(t)) r.holidayOpen = true;
  return Object.keys(r).length ? r : null;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { PLACES } = await import("../public/data.js");
  const ids = new Set(PLACES.map((p) => p.id));
  const md = await readFile(new URL("../reports/hours.md", import.meta.url), "utf8");
  const rules = {}, lines = [];
  for (const l of md.split("\n")) {
    if (!l.startsWith("| ") || l.startsWith("| id")) continue;
    const c = l.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim());
    if (c.length < 6 || !ids.has(c[0]) || rules[c[0]]) continue;
    const r = parseRest(c[5]);
    if (!r) continue;
    rules[c[0]] = r;
    lines.push(`// ${c[0]}: ${c[5].slice(0, 90)}`);
  }
  const out = `// 자동 생성: node scripts/bake-holiday-rules.mjs (관광공사 '쉬는 날' 원문 → 명절·공휴일 휴무 규칙). 직접 고치지 말 것
// newYear 1월 1일 휴무 · seollal/chuseok "day"(당일)|"am"(오전, 13시부터)|"holiday"(연휴 3일) · holidayClosed 법정공휴일 휴무
// holidayOpen 정기 휴일이 공휴일이면 연다 · shiftNext 그때는 다음 첫 평일에 쉰다
export const HOLIDAY_RULES = ${JSON.stringify(rules).replace(/\},"/g, '},\n"')};
${lines.join("\n")}
`;
  await writeFile(new URL("../public/holiday-rules.js", import.meta.url), out);
  console.log(`명절·공휴일 휴무 규칙 ${Object.keys(rules).length}곳 → public/holiday-rules.js`);
}
