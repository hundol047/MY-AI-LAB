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
  if (has("2박", "3박")) r.days = 3;
  if (has("혼자")) r.who = "solo";
  if (has("아이", "애들", "가족", "아들", "딸")) r.who = "family";
  if (has("부모님", "엄마", "아빠", "어머니", "아버지", "어르신")) r.who = "parents";
  if (has("기차", "버스", "뚜벅", "대중교통", "KTX")) r.move = "transit";
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
