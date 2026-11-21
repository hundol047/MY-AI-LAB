// 관광공사 무장애 조사 원문에서 "계단" 주의를 읽는다 (앱·스크립트 공용).
// 예) 경포대 "주출입구는 계단으로 이어져 휠체어 출입 어려움" → 접근로에 "턱이 없음"이 있어도 '경사로·턱 없음'으로 보이면 안 된다.
// - warn: 계단 때문에 어렵다는 문장(화면에 그대로 보여 줌)
// - block: 휠체어로 들어갈 대체 길이 없다고 읽히는 경우(주출입구가 계단인데 보조 출입구·경사로 말이 없음, 대부분이 계단) → 휠체어 일정에서 뺀다
const NEG = /(계단|문턱|단차)\s*(이|가)?\s*없/;
export function stepsOf(text = {}) {
  const parts = Object.entries(text).flatMap(([k, v]) => String(v).split(/\s*[/.]\s*|,\s*(?=[가-힣]+(?:은|는)\s)/).map((s) => ({ k, s: s.trim() }))).filter((x) => x.s);
  const hard = parts.filter(({ s }) => /계단/.test(s) && !NEG.test(s) && /(어려|불가|못|계단만|계단으로|계단이\s*(있|많)|대부분이\s*계단|일부만)/.test(s));
  if (!hard.length) return null;
  const block = hard.some(({ s }) => (/주\s*출입구/.test(s) && !/(보조|경사로|엘리베이터|리프트|다른\s*출입구)/.test(s) && /(어려|불가|못)/.test(s)) || /대부분이\s*계단|계단으로\s*구성/.test(s));
  return { warn: hard.map(({ k, s }) => `${k}: ${s}`).join(" · "), block };
}

// ---------- 실내 길 안내 (공식 조사 글 → 순서대로 놓은 칸) ----------
// 관광공사 무장애 조사의 항목을 "도착해서 들어가 쓰는 순서"로 놓고, 글에서 읽은 상태를 붙인다.
//  ok: 된다고 적힘 · part: 되지만 주의할 점이 함께 적힘 · no: 어렵다고 적힘 · info: 판단할 말이 없음(글만 보여 줌)
// 조사에 없는 항목은 칸을 만들지 않는다(= 모름). 실제 건물 배치도가 아니라 조사 글을 순서대로 놓은 것이다.
export const INDOOR_ORDER = [
  ["대중교통", "🚌"], ["주차", "🅿️"], ["접근로", "🛣️"], ["출입구", "🚪"], ["엘리베이터", "🛗"], ["화장실", "🚻"], ["휠체어", "🦽"], ["유모차", "👶"], ["수유실", "🍼"], ["유아 의자", "🪑"], ["객실", "🛏️"],
];
const GOOD_NO = /(턱|단차|계단|문턱|높이\s*차이?)\s*(이|가|은|는)?\s*(전혀\s*)?없/g; // "턱이 없음"은 좋은 뜻
export function statusOf(raw) {
  const s = String(raw || "").replace(/_?무장애 편의시설/g, "").trim();
  if (!s) return "info";
  const rest = s.replace(GOOD_NO, "");
  const neg = /(없음|없어|없다|없으|불가|어려|어렵|불편|미설치|힘듦|힘들|좁|가파|급경사|계단)/.test(rest);
  const pos = GOOD_NO.test(s) || /(있음|있어|있으며|가능|설치|대여|경사로|평탄|자동문|쉬움|넓|전용|구비|비치|운영|\d+\s*(대|개|면|칸|개소))/.test(rest);
  GOOD_NO.lastIndex = 0;
  return neg && pos ? "part" : neg ? "no" : pos ? "ok" : "info";
}
export function indoorRoute(text = {}) {
  return INDOOR_ORDER.filter(([k]) => text[k]).map(([k, icon]) => ({ key: k, icon, status: statusOf(text[k]), text: String(text[k]).replace(/_?무장애 편의시설/g, "").trim() }));
}
