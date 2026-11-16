// 추천 코스 500개: 장소가 모두 있고, 아무 날짜에나 적용해도 운영시간 충돌 없이 코스 장소 대부분이 들어가며, 걷기 조건을 지킨다
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planTrip, verify, dayWalkMeters } from "../public/planner.js";
import { PLACES } from "../public/data.js";

const { courses } = JSON.parse(readFileSync(new URL("../public/courses.json", import.meta.url), "utf8"));
const ids = new Set(PLACES.map((p) => p.id));
assert.ok(courses.length >= 500, `코스 ${courses.length}개`);
assert.equal(new Set(courses.map((c) => c.id)).size, courses.length, "코스 id 중복");
for (const c of courses) for (const id of c.items.flat()) assert.ok(ids.has(id), `${c.id}: 없는 장소 ${id}`);
// 조건마다 코스가 있어야 고를 수 있다 (지역 × 걷기 조건)
for (const region of ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"]) for (const access of ["", "walker", "wheelchair"])
  assert.ok(courses.some((c) => c.region === region && c.access === access), `${region}/${access || "제한 없음"} 코스 없음`);

// 여러 날짜(평일·주말·계절)에 적용: 충돌 0, 코스 장소 평균 70% 이상 유지, 걷기 조건 한도
const dates = ["2026-11-17", "2026-11-21", "2027-02-03", "2027-05-08", "2027-08-12"];
let kept = 0, total = 0, conflicts = 0, over = 0, n = 0;
courses.forEach((c, i) => {
  if (i % 3) return; // 3개 중 1개만 (시간)
  const date = dates[i % dates.length];
  const t = planTrip({ region: c.region, date, days: c.days, who: c.who, move: c.move, likes: [c.theme] },
    { keep: c.items, softKeep: true, lodgingId: c.lodging || undefined, ...(c.access ? { access: [c.access], lessWalk: true } : {}) });
  conflicts += verify(t.days);
  const got = new Set(t.days.flatMap((d) => d.items.map((x) => x.id)));
  const want = c.items.flat();
  kept += want.filter((id) => got.has(id)).length; total += want.length; n++;
  if (c.access) for (const d of t.days) if (dayWalkMeters(d) > (c.access === "walker" ? 1500 : 2000) * 1.15) over++;
});
assert.equal(conflicts, 0, "추천 코스 적용 후 운영시간 충돌");
assert.ok(kept / total >= 0.7, `코스 장소 유지율 ${Math.round((kept / total) * 100)}%`);
assert.ok(over <= n * 0.05, `걷기 조건 한도 크게 넘김 ${over}`);
console.log(`ok - 추천 코스 ${courses.length}개 (${n}개를 여러 날짜에 적용: 충돌 0 · 코스 장소 유지 ${Math.round((kept / total) * 100)}% · 걷기 한도 크게 넘김 ${over})`);
