// AI 서버에 연결되지 않았을 때 쓰는 간단한 규칙 기반 대체
import { addDays, parseRequestLocally, hoursFor, fmt } from "./planner.js";

const REGION_WORDS = {
  gangneung: ["강릉", "동해", "삼척", "정동진", "경포", "주문진"],
  seorak: ["속초", "양양", "고성", "설악", "인제"],
  chuncheon: ["춘천", "남이섬", "화천", "철원", "홍천"],
  pyeongchang: ["평창", "대관령", "정선", "영월", "태백"],
  wonju: ["원주", "횡성"],
};

export function startLocal(text, today) {
  const t = text.replace(/\s/g, "");
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

export function guideLocal(question, trip, dayIdx) {
  const t = question.replace(/\s/g, "");
  const day = trip.days[dayIdx];
  if (/(몇시|운영|영업|문닫|휴무|열어)/.test(t)) {
    const lines = day.items.filter((i) => i.place.hours).map((i) => {
      const h = hoursFor(i.place, day.date);
      return `${i.place.name} ${h.open === 0 && h.close >= 1439 ? "상시 개방" : `${fmt(h.open)}–${fmt(h.close)}`}`;
    });
    return { answer: `${dayIdx + 1}일차 운영시간이에요. ${lines.join(", ")}.`, changed: false };
  }
  const c = parseRequestLocally(question);
  const changed = c.indoor || c.lessWalk || c.pace || c.prefer.length || c.avoid.length;
  if (!changed) return { answer: "지금은 AI 서버에 연결되지 않아 간단한 요청(비, 덜 걷기, 여유롭게, 카페 빼기 등)만 반영할 수 있어요.", changed: false };
  return {
    answer: "요청하신 대로 바꿔 볼게요.", changed: true, remove: [], add: [],
    prefer: c.prefer, avoid: c.avoid,
    indoor: c.indoor ? "on" : "keep", lessWalk: c.lessWalk ? "on" : "keep", pace: c.pace || "keep",
  };
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
