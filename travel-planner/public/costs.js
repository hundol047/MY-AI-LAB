// 예상 비용: 일정이 다 짜인 뒤 교통·입장료·식사·숙박을 더해 범위(낮은 값~높은 값)로 보여 준다.
// 근거가 있는 값과 앱이 정한 가정값을 나눠 적는다. 화면은 이 결과를 그대로 그린다.

// 강원 중형택시 요금 (2024년 8월 조정, 시·군마다 다를 수 있음): 기본 2km 4,600원, 이후 131m당 100원.
// 15km/h 이하 시간요금(31초당 100원)과 시계외 할증은 구간마다 달라 높은 값에 15%를 더해 반영한다. 심야(23~04시) 할증 20%는 일정이 그 시간에 없으므로 넣지 않는다.
export const TAXI = { base: 4600, baseKm: 2, stepM: 131, step: 100, highFactor: 1.15, seats: 4, source: "강원 중형택시 요금(2024년 8월 조정)" };
export function taxiFare(km) {
  if (!(km > 0)) return 0;
  const extra = Math.max(0, km - TAXI.baseKm);
  return TAXI.base + Math.ceil((extra * 1000) / TAXI.stepM) * TAXI.step;
}

// 자동차 연료: 오피넷 전국 휘발유 평균(2026년 10월 말 약 1,856원/L), 연비는 보통 승용차 12km/L로 가정. 높은 값은 막힘·에어컨 등 30% 더함
export const FUEL = { pricePerL: 1856, kmPerL: 12, highFactor: 1.3, source: "오피넷 전국 휘발유 평균(2026년 10월)" };
// 버스: 강릉 시내버스 현금 요금 1,700원(카드 1,530원). 25km 넘는 구간은 시외·농어촌버스라 요금이 달라 따로 표시
export const BUS = { fare: 1700, farKm: 25, source: "강릉 시내버스 요금(현금)" };

// 앱이 정한 가정값 (1인·1박 기준 평균 범위, 실제와 다를 수 있음)
export const ASSUME = {
  lunch: [12000, 20000],
  dinner: [15000, 35000], // 회·한우 같은 지역 음식 포함해 넓게
  cafe: [6000, 10000],
  childMeal: 0.7, // 어린이 식사는 어른의 70%로 계산
  room: { // 1박·1실 (게스트하우스는 1인)
    guesthouse: [30000, 60000], business: [60000, 110000], ocean: [120000, 280000],
    pension: [80000, 200000], resort: [120000, 300000], hanok: [100000, 250000],
  },
};

// 동행 선택으로 시작하는 인원 (카드에서 바꿀 수 있음)
export function defaultPeople(who) {
  return { solo: { adults: 1, kids: 0 }, couple: { adults: 2, kids: 0 }, family: { adults: 2, kids: 2 }, parents: { adults: 3, kids: 0 }, pet: { adults: 2, kids: 0 } }[who] || { adults: 2, kids: 0 };
}

const ROAD = 1.35; // 직선거리 → 도로 거리 (일정 엔진과 같은 보정)
const round100 = (n) => Math.round(n / 100) * 100;

/**
 * trip: planTrip 결과, input: 조건, people: {adults, kids}, fees: fees.json, lodgingType: trip.lodging.type
 * 반환: { rows: [{key, low, high, detail}], total: {low, high}, perPerson: {low, high}, unknownFees: [이름], farBus: n }
 */
export function estimateTrip(trip, input, people, fees = {}, benefits = []) {
  const n = Math.max(1, people.adults + people.kids);
  const rows = [];

  // 1) 교통: 일정의 모든 이동 + 매일 숙소로 돌아가는 길
  const legs = [];
  for (const d of trip.days) {
    for (const it of d.items) if (it.travelMode && it.travelMode !== "same" && it.travelMode !== "walk") legs.push({ km: it.km || 0, mode: it.travelMode });
    if (trip.lodging && d.toLodgingKm != null && d.dayIdx < input.days - 1) {
      const km = d.toLodgingKm * ROAD;
      if (km > 1.2) legs.push({ km, mode: input.move === "transit" ? "bus" : input.move });
    }
  }
  let farBus = 0;
  if (input.move === "taxi") {
    // 먼 출발지에서 오는 구간(60km 넘음)은 일정 엔진이 기차·버스로 잡는다 → 택시 요금에서 빼고 "별도"로 알린다
    const taxiLegs = legs.filter((l) => l.mode === "taxi");
    farBus = legs.filter((l) => l.mode === "bus").length;
    const cars = Math.ceil(n / TAXI.seats);
    const low = taxiLegs.reduce((s, l) => s + taxiFare(l.km), 0) * cars;
    rows.push({ key: "taxi", low: round100(low), high: round100(low * TAXI.highFactor), detail: { legs: taxiLegs.length, cars, far: farBus } });
  } else if (input.move === "car") {
    const km = legs.reduce((s, l) => s + l.km, 0);
    const low = (km / FUEL.kmPerL) * FUEL.pricePerL;
    rows.push({ key: "fuel", low: round100(low), high: round100(low * FUEL.highFactor), detail: { km: Math.round(km) } });
  } else {
    const bus = legs.filter((l) => l.mode === "bus");
    farBus = bus.filter((l) => l.km > BUS.farKm).length;
    const low = (bus.length - farBus) * BUS.fare * n; // 먼 구간(시외·고속버스, KTX)은 요금이 달라 합계에서 빼고 따로 알린다
    rows.push({ key: "bus", low, high: low, detail: { rides: bus.length, far: farBus } });
  }

  // 2) 입장료: 관광공사 요금(fees.json). 요금 정보가 없는 곳은 따로 알린다
  let feeLow = 0;
  const unknownFees = [];
  const seen = new Set();
  for (const d of trip.days) for (const it of d.items) {
    const p = it.place;
    if (seen.has(p.id) || ["food", "cafe"].includes(p.cat) || p.multi) continue;
    seen.add(p.id);
    const f = fees[p.id];
    if (f) feeLow += f.adult * people.adults + f.child * people.kids;
    else unknownFees.push(p);
  }
  rows.push({ key: "fees", low: feeLow, high: feeLow, detail: { known: seen.size - unknownFees.length } });

  // 3) 식사·카페 (가정값)
  const meals = { lunch: 0, dinner: 0, cafe: 0 };
  for (const d of trip.days) for (const it of d.items) {
    if (it.kind === "lunch") meals.lunch++;
    else if (it.kind === "dinner") meals.dinner++;
    else if (it.place.cat === "cafe") meals.cafe++;
  }
  const eaters = people.adults + people.kids * ASSUME.childMeal;
  const sum = (i) => (meals.lunch * ASSUME.lunch[i] + meals.dinner * ASSUME.dinner[i] + meals.cafe * ASSUME.cafe[i]) * eaters;
  rows.push({ key: "meals", low: round100(sum(0)), high: round100(sum(1)), detail: meals });

  // 4) 숙박 (가정값): 게스트하우스는 1인, 나머지는 방(4명까지 1실)
  const nights = Math.max(0, input.days - 1);
  if (nights && trip.lodging) {
    const type = trip.lodging.type;
    const range = ASSUME.room[type] || ASSUME.room.pension;
    const units = type === "guesthouse" ? n : (Number.isInteger(people.rooms) && people.rooms > 0 ? people.rooms : Math.ceil(n / 4));
    rows.push({ key: "stay", low: range[0] * units * nights, high: range[1] * units * nights, detail: { nights, units, type } });
  }

  const total = { low: rows.reduce((s, r) => s + r.low, 0), high: rows.reduce((s, r) => s + r.high, 0) };
  // 5) 돌려받는 돈: 입장권만 내면 바로 주는 장소 환급(지역 상품권)은 확실한 몫으로 빼고,
  //    신청·심사가 필요한 지원 사업은 "조건이 맞으면 최대"로 따로 보여 준다 (합계에서 빼지 않음)
  const sure = benefits.filter((b) => b.kind === "place" && b.status === "auto").map((b) => ({ id: b.id, title: b.title, amount: b.amount * n }));
  const maybe = benefits.filter((b) => b.kind === "program" && b.status !== "closed").map((b) => ({ id: b.id, title: b.title, amount: b.amount, unconfirmed: !!b.unconfirmed }));
  const back = sure.reduce((s, b) => s + b.amount, 0);
  const net = { low: Math.max(0, total.low - back), high: Math.max(0, total.high - back) };
  return { rows, total, net, refund: { sure, maybe, back }, perPerson: { low: round100(net.low / n), high: round100(net.high / n) }, unknownFees, farBus, people: { ...people }, n };
}
