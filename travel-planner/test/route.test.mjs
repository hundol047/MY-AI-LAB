// 여러 권역을 이어 가는 일정: 날짜 나눔, 권역별 숙소, 밤마다 숙소 출발, 장소 중복 없음, 운영시간 충돌 0
import assert from "node:assert/strict";
import { planTrip, regionForDay, routeOf, swapItem, lodgingForDay } from "../public/planner.js";

const R = ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"];
const routes = [];
for (const a of R) for (const b of R) if (a !== b) { routes.push([a, b]); for (const c of R) if (c !== a && c !== b) routes.push([a, b, c]); }
let n = 0;
for (const route of routes) for (const days of [2, 3, 4, 5]) for (const move of ["car", "transit"]) for (const who of ["couple", "family", "pet"]) {
  if (route.length > days) continue;
  const input = { region: route[0], route, date: "2026-11-14", days, who, likes: ["sea", "food"], move };
  const label = `${route.join("→")} ${days}일 ${move} ${who}`;
  const t = planTrip(input, { pace: "normal" });
  n++;
  assert.equal(t.totals.conflicts, 0, `${label}: 운영시간 충돌`);
  assert.deepEqual(t.route, routeOf(input), `${label}: 경로`);
  // 날짜 나눔: 권역마다 하루 이상, 앞 권역부터, 순서대로
  const per = t.days.map((d, i) => regionForDay(input, i));
  assert.deepEqual([...new Set(per)], route, `${label}: 권역 순서 ${per}`);
  t.days.forEach((d, i) => assert.equal(d.region, per[i], `${label}: ${i + 1}일차 권역`));
  // 숙소: 밤(일수-1)을 빈틈없이 덮고, 둘째 날부터는 전날 밤 숙소에서 출발
  const nights = t.lodgings.reduce((a, l) => a + l.nights, 0);
  assert.equal(nights, days - 1, `${label}: 박수 합`);
  let cursor = 0;
  for (const l of t.lodgings) { assert.equal(l.from, cursor, `${label}: 숙소 구간이 이어지지 않음`); cursor += l.nights; }
  for (let i = 1; i < days; i++) assert.equal(t.days[i].start.name, `숙소(${lodgingForDay(t, i - 1).name})`, `${label}: ${i + 1}일차 출발`);
  for (let i = 0; i < days - 1; i++) assert.ok(t.days[i].lodging && t.days[i].toLodgingKm != null, `${label}: ${i + 1}일차 밤 숙소`);
  // 같은 장소를 두 번 넣지 않는다
  const ids = t.days.flatMap((d) => d.items.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length, `${label}: 장소 중복`);
  assert.ok(t.days.every((d) => d.items.length >= 2), `${label}: 빈 날`);
}
// 바꾸기를 해도 권역별 숙소와 그날 권역이 유지된다
{
  const input = { region: "chuncheon", route: ["chuncheon", "seorak", "gangneung"], date: "2026-11-14", days: 3, who: "couple", likes: ["sea"], move: "car" };
  const t = planTrip(input, {});
  const s = swapItem(t, input, {}, 1, 1);
  assert.equal(s.lodgings, t.lodgings);
  assert.equal(s.days[1].region, "seorak");
  assert.equal(s.days[1].lodging?.id, t.days[1].lodging?.id);
  assert.equal(s.totals.conflicts, 0);
}
// 권역이 하나면 예전 일정과 똑같다
{
  const input = { region: "gangneung", date: "2026-11-14", days: 3, who: "couple", likes: ["sea"], move: "car" };
  const a = planTrip(input, {}), b = planTrip({ ...input, route: ["gangneung"] }, {});
  assert.deepEqual(b.days.map((d) => d.items.map((x) => x.id)), a.days.map((d) => d.items.map((x) => x.id)));
  assert.equal(a.lodgings, undefined);
}
console.log(`ok - 여러 권역 일정 ${n}개 조합 (날짜 나눔·권역별 숙소·숙소 출발·중복 없음·충돌 0)`);
