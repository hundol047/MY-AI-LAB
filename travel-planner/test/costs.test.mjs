// 예상 비용 계산: 택시 요금 공식, 인원·이동수단별 합계
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { taxiFare, estimateTrip, defaultPeople } from "../public/costs.js";
import { planTrip } from "../public/planner.js";

const fees = JSON.parse(readFileSync(new URL("../public/fees.json", import.meta.url)));
assert.equal(taxiFare(0), 0);
assert.equal(taxiFare(1.5), 4600, "2km까지 기본요금");
assert.equal(taxiFare(2), 4600);
assert.equal(taxiFare(3), 4600 + Math.ceil(1000 / 131) * 100, "2km 이후 131m당 100원");
assert.equal(taxiFare(6.3), 4600 + Math.ceil(4300 / 131) * 100);

for (const move of ["car", "taxi", "transit"]) for (const days of [1, 2, 5]) for (const who of ["solo", "couple", "family", "parents"]) {
  const input = { region: "gangneung", date: "2026-11-10", days, who, likes: [], move };
  const trip = planTrip(input, {});
  const e = estimateTrip(trip, input, defaultPeople(who), fees);
  assert.ok(e.total.low > 0 && e.total.low <= e.total.high, JSON.stringify({ input, total: e.total }));
  assert.equal(e.rows.some((r) => r.key === "stay"), days > 1, "숙박은 1박 이상일 때만");
  assert.ok(e.rows.some((r) => r.key === { car: "fuel", taxi: "taxi", transit: "bus" }[move]));
  for (const r of e.rows) assert.ok(r.low >= 0 && r.low <= r.high, r.key);
}
// 5명이면 택시 2대
{
  const input = { region: "gangneung", date: "2026-11-10", days: 2, who: "family", likes: [], move: "taxi" };
  const trip = planTrip(input, {});
  const four = estimateTrip(trip, input, { adults: 2, kids: 2 }, fees).rows.find((r) => r.key === "taxi");
  const five = estimateTrip(trip, input, { adults: 3, kids: 2 }, fees).rows.find((r) => r.key === "taxi");
  assert.equal(four.detail.cars, 1); assert.equal(five.detail.cars, 2);
  assert.equal(five.low, four.low * 2);
}
// 출발지: 서울에서 출발하면 첫 구간이 길고, 택시·대중교통은 그 구간을 기차·버스로 잡아 택시·시내버스 요금에서 뺀다
{
  const start = { name: "서울역", lat: 37.5547, lng: 126.9707 };
  for (const move of ["car", "taxi", "transit"]) {
    const input = { region: "gangneung", date: "2026-11-10", days: 2, who: "couple", likes: [], move };
    const trip = planTrip(input, { start, startTime: "08:00" });
    assert.equal(trip.days[0].start.name, "서울역");
    assert.equal(trip.totals.conflicts, 0);
    const first = trip.days[0].items[0];
    assert.ok(first.travelMin >= 120, "서울에서 오는 첫 구간은 2시간 넘게");
    assert.equal(first.travelMode, move === "car" ? "car" : "bus");
    const e = estimateTrip(trip, input, { adults: 2, kids: 0 }, fees);
    const row = e.rows[0];
    if (move !== "car") assert.equal(row.detail.far, 1, "먼 구간 1개는 별도");
    if (move === "transit") assert.equal(row.low, (row.detail.rides - row.detail.far) * 1700 * 2);
  }
  // 출발 시각을 정하면 그 시각에 떠난다
  const early = planTrip({ region: "gangneung", date: "2026-11-10", days: 1, who: "solo", likes: [], move: "car" }, { start, startTime: "07:00" });
  const late = planTrip({ region: "gangneung", date: "2026-11-10", days: 1, who: "solo", likes: [], move: "car" }, { start });
  assert.ok(early.days[0].items[0].start < late.days[0].items[0].start);
  // 잘못된 출발지는 무시하고 기본 출발점
  const bad = planTrip({ region: "gangneung", date: "2026-11-10", days: 1, who: "solo", likes: [], move: "car" }, { start: { name: "x", lat: "a" } });
  assert.equal(bad.days[0].start.name, "강릉역");
}
console.log("ok - 예상 비용·출발지");
