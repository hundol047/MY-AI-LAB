// 모든 조건 조합에서 영업시간·휴무 충돌이 없는지, 하루 일정이 성립하는지 검사
import assert from "node:assert/strict";
import { planTrip, swapItem, verify, parseRequestLocally } from "../public/planner.js";

let runs = 0;
for (const days of [1, 2, 3])
  for (const who of ["solo", "couple", "family", "parents"])
    for (const move of ["car", "transit"])
      for (const likes of [[], ["sea"], ["cafe", "food"], ["culture", "nature"], ["sea", "cafe", "food", "culture", "nature"]])
        for (const date of ["2026-11-09", "2026-11-10", "2026-11-14", "2026-11-15"])
          for (const pace of ["relaxed", "normal", "packed"])
            for (const rain of [false, true]) {
              const input = { date, days, who, likes, move };
              const opts = { pace, rainDays: [rain, rain, rain] };
              const trip = planTrip(input, opts);
              runs++;
              assert.equal(trip.totals.conflicts, 0, JSON.stringify(input));
              const ids = trip.days.flatMap((d) => d.items.map((i) => i.id));
              assert.equal(new Set(ids).size, ids.length, "중복 장소");
              for (const d of trip.days) {
                assert.ok(d.items.length >= 3, `일정이 너무 짧음 ${JSON.stringify(input)}`);
                assert.ok(d.items.some((i) => i.kind === "lunch"), "점심 없음");
                for (let k = 1; k < d.items.length; k++) assert.ok(d.items[k].start >= d.items[k - 1].end, "시간 겹침");
              }
              const swapped = swapItem(trip, input, opts, 0, 1);
              assert.equal(verify(swapped.days), 0);
              assert.notEqual(swapped.days[0].items[1]?.id, trip.days[0].items[1].id);
              assert.deepEqual(swapped.days[0].items[0].id, trip.days[0].items[0].id);
            }

assert.equal(parseRequestLocally("비가 와요").indoor, true);
assert.equal(parseRequestLocally("아이가 지쳤어요").lessWalk, true);
assert.deepEqual(parseRequestLocally("카페는 빼주세요").avoid, ["cafe"]);
console.log(`ok - ${runs}개 조합, 충돌 0건`);
