// 모든 조건 조합에서 영업시간·휴무 충돌이 없는지, 하루 일정이 성립하는지 검사
import assert from "node:assert/strict";
import { planTrip, swapItem, verify, retimeDay, hoursFor, parseRequestLocally } from "../public/planner.js";
import { PLACES } from "../public/data.js";

let runs = 0, carDays = 0, carItems = 0, lunchDays = 0, allDays = 0;
for (const region of ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"])
for (const days of [1, 2, 3])
  for (const who of ["solo", "couple", "family", "parents"])
    for (const move of ["car", "transit"])
      for (const likes of [[], ["sea"], ["cafe", "food"], ["culture", "nature"], ["sea", "cafe", "food", "culture", "nature"]])
        for (const date of ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-14", "2026-11-15", "2027-07-07"])
          for (const pace of ["relaxed", "normal", "packed"])
            for (const rain of [false, true]) {
              const input = { region, date, days, who, likes, move };
              const opts = { pace, rainDays: [rain, rain, rain] };
              const trip = planTrip(input, opts);
              runs++;
              assert.equal(trip.totals.conflicts, 0, JSON.stringify(input));
              const ids = trip.days.flatMap((d) => d.items.map((i) => i.id));
              assert.equal(new Set(ids).size, ids.length, "중복 장소");
              for (const d of trip.days) {
                // 강원 산간은 대중교통 배차가 적어 하루 1곳도 허용, 자동차는 최소 2곳
                assert.ok(d.items.length >= (move === "car" ? 2 : 1), `일정이 너무 짧음 ${JSON.stringify(input)}`);
                if (move === "car") { carDays++; carItems += d.items.length; }
                allDays++; if (d.items.some((i) => i.kind === "lunch")) lunchDays++;
                for (let k = 1; k < d.items.length; k++) assert.ok(d.items[k].start >= d.items[k - 1].end, "시간 겹침");
              }
              for (let k = 0; k < trip.days.length - 1; k++) assert.ok(trip.days[k].lodging, "숙소 추천 없음");
              assert.ok(!trip.days[trip.days.length - 1].lodging, "마지막 날은 숙소 없음");
              const swapped = swapItem(trip, input, opts, 0, 1);
              assert.equal(verify(swapped.days), 0);
              assert.notEqual(swapped.days[0].items[1]?.id, trip.days[0].items[1].id);
              assert.deepEqual(swapped.days[0].items[0].id, trip.days[0].items[0].id);
            }

assert.ok(carItems / carDays >= 4, `자동차 일정 하루 평균 장소 수 ${carItems / carDays}`);
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

assert.equal(parseRequestLocally("비가 와요").indoor, true);
assert.equal(parseRequestLocally("아이가 지쳤어요").lessWalk, true);
assert.deepEqual(parseRequestLocally("카페는 빼주세요").avoid, ["cafe"]);
console.log(`ok - ${runs}개 조합, 충돌 0건`);
