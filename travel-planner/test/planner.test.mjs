// 모든 조건 조합에서 영업시간·휴무 충돌이 없는지, 하루 일정이 성립하는지 검사
import assert from "node:assert/strict";
import { planTrip, swapItem, drives, verify, retimeDay, hoursFor, parseRequestLocally, benefitsFor, overnightCompare, souvenirsFor } from "../public/planner.js";
import { checkLodgingLocal, startLocal } from "../public/ai-local.js";
import { PLACES } from "../public/data.js";

let runs = 0, carDays = 0, carItems = 0, lunchDays = 0, allDays = 0;
function check(input, pace, rain) {
  const { days, move } = input;
  const opts = { pace, rainDays: Array(days).fill(rain) };
  const trip = planTrip(input, opts);
  runs++;
  assert.equal(trip.totals.conflicts, 0, JSON.stringify(input));
  const ids = trip.days.flatMap((d) => d.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length, "중복 장소");
  for (const d of trip.days) {
    // 강원 산간은 대중교통 배차가 적어 하루 1곳도 허용, 자동차는 최소 2곳
    assert.ok(d.items.length >= (drives(move) ? 2 : 1), `일정이 너무 짧음 ${JSON.stringify(input)}`);
    if (drives(move)) { carDays++; carItems += d.items.length; }
    allDays++; if (d.items.some((i) => i.kind === "lunch")) lunchDays++;
    for (let k = 1; k < d.items.length; k++) assert.ok(d.items[k].start >= d.items[k - 1].end, "시간 겹침");
  }
  // 숙소는 여행 내내 한 곳: 둘째 날부터 모두 같은 숙소에서 출발
  if (days > 1) {
    assert.ok(trip.lodging, "숙소 추천 없음");
    for (let k = 1; k < trip.days.length; k++) assert.equal(trip.days[k].start.lat, trip.lodging.lat, "숙소가 바뀜");
  } else assert.equal(trip.lodging, null);
  const swapped = swapItem(trip, input, opts, 0, 1);
  assert.equal(verify(swapped.days), 0);
  assert.notEqual(swapped.days[0].items[1]?.id, trip.days[0].items[1].id);
  assert.deepEqual(swapped.days[0].items[0].id, trip.days[0].items[0].id);
  assert.equal(swapped.lodging?.id, trip.lodging?.id, "바꾸기 후에도 숙소 유지");
}

// 기본: 권역·기간(1~3일)·동행·이동(자동차·택시·대중교통)·취향·요일·계절·속도·날씨의 모든 조합
for (const region of ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"])
for (const days of [1, 2, 3])
  for (const who of ["solo", "couple", "family", "parents"])
    for (const move of ["car", "taxi", "transit"])
      for (const likes of [[], ["sea"], ["cafe", "food"], ["culture", "nature"], ["sea", "cafe", "food", "culture", "nature"]])
        for (const date of ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-14", "2026-11-15", "2027-07-07"])
          for (const pace of ["relaxed", "normal", "packed"])
            for (const rain of [false, true]) check({ region, date, days, who, likes, move }, pace, rain);
// 긴 일정: 3박 4일·4박 5일 (장소가 모자라 같은 곳을 다시 넣거나 하루가 비지 않는지)
for (const region of ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"])
for (const days of [4, 5])
  for (const who of ["solo", "family", "parents"])
    for (const move of ["car", "taxi", "transit"])
      for (const likes of [[], ["sea", "food"], ["culture", "nature"]])
        for (const date of ["2026-11-09", "2026-11-14", "2027-07-07"])
          for (const pace of ["normal", "packed"])
            for (const rain of [false, true]) check({ region, date, days, who, likes, move }, pace, rain);

assert.ok(carItems / carDays >= 4, `자동차 일정 하루 평균 장소 수 ${carItems / carDays}`);
// 휠체어·유모차: 오래 걷는 곳(walk 3)은 넣지 않고, 휠체어면 무장애 정보(경사로) 없는 walk 2도 넣지 않는다
for (const region of ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"])
  for (const access of [["wheelchair"], ["stroller"]])
    for (const date of ["2026-11-10", "2027-07-07"]) {
      const trip = planTrip({ region, date, days: 2, who: "family", likes: [], move: "car" }, { access, lessWalk: true });
      assert.equal(verify(trip.days), 0, `이동 편의 ${region} ${access}`);
      for (const it of trip.days.flatMap((d) => d.items)) if (it.place.cat !== "festival") {
        assert.ok(it.place.walk < 3, `이동 편의 일정에 오래 걷는 곳: ${it.place.name}`);
        if (access.includes("wheelchair")) assert.ok(it.place.walk === 1 || it.place.access?.ramp, `휠체어 일정에 경사로 정보 없는 곳: ${it.place.name}`);
      }
    }
// 반려동물 동행: 목록에 없는 실내·식당·카페·문화시설은 넣지 않고, 반려동물 동행 전용 장소는 다른 동행에 쓰지 않는다
for (const region of ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"])
  for (const days of [1, 2, 3])
    for (const move of ["car", "transit"])
      for (const date of ["2026-11-10", "2026-11-14", "2027-07-07"]) {
        const trip = planTrip({ region, date, days, who: "pet", likes: [], move }, {});
        assert.equal(verify(trip.days), 0, `반려동물 ${region} ${date}`);
        for (const it of trip.days.flatMap((d) => d.items)) if (it.place.cat !== "festival") assert.ok(it.place.pet || (!it.place.indoor && ["nature", "sea"].includes(it.place.cat)), `반려동물 일정에 확인 안 된 곳: ${it.place.name}`);
        const other = planTrip({ region, date, days, who: "couple", likes: [], move }, {});
        assert.ok(!other.days.some((d) => d.items.some((i) => i.place.petOnly)), "반려동물 전용 장소가 다른 동행에 들어감");
      }
assert.ok(lunchDays / allDays >= 0.97, `점심 포함 비율 ${lunchDays / allDays}`);
console.log(`자동차 하루 평균 ${(carItems / carDays).toFixed(1)}곳, 점심 포함 ${(100 * lunchDays / allDays).toFixed(1)}%`);

// 검사기가 위반을 실제로 잡아내는지 (휴무·입장마감·브레이크타임)
const P = (id) => PLACES.find((p) => p.id === id);
const fake = (id, date, weekday, s, e) => [{ date, weekday, items: [{ place: P(id), start: s, end: e }] }];
assert.equal(verify(fake("chamsori", "2026-11-10", 2, 600, 670)), 1, "화요일 휴관");
assert.equal(verify(fake("chamsori", "2026-11-12", 4, 950, 1010)), 1, "입장마감 15:30 이후");
assert.equal(verify(fake("chodang-tofu", "2026-11-12", 4, 950, 1000)), 1, "브레이크타임");
assert.equal(verify(fake("sea-trail", "2026-11-12", 4, 940, 980)), 1, "동절기 매표마감 15:30");
assert.equal(verify(fake("sea-trail", "2027-07-08", 4, 940, 980)), 0, "하절기는 16:30까지 입장");
assert.equal(hoursFor(P("solhyang"), "2026-12-01").close, 17 * 60);

// 실제 도로 시간으로 재계산해도 운영시간을 지키는지
{
  const input = { date: "2026-11-12", days: 1, who: "couple", likes: ["sea", "cafe"], move: "car" };
  const trip = planTrip(input, {});
  const day = trip.days[0];
  const re = retimeDay(day, input, {}, day.items.map((i) => i.travelMin + 3));
  assert.ok(re);
  assert.equal(verify([re]), 0);
  assert.ok(re.items[0].start >= day.items[0].start);
}

// 혜택 내비: 일정에 있는 장소의 환급 혜택은 자동, 기간이 끝난 사업은 종료로
{
  const input = { region: "chuncheon", date: "2026-11-14", days: 2, who: "couple", likes: ["nature"], move: "car" };
  const trip = planTrip(input, { must: ["soyang-skywalk"] });
  const b = benefitsFor(trip, input);
  assert.ok(b.some((x) => x.id === "b-soyang" && x.status === "auto"));
  assert.equal(b.find((x) => x.id === "b-incentive")?.status, "closed", "9/30 마감 사업은 종료");
  const pc = planTrip({ ...input, region: "pyeongchang" }, { must: ["sheep"] });
  assert.equal(benefitsFor(pc, { ...input, region: "pyeongchang" }).find((x) => x.id === "b-halfprice")?.status, "check");
}
// 1박 전환: 당일치기보다 볼 곳이 늘고, 첫날 밤 코스가 생긴다
{
  const input = { region: "gangneung", date: "2026-11-14", days: 1, who: "couple", likes: ["sea", "food"], move: "car" };
  const c = overnightCompare(input, {});
  assert.ok(c.added.length >= 3, "1박이면 더 많은 곳");
  assert.ok(c.endAfter > c.endBefore, "첫날 일정이 더 늦게까지");
  assert.ok(c.lodging, "숙소 추천");
  assert.equal(overnightCompare({ ...input, days: 2 }, {}), null);
}
// 특산물: 먹은 곳에서 중복 없이
{
  const trip = planTrip({ region: "chuncheon", date: "2026-11-14", days: 2, who: "couple", likes: ["food"], move: "car" }, {});
  const s = souvenirsFor(trip);
  assert.equal(new Set(s.map((x) => x.item)).size, s.length);
  assert.ok(s.length >= 1);
}
// 숙소 안심 체크 (AI 없이)
{
  const r = checkLodgingLocal("1박 89,000원 / 체크인 15시 / 이용일 3일 전부터 환불 불가 / 바비큐 2만원 별도 / 후기: 방음이 안 돼서 시끄러웠어요, 화장실에 곰팡이");
  assert.equal(r.cancel.risk, "high");
  assert.equal(r.price.risk, "mid");
  assert.ok(r.reviews.length >= 2);
}
// 한 줄 시작 (AI 없이)
{
  const r = startLocal("다음 주말 부모님이랑 속초 1박 기차로", "2026-11-04");
  assert.equal(r.region, "seorak"); assert.equal(r.days, 2); assert.equal(r.who, "parents"); assert.equal(r.move, "transit");
}

assert.equal(parseRequestLocally("비가 와요").indoor, true);
assert.equal(parseRequestLocally("아이가 지쳤어요").lessWalk, true);
assert.deepEqual(parseRequestLocally("카페는 빼주세요").avoid, ["cafe"]);
// 택시: 자동차와 같은 도로 시간, 주차 대신 기다리는 시간이라 조금 빠르다
{
  const a = { lat: 37.7643, lng: 128.8996 }, b = { lat: 37.8055, lng: 128.9087 };
  const car = planTrip({ region: "gangneung", date: "2026-11-10", days: 2, who: "couple", likes: [], move: "car" }, {});
  const taxi = planTrip({ region: "gangneung", date: "2026-11-10", days: 2, who: "couple", likes: [], move: "taxi" }, {});
  assert.ok(taxi.days.flatMap((d) => d.items).some((i) => i.travelMode === "taxi"), "택시 이동 표시");
  assert.ok(car.days.flatMap((d) => d.items).every((i) => i.travelMode !== "taxi"));
  void a; void b;
}
assert.equal(startLocal("다음 주 3박 4일 속초 택시로", "2026-11-04").days, 4);
assert.equal(startLocal("4박 5일 강릉 여행", "2026-11-04").days, 5);
assert.equal(startLocal("주말에 택시 타고 춘천", "2026-11-04").move, "taxi");
console.log(`ok - ${runs}개 조합, 충돌 0건`);
