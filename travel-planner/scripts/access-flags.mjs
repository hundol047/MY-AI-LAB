// 관광공사 무장애 여행 정보(KorWithService2 detailWithTour2) 원문 → 화면용 항목과 "있음" 판정
// bake-access.mjs(앱 장소)와 bake-access-spots.mjs(무장애 숙소·식당)가 같이 쓴다.
export const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// 화면에 보여 줄 항목 (관광공사 필드 → 한국어 이름)
export const FIELDS = { parking: "주차", publictransport: "대중교통", route: "접근로", exit: "출입구", wheelchair: "휠체어", elevator: "엘리베이터", restroom: "화장실", room: "객실", stroller: "유모차", lactationroom: "수유실", babysparechair: "유아 의자" };
// 원문에서 "있다/된다"를 읽는다 ("없음", "불가"는 아니라고 본다)
// "턱이 없음"·"단차 없음"·"계단 없음"은 좋은 뜻이라 부정어로 보지 않는다
export const yes = (s, re) => { if (!s || !re.test(s)) return false; const t = s.replace(/(턱|단차|계단|문턱)\s*(이|가)?\s*없[음어고는]?/g, ""); return !/없음|불가|어려움|미설치/.test(t); };
export function textOf(d) {
  const text = {};
  for (const [f, label] of Object.entries(FIELDS)) { const v = clean(d?.[f]); if (v) text[label] = v; }
  return text;
}
export function flagsOf(text) {
  return {
    wheel: yes(text["휠체어"], /대여|가능|있음/),
    ramp: yes(`${text["접근로"] || ""} ${text["출입구"] || ""}`, /경사로|평탄|(턱|단차|계단|문턱)\s*(이|가)?\s*없|무단차|자동문|휠체어\s*(접근|이동)\s*가능/),
    elevator: yes(text["엘리베이터"], /있음|설치|가능/),
    toilet: yes(text["화장실"], /장애인|있음/),
    parking: yes(text["주차"], /장애인|전용|주차/),
    room: yes(text["객실"], /장애인|휠체어|있음/),
    stroller: yes(text["유모차"], /대여|가능|있음/),
    nursing: yes(text["수유실"], /있음|설치/),
  };
}
