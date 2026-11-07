import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestArrival, returnTrips, hasRoute } from "../public/transit.js";
import { planTrip, verify } from "../public/planner.js";
import { estimateTrip } from "../public/costs.js";
const T = JSON.parse(readFileSync(new URL("../public/transit.json", import.meta.url)));
const fake = { routes: [
  { mode: "train", dir: "in", from: "청량리역", region: "gangneung", toName: "강릉역", days: "weekday", date: "20261110", trips: [{ dep: "06:00", arr: "07:44", grade: "KTX-이음", fare: 26000 }, { dep: "08:00", arr: "09:40", grade: "KTX-이음", fare: 26000 }] },
  { mode: "express", dir: "in", from: "청량리역", region: "gangneung", toName: "강릉 고속버스터미널", days: "all", date: "20261108", trips: [{ dep: "07:00", arr: "09:30", grade: "우등", fare: 24300 }] },
  { mode: "train", dir: "out", from: "청량리역", region: "gangneung", toName: "강릉역", days: "weekday", date: "20261110", trips: [{ dep: "17:00", arr: "18:50", fare: 26000 }, { dep: "19:00", arr: "20:50", fare: 26000 }, { dep: "21:30", arr: "23:20", fare: 26000 }] },
] };
assert.equal(bestArrival(fake, "청량리역", "gangneung", "2026-11-10", 7 * 60).arr, "09:30", "07시 이후 가장 일찍 도착: 고속버스 09:30");
assert.equal(bestArrival(fake, "청량리역", "gangneung", "2026-11-10", 5 * 60).arr, "07:44");
assert.equal(bestArrival(fake, "청량리역", "gangneung", "2026-11-14", 5 * 60).mode, "express", "주말엔 평일 기차 시간표를 쓰지 않음");
const back = returnTrips(fake, "청량리역", "gangneung", "2026-11-10", 18 * 60, 1);
assert.deepEqual(back.map((x) => [x.dep, !!x.last]), [["19:00", false], ["21:30", true]], "다음 편 + 막차");
assert.ok(hasRoute(T, "청량리역", "gangneung") && hasRoute(T, "동서울종합터미널", "seorak"), "실제 시간표: 청량리→강릉, 동서울→속초");
// 실제 시간표로 첫날: 강릉역 도착 15분 뒤부터 일정
const a = bestArrival(T, "청량리역", "gangneung", "2026-11-10", 7 * 60);
assert.ok(a && a.depMin >= 420);
const begin = Math.ceil((a.arrMin + 15) / 5) * 5, hh = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const trip = planTrip({ region: "gangneung", date: "2026-11-10", days: 2, who: "couple", likes: [], move: "transit" }, { start: { name: a.hub, lat: 37.7643, lng: 128.8996 }, startTime: hh(begin) });
assert.equal(verify(trip.days), 0);
assert.ok(trip.days[0].items[0].start >= begin, "첫 일정은 도착 뒤");
// 운임: 어른 2명 왕복
const e = estimateTrip(trip, { region: "gangneung", days: 2, move: "transit" }, { adults: 2, kids: 1 }, {}, [], { go: 26000, back: 26000 });
const row = e.rows.find((r) => r.key === "longway");
assert.deepEqual([row.low, row.high], [52000 * 2 + 26000, 52000 * 3]);
console.log("ok - 오가는 길 시간표 (가는 편·돌아오는 편·막차·주말 구분·첫날 시작·운임)");
