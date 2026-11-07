// 혼잡 예측: 붐비는 날(집중률 70 이상)은 그곳을 뒤로 미루고, 꼭 넣어 달라고 한 곳은 그대로 넣는다. crowd.json 형식 확인
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planTrip, setCrowd, crowdOn } from "../public/planner.js";
import { PLACES } from "../public/data.js";

const input = { region: "gangneung", date: "2026-11-14", days: 1, who: "couple", likes: ["sea", "culture"], move: "car" };
setCrowd({});
const base = planTrip(input, {});
const target = base.days[0].items.find((x) => x.kind === "visit" && x.place.cat !== "festival")?.id;
assert.ok(target, "기준 일정에 관광지가 없다");
// 그날 다른 곳(평균 30)보다 유난히 붐빈다고 하면 다른 곳으로 바뀐다
const calm = Object.fromEntries(PLACES.slice(0, 40).filter((p) => p.id !== target).map((p) => [p.id, { rates: { "2026-11-14": 30 } }]));
setCrowd({ ...calm, [target]: { rates: { "2026-11-14": 99 } } });
assert.equal(crowdOn(target, "2026-11-14"), 99);
const busy = planTrip(input, {});
assert.ok(!busy.days[0].items.some((x) => x.id === target), `붐비는 날인데 ${target}이 그대로 들어감`);
assert.equal(busy.totals.conflicts, 0);
// 다른 날은 영향 없음
assert.deepEqual(planTrip({ ...input, date: "2026-11-15" }, {}).days[0].items.map((x) => x.id), (setCrowd({}), planTrip({ ...input, date: "2026-11-15" }, {})).days[0].items.map((x) => x.id));
// 꼭 넣어 달라고 한 곳은 붐벼도 넣는다
setCrowd({ ...calm, [target]: { rates: { "2026-11-14": 99 } } });
assert.ok(planTrip(input, { must: [target] }).days[0].items.some((x) => x.id === target), "must 장소가 빠짐");
// 모든 곳이 붐비는 날(주말)에는 미루지 않는다
setCrowd({ ...Object.fromEntries(Object.keys(calm).map((id) => [id, { rates: { "2026-11-14": 95 } }])), [target]: { rates: { "2026-11-14": 99 } } });
assert.deepEqual(planTrip(input, {}).days[0].items.map((x) => x.id), base.days[0].items.map((x) => x.id), "다 붐비는 날인데 일정이 바뀜");
setCrowd({});
// crowd.json: 앱 장소 id, 날짜 형식, 값 범위
const c = JSON.parse(await readFile(new URL("../public/crowd.json", import.meta.url), "utf8"));
const ids = new Set(PLACES.map((p) => p.id));
const entries = Object.entries(c.places);
assert.ok(entries.length >= 60, `혼잡 예측이 붙은 장소가 너무 적다: ${entries.length}`);
for (const [id, v] of entries) {
  assert.ok(ids.has(id), `앱에 없는 장소 ${id}`);
  for (const [d, r] of Object.entries(v.rates)) { assert.match(d, /^\d{4}-\d{2}-\d{2}$/); assert.ok(r >= 0 && r <= 100, `${id} ${d} ${r}`); }
}
console.log(`ok - 혼잡 예측 ${entries.length}곳 (유난히 붐비는 날 미루기·다 붐비는 날 유지·must 유지·다른 날 영향 없음)`);
