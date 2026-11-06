import assert from "node:assert/strict";
import { planTrip } from "../public/planner.js";
import { todayStatus, kstNow } from "../public/today.js";
const input = { region: "gangneung", date: "2026-11-10", days: 2, who: "couple", likes: [], move: "car" };
const trip = planTrip(input, {});
const d0 = trip.days[0], first = d0.items[0];
assert.equal(todayStatus(trip, { date: "2026-12-01", min: 600 }), null, "여행 날이 아니면 없음");
const before = todayStatus(trip, { date: "2026-11-10", min: first.start - 90 });
assert.equal(before.state, "before"); assert.equal(before.item.id, first.id); assert.equal(before.leaveBy, first.start - first.travelMin);
const at = todayStatus(trip, { date: "2026-11-10", min: first.start + 1 });
assert.equal(at.state, "at"); assert.equal(at.item.id, first.id);
const done = todayStatus(trip, { date: "2026-11-10", min: 23 * 60 + 50 });
assert.equal(done.state, "done");
// 멀리 있으면(서울) 늦는다고 알려야 한다
const far = todayStatus(trip, { date: "2026-11-10", min: first.start - 30 }, { lat: 37.5547, lng: 126.9707 }, "car");
assert.ok(far.travelMin > 120 && far.arrive > first.start);
assert.equal(kstNow(new Date("2026-11-06T15:30:00Z")).date, "2026-11-07");
assert.equal(kstNow(new Date("2026-11-06T15:30:00Z")).min, 30);
console.log("ok - 여행 중 모드 (지금 일정·출발 시각·위치 기준 재계산·마감 지각)");
