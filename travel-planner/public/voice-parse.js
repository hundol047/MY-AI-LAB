// 말로 한 여행 요청 → 일정 조건. "다음 주 토요일 어른 둘 아이 하나랑 강릉 2박, 서울역에서 기차로 아침 일찍"
// 지역·동행·이동·취향·여러 권역은 기존 한 줄 해석(startLocal)을 쓰고, 말로 할 때 흔한 표현을 원문에서 직접 읽어 덮어쓴다:
// 날짜(요일·이번/다음 주·주말·N일 뒤), 일수(사흘·N일 동안·N nights), 인원(어른·아이 수), 휠체어·유모차, 출발지, 출발 시각, 여유/알차게, 덜 걷기
// 한국어·영어·일본어·중국어. 돌려주는 값: { input, access, people, start, startTime, pace, lessWalk, heard: [{key, ko}] }
import { startLocal } from "./ai-local.js";
import { addDays } from "./planner.js";
import { ORIGINS } from "./origins.js";

const NUM = { 한: 1, 하나: 1, 일: 1, 두: 2, 둘: 2, 이: 2, 세: 3, 셋: 3, 삼: 3, 네: 4, 넷: 4, 사: 4, 다섯: 5, 여섯: 6, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const num = (s) => (s == null ? null : /^\d+$/.test(s) ? Number(s) : NUM[s] ?? null);
const N_KO = "(\\d+|한|하나|두|둘|세|셋|네|넷|다섯|여섯)";
const N_EN = "(\\d+|one|two|three|four|five|six|a|an)";
const N_CJK = "(\\d+|一|二|两|兩|三|四|五|六)";

// 요일: 0=일 … 6=토
const WEEKDAYS = [
  [/일요일|sunday|日曜|星期日|星期天|周日|週日|礼拜天/, 0], [/월요일|monday|月曜|星期一|周一|週一/, 1], [/화요일|tuesday|火曜|星期二|周二|週二/, 2],
  [/수요일|wednesday|水曜|星期三|周三|週三/, 3], [/목요일|thursday|木曜|星期四|周四|週四/, 4], [/금요일|friday|金曜|星期五|周五|週五/, 5], [/토요일|saturday|土曜|星期六|周六|週六/, 6],
];
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();

export function parseDate(raw, today) {
  const t = raw.toLowerCase().replace(/\s+/g, "");
  const next = /다음주|담주|nextweek|来週|下周|下週|下星期/.test(t);
  if (/오늘|today|今日|今天/.test(t)) return { date: today, how: "오늘" };
  if (/글피/.test(t)) return { date: addDays(today, 3), how: "글피" };
  if (/모레|明後日|あさって|后天|後天|dayaftertomorrow/.test(t)) return { date: addDays(today, 2), how: "모레" };
  if (/내일|tomorrow|明日|あした|明天/.test(t)) return { date: addDays(today, 1), how: "내일" };
  let m = t.match(/(\d+|一|二|两|兩|三|四|五|六|七)(일|days?|日|天)(뒤|후|later|後|后|以后|以後)/) || t.match(/in(\d+)days?/);
  if (m && num(m[1])) return { date: addDays(today, Math.min(60, num(m[1]))), how: `${num(m[1])}일 뒤` };
  const wd = dow(today);
  for (const [re, target] of WEEKDAYS) {
    if (!re.test(t)) continue;
    let d = (target - wd + 7) % 7;
    if (next) d = ((target + 6) % 7) - ((wd + 6) % 7) + 7; // 월요일 시작 주 기준 다음 주의 그 요일
    else if (/next(sun|mon|tue|wed|thu|fri|sat)/.test(t)) d = d || 7; // 영어 "next Saturday": 오늘이 아닌 다가오는 그 요일
    return { date: addDays(today, d), how: `${next ? "다음 주 " : ""}${["일", "월", "화", "수", "목", "금", "토"][target]}요일` };
  }
  if (/주말|weekend|週末|周末/.test(t)) {
    // 이번 주말: 오늘이 토·일이면 오늘, 아니면 이번 주 토요일. 다음 주말: 다음 주 토요일
    const d = next ? 13 - ((wd + 6) % 7) - 1 : wd === 6 || wd === 0 ? 0 : 6 - wd;
    return { date: addDays(today, d), how: next ? "다음 주말" : "이번 주말" };
  }
  m = t.match(/(\d{1,2})(월|月|\/)(\d{1,2})(일|日|号|號)?/) || null;
  const EN_M = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const en = raw.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})/);
  const [mm, dd] = m ? [Number(m[1]), Number(m[3])] : en ? [EN_M[en[1]], Number(en[2])] : [];
  if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
    const y = Number(today.slice(0, 4));
    const ds = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    return { date: ds < today ? `${y + 1}${ds.slice(4)}` : ds, how: `${mm}월 ${dd}일` };
  }
  return null;
}

export function parseDays(raw) {
  const t = raw.toLowerCase();
  const s = t.replace(/\s+/g, "");
  const cap = (n) => Math.max(1, Math.min(5, n));
  let m = s.match(new RegExp(`${N_KO}박`)) || s.match(new RegExp(`${N_CJK}(泊|晚|夜)`));
  if (m && num(m[1])) return cap(num(m[1]) + 1);
  m = t.match(new RegExp(`\\b${N_EN}\\s*nights?\\b`));
  if (m && num(m[1])) return cap(num(m[1]) + 1);
  if (/당일|하루코스|daytrip|日帰り|一日游|一日遊|当天往返/.test(s)) return 1;
  if (/이틀/.test(s)) return 2;
  if (/사흘/.test(s)) return 3;
  if (/나흘/.test(s)) return 4;
  if (/닷새/.test(s)) return 5;
  m = s.match(/(\d)일(동안|간|일정|짜리|코스)/) || s.match(/(\d)日間/) || s.match(new RegExp(`${N_CJK}天(?!后|後|以后|以後)`));
  if (m) { const n = num(m[1]); if (n) return cap(n); }
  m = t.match(new RegExp(`\\b${N_EN}[\\s-]*days?\\b(?!\\s*(later|after))`));
  if (m && num(m[1])) return cap(num(m[1]));
  if (/overnight|onenight|1박/.test(s)) return 2;
  return null;
}

export function parsePeople(raw) {
  const t = raw.toLowerCase();
  const s = t.replace(/\s+/g, "");
  let adults = null, kids = null;
  let m = s.match(new RegExp(`(어른|성인|대인|어르신)${N_KO}(명|분)?`)) || s.match(new RegExp(`${N_CJK}(个|個|位|名)?(大人|成人)`)) || s.match(new RegExp(`(大人|成人)${N_CJK}(人|个|個|位|名)?`)) || t.match(new RegExp(`\\b${N_EN}\\s*(adults?|grown-?ups?)`));
  if (m) adults = num(m[2]) ?? num(m[1]);
  m = s.match(new RegExp(`(아이|애기|아기|어린이|아들|딸|자녀|꼬마|애들|아이들)${N_KO}(명)?`)) || s.match(new RegExp(`${N_CJK}(个|個|位|名)?(孩子|小孩|儿童|兒童)`)) || s.match(new RegExp(`(子供|子ども|こども|孩子|小孩|儿童|兒童)${N_CJK}(人|个|個|位|名)?`)) || t.match(new RegExp(`\\b${N_EN}\\s*(kids?|children|child|babies|baby|toddlers?)`));
  if (m) kids = num(m[2]) ?? num(m[1]);
  if (adults == null) {
    m = s.match(new RegExp(`${N_KO}(이서|이|명이서|명이|명)(서)?(가|여행|같이|함께|떠나)?`)) || s.match(new RegExp(`${N_CJK}(人|个人|個人)(で|去|一起)?`)) || t.match(new RegExp(`\\b${N_EN}\\s*(people|of us|persons?)`));
    const total = m && num(m[1]);
    if (total) adults = Math.max(1, total - (kids || 0));
  }
  if (adults == null && kids == null) return null;
  return { adults: adults ?? 2, kids: kids ?? 0 };
}

export function parseAccess(raw) {
  const t = raw.toLowerCase();
  const out = [];
  if (/휠체어|wheelchair|車いす|車椅子|轮椅|輪椅/.test(t)) out.push("wheelchair");
  if (/유모차|stroller|pram|buggy|ベビーカー|婴儿车|嬰兒車|推车/.test(t)) out.push("stroller");
  return out;
}

const ORIGIN_WORDS = [
  [/서울역|seoulstation|ソウル駅|首尔站|首爾站/, "서울역"], [/청량리|cheongnyangni|清凉里|清涼里/, "청량리역"], [/상봉|sangbong/, "상봉역"],
  [/동서울|dongseoul|東ソウル|东首尔/, "동서울종합터미널"], [/고속터미널|강남터미널|expressbusterminal|高速ターミナル|高速巴士客运站/, "서울고속버스터미널"],
  [/인천공항|incheon|仁川/, "인천국제공항"], [/김포|gimpo|金浦/, "김포국제공항"], [/양양공항|yangyangairport|襄阳机场|襄陽空港/, "양양국제공항"],
];
// 도시 이름만 말하면 "~에서/from/から/从"이 붙을 때만 출발지로 본다 (그 도시 안의 대표 역·터미널)
const CITY_FROM = [[/(부산|busan|釜山)/, "부전역"], [/(대구|daegu|大邱)/, "동대구역"], [/(대전|daejeon|大田)/, "대전복합터미널"], [/(서울|seoul|ソウル|首尔|首爾)/, "서울역"]];
export function parseStart(raw) {
  const s = raw.toLowerCase().replace(/\s+/g, "");
  for (const [re, name] of ORIGIN_WORDS) if (re.test(s)) return ORIGINS.find((o) => o.name === name) || null;
  for (const [re, name] of CITY_FROM) {
    const city = re.source; // "(부산|busan|釜山)" — 괄호째 써야 "|"가 뒤 낱말까지 묶이지 않는다
    if (new RegExp(`${city}(에서|출발)|from${city}|${city}から|从${city}|從${city}|${city}出发`).test(s)) return ORIGINS.find((o) => o.name === name) || null;
  }
  return null;
}

export function parseStartTime(raw) {
  const t = raw.toLowerCase();
  const s = t.replace(/\s+/g, "");
  let m = s.match(/(오전|오후|아침|저녁)?(\d{1,2})시(반|30분)?(에|출발|쯤|에출발)/) || s.match(/(午前|午後)?(\d{1,2})時(半)?(に|出発|ごろ)/) || s.match(/(上午|下午|早上)?(\d{1,2})点(半)?(出发|走|左右)?/);
  let h = null, half = false;
  if (m) { h = Number(m[2]); half = !!m[3]; if (/오후|저녁|午後|下午/.test(m[1] || "") && h < 12) h += 12; }
  else if ((m = t.match(/\b(?:at|leave at|depart at|by)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/))) { h = Number(m[1]); half = m[2] === "30"; if (m[3] === "pm" && h < 12) h += 12; }
  if (h !== null && h >= 6 && h <= 18) return `${String(h).padStart(2, "0")}:${half ? "30" : "00"}`;
  if (/아침일찍|새벽|이른아침|earlymorning|early|朝早く|早朝|一大早|清早/.test(s)) return "07:00";
  return null;
}

export function parseSpoken(text, today) {
  const raw = String(text || "").trim();
  const base = startLocal(raw, today);
  const heard = [];
  const input = { region: base.region, date: base.date, days: base.days, who: base.who, likes: base.likes, move: base.move, ...(base.route ? { route: base.route } : {}) };
  const date = parseDate(raw, today);
  if (date) input.date = date.date;
  const days = parseDays(raw);
  if (days) input.days = days;
  if (input.route) input.route = input.route.slice(0, Math.min(3, input.days));
  if (input.route && input.route.length < 2) delete input.route;
  const people = parsePeople(raw);
  if (people?.kids && !["pet", "parents"].includes(input.who)) input.who = "family";
  else if (people && !people.kids && input.who === "couple" && people.adults === 1) input.who = "solo";
  const access = parseAccess(raw);
  const start = parseStart(raw);
  const startTime = parseStartTime(raw);
  const s = raw.toLowerCase().replace(/\s+/g, "");
  const pace = /여유|천천히|느긋|널널|relax|slow|easy|leisure|ゆったり|のんびり|轻松|輕鬆|悠闲|慢慢/.test(s) ? "relaxed" : /알차게|빡빡|많이보|최대한많|packed|asmuch|lotsof|たくさん|詰め込|充实|充實|多看/.test(s) ? "packed" : null;
  const lessWalk = /덜걷|조금걷|걷기힘|많이안걷|무릎|walkless|lesswalking|notmuchwalking|あまり歩|歩くのが|少走|走不动/.test(s) || access.length > 0;
  // 화면에 보여 줄 "알아들은 조건" (한국어 문구, 화면 언어로 번역해서 보인다)
  heard.push({ key: "region", ko: input.route ? input.route.join("→") : input.region });
  heard.push({ key: "date", ko: date ? date.how : "" });
  heard.push({ key: "days", ko: String(input.days) });
  heard.push({ key: "who", ko: input.who });
  if (people) heard.push({ key: "people", ko: `${people.adults}:${people.kids}` });
  heard.push({ key: "move", ko: input.move });
  heard.push({ key: "likes", ko: input.likes.join(",") });
  for (const a of access) heard.push({ key: "access", ko: a });
  if (start) heard.push({ key: "start", ko: start.name });
  if (startTime) heard.push({ key: "time", ko: startTime });
  if (pace) heard.push({ key: "pace", ko: pace });
  if (lessWalk && !access.length) heard.push({ key: "walk", ko: "less" });
  return { input, access, people, start, startTime, pace, lessWalk, heard, said: raw };
}
