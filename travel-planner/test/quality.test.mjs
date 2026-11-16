// 일정 품질 기준: 운영시간 충돌이 없어도 사람이 보기에 어색한 동선이 늘지 않게 막는다
// (권역 5 × 동행 4 × 이동 3 × 취향 3 × 날짜 2 × 1~3일 = 1,080개 일정, 약 2,160일)
// 기준을 넘으면 데이터나 엔진을 바꾼 뒤 동선이 나빠진 것이다
import assert from "node:assert/strict";
import { planTrip } from "../public/planner.js";

const R = ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"];
let days = 0, combo = 0;
const c = { gap60: 0, zigzag: 0, farStart: 0, leg75: 0, drive4h: 0, noDinner: 0, noLunch: 0, sameDish: 0, lateDayTrip: 0, mealFirst: 0, cafe3: 0, nightFar: 0 };
const DISH = /막국수|닭갈비|순두부|물회|추어탕|송어|곤드레|해장국|냉면/;
for (const region of R) for (const who of ["couple", "family", "parents", "pet"]) for (const move of ["car", "taxi", "transit"])
  for (const likes of [["sea", "food"], ["culture"], ["nature", "cafe"]]) for (const date of ["2026-11-14", "2027-04-21"]) for (const nd of [1, 2, 3]) {
    // 앱처럼 일정마다 다른 번호(seed)로 — 다양하게 골라도 품질 기준을 지켜야 한다
    const t = planTrip({ region, date, days: nd, who, likes, move }, { seed: 1 + (combo++) * 7919 });
    t.days.forEach((d, i) => {
      days++;
      const it = d.items;
      for (let k = 1; k < it.length; k++) if (it[k].start - it[k].travelMin - it[k - 1].end >= 60) { c.gap60++; break; }
      const areas = it.map((x) => x.place.area);
      for (let k = 2; k < areas.length; k++) if (areas[k] === areas[k - 2] && areas[k] !== areas[k - 1]) { c.zigzag++; break; }
      if (i > 0 && it[0]?.travelMin >= 60) c.farStart++;
      if (it.some((x) => x.travelMin >= 75)) c.leg75++;
      if (it.reduce((a, x) => a + x.travelMin, 0) >= 240) c.drive4h++;
      if (nd > 1 && i < nd - 1 && !it.some((x) => x.kind === "dinner")) c.noDinner++;
      if (!it.some((x) => x.kind === "lunch")) c.noLunch++;
      const ds = it.filter((x) => x.place.cat === "food").map((x) => (x.place.name.match(DISH) || [])[0]).filter(Boolean);
      if (new Set(ds).size < ds.length) c.sameDish++;
      if (nd === 1 && it.length && it[it.length - 1].end > 19 * 60 + 30) c.lateDayTrip++;
      if (it[0] && it[0].kind !== "visit") c.mealFirst++;
      if (it.filter((x) => x.place.cat === "cafe").length >= 3) c.cafe3++;
      { const k = it.findIndex((x) => x.kind === "dinner"); if (k >= 0 && it.slice(k + 1).some((x) => x.travelMin > 30)) c.nightFar++; }
    });
  }
const pct = (k) => (c[k] / days) * 100;
const LIMIT = { gap60: 1.5, zigzag: 14, farStart: 9, leg75: 8.5, drive4h: 6, noDinner: 0.5, noLunch: 0.5, sameDish: 0, lateDayTrip: 0, mealFirst: 0.5, cafe3: 0, nightFar: 0 };
const NAME = { gap60: "60분 넘는 빈 시간", zigzag: "지역 왔다 갔다", farStart: "숙소에서 첫 장소 60분+", leg75: "한 번 이동 75분+", drive4h: "하루 이동 4시간+", noDinner: "숙박일 저녁 없음", noLunch: "점심 없음", sameDish: "같은 음식 두 번", lateDayTrip: "당일치기 19:30 넘김", mealFirst: "식사로 시작", cafe3: "카페 3곳 이상", nightFar: "저녁 뒤 30분+ 이동" };
const over = Object.entries(LIMIT).filter(([k, lim]) => pct(k) > lim).map(([k, lim]) => `${NAME[k]} ${pct(k).toFixed(1)}% (기준 ${lim}% 이하)`);
assert.deepEqual(over, [], `일정 품질 기준 초과: ${over.join(", ")}\n전체: ${Object.keys(LIMIT).map((k) => `${NAME[k]} ${pct(k).toFixed(1)}%`).join(" · ")}`);
console.log(`ok - 일정 품질 ${days}일: ` + Object.keys(LIMIT).map((k) => `${NAME[k]} ${pct(k).toFixed(1)}%`).join(" · "));

// 일정 3개 고르기: 3박 4일이면 3개 일정 모두 1~4일차가 있고, 날마다 장소가 있어야 한다.
// 색다른 코스가 추천 장소를 다 빼서 하루에 관광지가 1곳 이하인 날이 많아지지 않게 (권역 5 × 이동 3 × 취향 2)
import { planOptions } from "../public/planner.js";
let optTrips = 0, thinDays = 0;
for (const region of R) for (const move of ["car", "taxi", "transit"]) for (const likes of [["sea", "food"], ["culture"]]) {
  const opts = planOptions({ region, date: "2026-11-14", days: 4, who: "couple", likes, move }, {});
  assert.deepEqual(opts.map((o) => o.key), ["best", "relaxed", "different"], `${region}/${move}: 일정 3개`);
  for (const o of opts) {
    assert.equal(o.trip.days.length, 4, `${region}/${move}/${o.key}: 4일`);
    o.trip.days.forEach((d, i) => {
      assert.ok(d.items.length >= 2, `${region}/${move}/${o.key} ${i + 1}일차 장소 ${d.items.length}곳`);
      if (d.items.filter((x) => x.kind === "visit").length < 2) thinDays++;
    });
  }
  optTrips++;
}
assert.ok(thinDays / (optTrips * 12) <= 0.01, `관광지 1곳 이하인 날 ${thinDays}/${optTrips * 12}`);
console.log(`ok - 3박 4일 일정 3개 × ${optTrips}건: 모두 1~4일차 · 관광지 1곳 이하인 날 ${thinDays}/${optTrips * 12}`);

// 다양하게: 같은 조건이라도 번호(seed)가 다르면 다른 코스, 같으면 같은 코스 (링크·저장 복원)
{
  const input = { region: "gangneung", date: "2026-11-21", days: 2, who: "couple", likes: [], move: "car" };
  const key = (t) => t.days.flatMap((d) => d.items.map((x) => x.id)).join();
  const runs = Array.from({ length: 8 }, (_, i) => planTrip(input, { seed: 11 + i * 7919 }));
  const distinct = new Set(runs.map(key)).size;
  assert.ok(distinct >= 6, `번호마다 다른 코스여야 함: 8번 중 ${distinct}개`);
  assert.equal(key(planTrip(input, { seed: 11 })), key(runs[0]), "같은 번호는 같은 코스");
  const seen = runs[0].days.flatMap((d) => d.items.map((x) => x.id));
  const next = planTrip(input, { seed: 11, seen });
  const overlap = next.days.flatMap((d) => d.items).filter((x) => seen.includes(x.id)).length;
  assert.ok(overlap < seen.length * 0.7, `최근 본 장소는 뒤로: 겹침 ${overlap}/${seen.length}`);
  console.log(`ok - 다양한 코스: 같은 조건 8번 중 ${distinct}개가 서로 다름 · 최근 본 장소 겹침 ${overlap}/${seen.length}`);
}

// 걷기 힘듦·휠체어: 오래 걷는 곳 없음, 하루 걷는 양 한도(1.5km·2km)를 거의 지킴, 쉬는 시간, 운영시간 충돌 0
{
  const { dayWalkMeters, verify } = await import("../public/planner.js");
  for (const [mode, budget] of [["walker", 1500], ["wheelchair", 2000]]) {
    let days = 0, over = 0, rests = 0, far = 0, conf = 0, sights = 0;
    for (const region of R) for (const move of ["car", "transit"]) for (const nd of [1, 2]) for (let sd = 1; sd < 4; sd++) {
      const t = planTrip({ region, date: "2026-11-21", days: nd, who: "parents", move, likes: [] }, { access: [mode], lessWalk: true, seed: sd * 7919 });
      conf += verify(t.days);
      for (const d of t.days) {
        days++; if (dayWalkMeters(d) > budget) over++;
        for (const it of d.items) { if (it.restAfter) rests++; if (it.place.walk === 3) far++; if (it.kind === "visit") sights++; assert.ok(!(mode === "walker" && it.place.multi && it.place.cat === "food"), "걷기 힘듦: 시장 끼니 없음"); }
      }
    }
    assert.equal(conf, 0, `${mode} 운영시간 충돌`); assert.equal(far, 0, `${mode} 오래 걷는 곳`);
    assert.ok(over / days <= 0.05, `${mode} 걷는 양 한도 넘김 ${over}/${days}`);
    assert.ok(rests >= days * 0.4, `${mode} 쉬는 시간이 너무 적음 ${rests}/${days}`);
    assert.ok(sights / days >= 3, `${mode} 하루 관광지가 너무 적음`);
    console.log(`ok - ${mode === "walker" ? "걷기 힘듦" : "휠체어"} ${days}일: 한도 넘김 ${over} · 쉬는 시간 ${rests}번 · 하루 관광지 ${(sights / days).toFixed(1)}곳 · 충돌 0`);
  }
}
