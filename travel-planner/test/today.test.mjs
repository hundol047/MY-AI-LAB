import assert from "node:assert/strict";
import { planTrip, replanFromNow, verify } from "../public/planner.js";
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
// 지금부터 다시 짜기: 지난 일정은 그대로, 남은 일정은 지금 이후에 시작, 같은 장소 두 번 없음, 운영시간 충돌 없음
for (const [now, rain] of [[13 * 60 + 10, false], [15 * 60, true]]) {
  const t2 = replanFromNow(trip, input, {}, 0, now, null, rain);
  const items = t2.days[0].items, done = d0.items.filter((it) => it.start < now);
  assert.deepEqual(items.slice(0, done.length).map((it) => it.id), done.map((it) => it.id), "다녀온 곳은 그대로");
  for (const it of items.slice(done.length)) assert.ok(it.start >= now, "남은 일정은 지금 이후");
  assert.equal(new Set(items.map((it) => it.id)).size, items.length, "같은 곳 두 번 없음");
  assert.equal(verify(t2.days), 0, "운영시간 충돌 없음");
  assert.ok(items.filter((it) => it.kind === "lunch").length <= 1, "점심 한 번");
  if (rain) for (const it of items.slice(done.length)) assert.ok(it.place.indoor || it.place.cat === "food", `비: 실내만 (${it.place.name})`);
  assert.deepEqual(t2.days[1].items.map((it) => it.id), trip.days[1].items.map((it) => it.id), "다른 날은 그대로");
}
console.log("ok - 여행 중 모드 (지금 일정·출발 시각·위치 기준 재계산·마감 지각·지금부터 다시 짜기)");
{
  const { reminderList } = await import("../public/today.js");
  const list = reminderList(trip);
  const d0 = trip.days[0], f = d0.items[0];
  assert.ok(list.length >= trip.days.length && list.length <= 60);
  // 첫 알림: 첫날 첫 일정 출발 1시간 전 (한국 시간)
  const kst = new Date(list[0].at + 9 * 3600e3);
  assert.equal(kst.toISOString().slice(0, 10), d0.date);
  assert.equal(kst.getUTCHours() * 60 + kst.getUTCMinutes(), f.start - f.travelMin - 60);
  assert.ok(list.every((x, i) => !i || x.at >= list[i - 1].at), "시각 순서");
  console.log(`ok - 출발 알림 ${list.length}개 (날마다 첫 일정 1시간 전 + 장소마다 출발 15분 전)`);
}
