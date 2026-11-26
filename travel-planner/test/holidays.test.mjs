// 명절·공휴일 휴무 (관광공사 '쉬는 날' 원문 → holiday-rules.js): 2027년 설날(2/6~2/9, 당일 2/7)과 1월 1일로 확인
import assert from "node:assert/strict";
import { hoursFor, planTrip, lunarDay } from "../public/planner.js";
import { PLACES } from "../public/data.js";
import { parseRest } from "../scripts/bake-holiday-rules.mjs";

const P = (id) => PLACES.find((p) => p.id === id);
const closed = (id, d) => hoursFor(P(id), d).closedToday;

// 원문 읽기
assert.deepEqual(parseRest("설/추석 당일"), { seollal: "day", chuseok: "day" });
assert.deepEqual(parseRest("매주 월요일 / 1월 1일 / 설·추석 연휴"), { newYear: true, seollal: "holiday", chuseok: "holiday" });
assert.equal(parseRest("매주 월요일 / 1월 1일 / 설·추석 오전").seollal, "am");
assert.ok(parseRest("매주 월요일※ 단, 월요일이 공휴일인 경우 개방하며, 그 다음 평일에 휴관").shiftNext);
assert.equal(parseRest("연중무휴"), null);
assert.equal(lunarDay("seollal", "2027-02-07"), "day"); assert.equal(lunarDay("seollal", "2027-02-06"), "eve");

// 설·추석 연휴 휴무 (원주한지테마파크: 연휴 3일 + 1월 1일)
for (const d of ["2027-02-06", "2027-02-07", "2027-02-08", "2027-01-01"]) assert.ok(closed("wj-hanji", d), `wj-hanji ${d}`);
assert.ok(!closed("wj-hanji", "2027-02-11"), "연휴 지나면 연다");
// 당일만 휴무 (평화의 댐)
assert.ok(closed("peace-dam", "2027-02-07")); assert.ok(!closed("peace-dam", "2027-02-06"));
// 오전 휴무 (박수근미술관: 설 당일 13시부터)
assert.ok(!closed("parksookeun", "2027-02-07")); assert.equal(hoursFor(P("parksookeun"), "2027-02-07").open, 13 * 60);
// 월요일이 공휴일이면 열고 다음 첫 평일에 쉰다 (영월 장릉: 2/8 월 설 연휴 → 열고, 연휴 끝난 2/10 수 휴관)
assert.ok(!closed("jangneung", "2027-02-08"), "공휴일 월요일은 연다");
assert.ok(closed("jangneung", "2027-02-10"), "연휴 다음 첫 평일 휴관");
assert.ok(!closed("jangneung", "2027-02-11"));
// 평소 월요일은 그대로 쉰다
assert.ok(closed("jangneung", "2027-01-11"));

// 일정에도 반영: 설 당일 원주 일정에 원주한지테마파크가 없다
for (const days of [1, 2]) {
  const trip = planTrip({ region: "wonju", date: "2027-02-07", days, who: "parents", likes: ["history", "nature"], move: "car" }, {});
  for (const d of trip.days) for (const it of d.items) assert.ok(!hoursFor(it.place, d.date).closedToday, `${d.date} ${it.place.id}`);
  assert.ok(!trip.days[0].items.some((it) => it.place.id === "wj-hanji"));
}
console.log("ok - 명절·공휴일 휴무 (설·추석 당일/오전/연휴, 1월 1일, 공휴일 월요일 개관·다음 평일 휴관)");
