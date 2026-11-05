// AI 서버에 연결되지 않았을 때 쓰는 간단한 규칙 기반 대체
import { addDays, parseRequestLocally, hoursFor, fmt } from "./planner.js";
import { PLACES } from "./data.js";
import { normalize, NICKS, TIPS, THEMES, FAQ } from "./knowledge.js";

const REGION_WORDS = {
  gangneung: ["강릉", "동해", "삼척", "정동진", "경포", "주문진"],
  seorak: ["속초", "양양", "고성", "설악", "인제"],
  chuncheon: ["춘천", "남이섬", "화천", "철원", "홍천"],
  pyeongchang: ["평창", "대관령", "정선", "영월", "태백"],
  wonju: ["원주", "횡성"],
};

export function startLocal(text, today) {
  const t = normalize(text);
  const has = (...w) => w.some((x) => t.includes(x));
  const r = { region: "gangneung", date: addDays(today, 1), days: 2, who: "couple", likes: [], move: "car" };
  for (const [k, words] of Object.entries(REGION_WORDS)) if (has(...words)) { r.region = k; break; }
  if (has("당일", "하루")) r.days = 1;
  if (has("1박")) r.days = 2;
  if (has("2박")) r.days = 3;
  if (has("3박")) r.days = 4;
  if (has("4박", "5박", "6박", "일주일")) r.days = 5;
  if (has("혼자")) r.who = "solo";
  if (has("아이", "애들", "가족", "아들", "딸")) r.who = "family";
  if (has("부모님", "엄마", "아빠", "어머니", "아버지", "어르신")) r.who = "parents";
  if (has("기차", "버스", "뚜벅", "대중교통", "KTX")) r.move = "transit";
  if (has("택시")) r.move = "taxi";
  const cats = { sea: ["바다", "해변"], cafe: ["카페", "커피"], food: ["맛집", "먹", "시장"], culture: ["역사", "문화", "박물관", "전시"], nature: ["자연", "산책", "숲", "산", "호수"] };
  for (const [c, words] of Object.entries(cats)) if (has(...words)) r.likes.push(c);
  if (!r.likes.length) r.likes = ["sea", "food"];
  if (has("내일")) r.date = addDays(today, 1);
  if (has("모레")) r.date = addDays(today, 2);
  if (has("주말")) {
    const wd = new Date(today).getDay();
    r.date = addDays(today, (6 - wd + 7) % 7 || 7);
  }
  const m = t.match(/(\d{1,2})월(\d{1,2})일/);
  if (m) {
    let y = Number(today.slice(0, 4));
    const ds = `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    r.date = ds < today ? `${y + 1}${ds.slice(4)}` : ds;
  }
  return r;
}

/* ---------- AI 가이드 (AI 없이) ----------
 * 질문을 knowledge.js의 표현 사전으로 고친 뒤, 장소 이름과 주제를 찾아 답한다.
 * 운영시간·요금·실내/야외·걷는 양은 검증된 데이터(data.js·fees.json)에서, 팁은 knowledge.js에서 가져온다.
 * ctx: { input: 여행 조건, opts: 현재 일정 옵션, fees: fees.json }
 */
const josa = (word, pair) => {
  const c = String(word).charCodeAt(String(word).length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${word}${pair[0]}(${pair[1]})`;
  return word + (c % 28 ? pair[0] : pair[1]);
};
const names = (ps) => ps.map((p) => p.name).join(", ");
const ps_ = (ps, pair) => josa(names(ps), pair);
const firstSentence = (t) => (t.match(/^.*?[요다]\./) || [t])[0];
const CAT_WORDS = { sea: ["바다", "해변"], cafe: ["카페"], food: ["맛집", "시장"], culture: ["역사", "문화", "박물관", "전시", "미술관"], nature: ["자연", "산책", "숲", "호수", "공원"] };
const CAT_LABEL = { sea: "바다", cafe: "카페", food: "식당", culture: "볼거리", nature: "산책할 곳" };
const DAY_WORDS = [["첫날", 0], ["첫째날", 0], ["둘째날", 1], ["셋째날", 2], ["넷째날", 3]];

let placeIndex = null;
function findPlaces(n, regions) {
  placeIndex ??= PLACES.map((p) => ({
    p,
    full: [p.name, ...(p.alias || [])].map((x) => x.replace(/\s/g, "")),
    nick: NICKS[p.id] || [],
  }));
  const hits = [];
  for (const { p, full, nick } of placeIndex) {
    // 별명은 이 여행 권역의 장소만 (예: "케이블카"가 다른 권역 케이블카를 가리키지 않게)
    const toks = [...full, ...(regions.has(p.region) ? nick : [])];
    for (const tok of toks) {
      const at = n.indexOf(tok);
      if (tok.length >= 2 && at >= 0) hits.push({ id: p.id, at, len: tok.length });
    }
  }
  // 더 긴 이름 안에 들어 있는 짧은 이름은 버린다 ("정동진시간박물관" 안의 "정동진")
  const kept = hits.filter((h) => !hits.some((o) => o.len > h.len && o.at <= h.at && h.at + h.len <= o.at + o.len));
  return [...new Set(kept.sort((a, b) => a.at - b.at).map((h) => h.id))].map((id) => PLACES.find((p) => p.id === id));
}

function hoursLine(p, date) {
  if (p.start) return `${p.name} ${p.start <= date && date <= p.end ? "축제 기간이에요" : "축제 기간이 아니에요"}`;
  const h = hoursFor(p, date);
  if (h.closedToday) return `${p.name} 이날 휴무`;
  if (h.open === 0 && h.close >= 1439) return `${p.name} 상시 개방`;
  return `${p.name} ${fmt(h.open)}–${fmt(h.close)}${h.lastEntry !== null ? `(입장마감 ${fmt(h.lastEntry)})` : ""}`;
}
function feeLine(p, fees) {
  const f = fees[p.id];
  if (!f) return `${p.name} 요금 정보 없음`;
  if (!f.adult && !f.child) return `${p.name} 무료`;
  return `${p.name} 어른 ${f.adult.toLocaleString("ko-KR")}원${f.child ? `·어린이 ${f.child.toLocaleString("ko-KR")}원` : ""}`;
}
const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * 0.8);

export function guideLocal(question, trip, dayIdx, ctx = {}) {
  const n = normalize(question);
  const has = (...w) => w.some((x) => n.includes(x));
  const fees = ctx.fees || {};
  const opts = ctx.opts || {};
  const regions = new Set([ctx.input?.region, ...trip.days.flatMap((d) => d.items.map((i) => i.place.region))].filter(Boolean));
  const inTrip = new Set(trip.days.flatMap((d) => d.items.map((i) => i.id)));

  // 어느 날 이야기인지: "2일차", "둘째날", "마지막날"
  let di = dayIdx;
  const m = n.match(/(\d)일차/);
  if (m) di = Number(m[1]) - 1;
  for (const [w, k] of DAY_WORDS) if (n.includes(w)) di = k;
  if (n.includes("마지막날")) di = trip.days.length - 1;
  di = Math.min(Math.max(di, 0), trip.days.length - 1);
  const day = trip.days[di];
  const dayLabel = trip.days.length > 1 ? `${di + 1}일차` : "오늘";
  const dayPlaces = day.items.map((i) => i.place).filter(Boolean);

  const mentioned = findPlaces(n, regions);
  const targets = mentioned.length ? mentioned : dayPlaces.filter((p) => p.cat || p.start);
  const nothing = { changed: false };

  /* 1) 일정 바꾸기: 장소를 빼거나 넣기 */
  const wantsRemove = /(빼|제외|취소|안갈|안가|건너뛰|지워)/.test(n);
  const wantsAdd = /(넣어|넣자|추가|가고싶|들르|들러|가보고|가볼래|더가|한곳더|한군데더|더넣|더보)/.test(n);
  if (mentioned.length && wantsRemove) {
    const ids = mentioned.filter((p) => inTrip.has(p.id));
    if (!ids.length) return { ...nothing, answer: `${ps_(mentioned, ["은", "는"])} 지금 일정에 없어요.` };
    return { answer: `${ps_(ids, ["을", "를"])} 빼고 다른 곳으로 채워 볼게요.`, changed: true, remove: ids.map((p) => p.id), add: [], indoor: "keep", lessWalk: "keep", pace: "keep" };
  }
  if (mentioned.length && wantsAdd) {
    const add = mentioned.filter((p) => !inTrip.has(p.id) && !p.start);
    if (!add.length) return { ...nothing, answer: `${ps_(mentioned, ["은", "는"])} 이미 일정에 있어요.` };
    const far = add.filter((p) => !regions.has(p.region));
    return {
      answer: `${ps_(add, ["을", "를"])} 넣어 볼게요.${far.length ? " 이번 여행 권역에서 멀어 이동이 길어질 수 있어요." : ""}`,
      changed: true, remove: [], add: add.map((p) => p.id), indoor: "keep", lessWalk: "keep", pace: "keep",
    };
  }
  // "2일차에 바다 한 곳 더" → 그날 동선 근처에서 그 종류의 장소를 하나 고른다
  const askedCat = Object.entries(CAT_WORDS).find(([, ws]) => ws.some((w) => n.includes(w)))?.[0];
  if (askedCat && wantsAdd) {
    const center = day.items.length ? day.items[Math.floor(day.items.length / 2)].place : null;
    const pick = PLACES
      .filter((p) => p.cat === askedCat && regions.has(p.region) && !inTrip.has(p.id) && !hoursFor(p, day.date).closedToday && !(opts.exclude || []).includes(p.id))
      .sort((a, b) => (center ? dist(a, center) - dist(b, center) : (b.pop || 0) - (a.pop || 0)))[0];
    if (!pick) return { ...nothing, answer: `${dayLabel}에 더 넣을 만한 ${josa(CAT_LABEL[askedCat], ["을", "를"])} 찾지 못했어요. 이번 권역의 ${josa(CAT_LABEL[askedCat], ["은", "는"])} 이미 일정에 있거나 그날 쉬어요.` };
    const tip = TIPS[pick.id] ? ` ${firstSentence(TIPS[pick.id])}` : ` ${pick.desc}.`;
    return { answer: `${dayLabel} 동선 근처의 ${josa(pick.name, ["을", "를"])} 넣어 볼게요.${tip}`, changed: true, remove: [], add: [pick.id], indoor: "keep", lessWalk: "keep", pace: "keep" };
  }

  /* 2) 정보 질문 ("카페 빼줘", "바다 말고"처럼 빼 달라는 말이면 건너뛰고 3)으로) */
  const negate = wantsRemove || /(말고|싫|없이|그만)/.test(n);
  if (!negate) {
    const rain = n.includes("비") && !/비빔|비교|비슷|비싸|비행|비밀/.test(n);
    if (has("운영")) {
      const lines = targets.filter((p) => p.hours || p.start).map((p) => hoursLine(p, day.date));
      if (lines.length) return { ...nothing, answer: `${dayLabel}(${day.date.slice(5).replace("-", "/")}) 운영시간이에요. ${lines.join(", ")}.` };
    }
    if (has("입장료")) {
      const ps = targets.filter((p) => !p.start && p.cat !== "food" && p.cat !== "cafe");
      if (ps.length) {
        const sum = ps.reduce((s, p) => s + (fees[p.id]?.adult || 0), 0);
        const unknown = ps.filter((p) => !fees[p.id]).length;
        return { ...nothing, answer: `${ps.map((p) => feeLine(p, fees)).join(", ")}.${!mentioned.length && sum ? ` ${dayLabel} 입장료는 어른 1명 ${sum.toLocaleString("ko-KR")}원 정도예요.` : ""}${unknown ? " 요금 정보가 없는 곳은 현장에서 확인해 주세요." : ""}` };
      }
    }
    if (has("소요시간") && mentioned.length) {
      return { ...nothing, answer: mentioned.map((p) => `${josa(p.name, ["은", "는"])} 보통 ${p.stay || 60}분 정도 머물러요.`).join(" ") + (mentioned.some((p) => p.trailKm || p.id === "sea-trail") ? " 탐방로는 걷는 속도에 따라 더 걸릴 수 있어요." : "") };
    }
    if (has("아이") || has("부모님")) {
      const kid = has("아이"), tag = kid ? "kids" : "senior", who = kid ? "아이" : "부모님";
      const ps = targets.filter((p) => p.cat);
      const good = ps.filter((p) => (p.tags || []).includes(tag));
      const hard = ps.filter((p) => p.walk >= 3);
      const rest = ps.filter((p) => !good.includes(p));
      const withWho = josa(who, ["과", "와"]);
      let a = !rest.length ? `${mentioned.length ? ps_(ps, ["은", "는"]) : `${dayLabel} 일정은 모두`} ${withWho} 가기 좋은 곳이에요.`
        : !good.length ? `${ps_(ps, ["은", "는"])} ${who} 동반에 특히 맞춘 곳은 아니에요.`
        : `${ps_(good, ["은", "는"])} ${withWho} 가기 좋아요. ${ps_(rest, ["은", "는"])} ${who} 동반에 특히 맞춘 곳은 아니에요.`;
      if (hard.length) a += ` ${ps_(hard, ["은", "는"])} 많이 걷거나 계단이 있어요.`;
      if (!mentioned.length && hard.length) return { answer: `${a} 덜 걷는 일정으로 바꿔 볼게요.`, changed: true, remove: [], add: [], indoor: "keep", lessWalk: "on", pace: kid ? "keep" : "relaxed" };
      return { ...nothing, answer: a };
    }
    if (has("계단") && !/(해줘|바꿔|줄여)/.test(n)) {
      const ps = targets.filter((p) => p.cat);
      const hard = ps.filter((p) => p.walk >= 3), mid = ps.filter((p) => p.walk === 2);
      if (ps.length) return { ...nothing, answer: hard.length ? `${ps_(hard, ["은", "는"])} 많이 걷거나 오르막·계단이 있어요.${mid.length ? ` ${ps_(mid, ["은", "는"])} 보통이에요.` : ""} "덜 걷게 해줘"라고 하면 일정을 바꿔 드려요.` : `${ps_(ps, ["은", "는"])} 많이 걷지 않아도 되는 곳이에요.` };
    }
    if (rain) {
      const out = dayPlaces.filter((p) => p.cat && !p.indoor);
      const answer = out.length
        ? `${dayLabel} 일정 중 ${ps_(out, ["은", "는"])} 야외예요. 비가 오면 실내 위주로 바꿔 볼게요.`
        : `${dayLabel} 일정은 모두 실내라 비가 와도 괜찮아요.`;
      return out.length ? { answer, changed: true, remove: [], add: [], indoor: "on", lessWalk: "keep", pace: "keep" } : { ...nothing, answer };
    }
    if (has("일출") || has("사진")) {
      const theme = has("일출") ? "일출" : "사진";
      const ps = THEMES[theme].map((id) => PLACES.find((p) => p.id === id)).filter((p) => regions.has(p.region));
      if (ps.length) return { ...nothing, answer: `${theme} 명소로는 ${ps_(ps, ["이", "가"])} 있어요.${theme === "일출" ? " 일출은 계절마다 시간이 달라 전날 확인하세요." : ""} 넣고 싶으면 "${ps[0].name} 넣어줘"라고 말해 주세요.` };
    }
    if (has("밤")) {
      const ps = PLACES.filter((p) => regions.has(p.region) && (p.tags || []).includes("night"));
      if (ps.length) return { ...nothing, answer: `저녁에 가기 좋은 곳은 ${ps_(ps.slice(0, 5), ["이에요", "예요"])}. 운영시간은 날짜마다 다르니 "운영시간 알려줘"로 확인하세요.` };
    }
    if ((has("맛집") || has("카페")) && !mentioned.length) {
      const cat = has("카페") && !has("맛집") ? "cafe" : "food";
      const center = day.items.length ? day.items[0].place : null;
      const ps = PLACES.filter((p) => p.cat === cat && regions.has(p.region) && !hoursFor(p, day.date).closedToday)
        .sort((a, b) => (center ? dist(a, center) - dist(b, center) : 0)).slice(0, 3);
      if (ps.length) return { ...nothing, answer: `${dayLabel} 동선 근처 ${cat === "cafe" ? "카페" : "먹을 곳"}이에요. ${ps.map((p) => `${p.name}(${p.desc})`).join(", ")}. 넣고 싶으면 이름과 함께 "넣어줘"라고 말해 주세요.` };
    }
    const faq = FAQ.find((f) => f.keys.some((k) => n.includes(k)));
    if (faq) return { ...nothing, answer: faq.answer };
    if (mentioned.length) {
      const p = mentioned[0];
      const facts = [p.indoor ? "실내" : "야외", `보통 ${p.stay || 60}분`, p.walk >= 3 ? "많이 걸어요" : p.walk === 2 ? "걷는 양 보통" : "걷는 양 적음"];
      if (p.hours) facts.push(hoursLine(p, day.date).replace(`${p.name} `, `${day.date.slice(5).replace("-", "/")} `));
      const where = inTrip.has(p.id) ? " 지금 일정에 들어 있어요." : ` 지금 일정에는 없어요. 넣고 싶으면 "${p.name} 넣어줘"라고 말해 주세요.`;
      return { ...nothing, answer: `${TIPS[p.id] || `${p.name}: ${p.desc}.`} (${facts.join(" · ")})${where}` };
    }

  }

  /* 3) 조건 바꾸기: 덜 걷기·여유롭게·카페 빼기 등 */
  const c = parseRequestLocally(question);
  const lessWalk = c.lessWalk || (has("계단") && /(해줘|바꿔|줄여)/.test(n));
  if (c.indoor || lessWalk || c.pace || c.prefer.length || c.avoid.length) {
    const avoid = [...new Set([...(opts.avoid || []), ...c.avoid])].filter((x) => !c.prefer.includes(x));
    const prefer = [...new Set([...(opts.prefer || []), ...c.prefer])].filter((x) => !avoid.includes(x));
    return {
      answer: "요청하신 대로 바꿔 볼게요.", changed: true, remove: [], add: [],
      prefer, avoid,
      indoor: c.indoor ? "on" : "keep", lessWalk: lessWalk ? "on" : "keep", pace: c.pace || "keep",
    };
  }
  return { ...nothing, answer: "AI 서버 없이 답하는 간단 모드예요. 장소 이름과 함께 운영시간·입장료·아이/부모님·계단·소요시간을 묻거나, \"오죽헌 넣어줘\", \"2일차에 바다 한 곳 더\", \"카페 빼줘\", \"덜 걷게 해줘\"처럼 말해 주세요." };
}

// 숙소 안심 체크 (AI 없이): 붙여넣은 글에서 위험한 표현을 찾는다
export function checkLodgingLocal(text) {
  const t = text.replace(/\s+/g, " ");
  const find = (re) => re.test(t);
  let cancel = { risk: "low", plain: "취소 규정 문구를 찾지 못했어요. 예약 전에 꼭 확인하세요." };
  if (find(/환불\s*불가|취소\s*불가|환불이?\s*안/)) cancel = { risk: "high", plain: "환불 불가 조건이 있어요. 일정이 바뀌면 돈을 돌려받지 못할 수 있어요." };
  else if (find(/(당일|1일 ?전|전날).{0,10}(취소|환불).{0,10}(불가|0%|없)/)) cancel = { risk: "mid", plain: "임박해서 취소하면 환불이 안 돼요. 며칠 전까지 무료 취소인지 확인하세요." };
  else if (find(/위약금|수수료|\d+\s*%\s*(공제|환불)/)) cancel = { risk: "mid", plain: "취소 시점에 따라 수수료가 붙어요." };
  else if (find(/무료\s*취소/)) cancel = { risk: "low", plain: "무료 취소가 가능해요. 마감 시점만 확인하세요." };
  const price = find(/추가\s*(요금|인원|비용)|별도|현장\s*결제|바비큐.{0,6}(유료|별도)/)
    ? { risk: "mid", plain: "추가 인원·바비큐·현장 결제 등 별도 요금이 있어요. 총액을 확인하세요." }
    : { risk: "low", plain: "평소 가격과 비교할 데이터는 없어요. 같은 날짜 다른 숙소와 비교해 보세요." };
  const words = [
    [/곰팡이|습기|눅눅/, "곰팡이·습기 이야기가 있어요"], [/벌레|바퀴/, "벌레가 나왔다는 후기가 있어요"],
    [/소음|시끄|방음/, "소음 이야기가 있어요"], [/냄새|악취/, "냄새 이야기가 있어요"],
    [/더럽|청소.{0,4}안|머리카락|위생/, "청결 문제 후기가 있어요"], [/사진과\s*(다|달)|사진이랑/, "사진과 다르다는 후기가 있어요"],
    [/불친절|응대/, "응대가 불친절했다는 후기가 있어요"], [/주차.{0,6}(어렵|불가|좁|없)/, "주차가 불편하다는 후기가 있어요"],
  ];
  const reviews = words.filter(([re]) => find(re)).map(([, plain]) => ({ risk: "mid", plain }));
  const ask = [];
  if (cancel.risk !== "low") ask.push("무료 취소 마감 시점");
  if (price.risk === "mid") ask.push("추가 요금 포함 총액");
  if (find(/주차/)) ask.push("주차 가능 대수");
  const worst = [cancel.risk, price.risk, ...reviews.map((r) => r.risk)].includes("high") ? "high" : reviews.length >= 2 || cancel.risk === "mid" ? "mid" : "low";
  return {
    summary: { low: "큰 위험 신호는 보이지 않아요.", mid: "예약 전에 확인할 점이 있어요.", high: "환불 조건이 까다로워요. 신중하게 예약하세요." }[worst] + " (AI 연결 없이 문구만 살펴본 결과예요)",
    cancel, price, reviews, ask,
  };
}
