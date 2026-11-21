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
