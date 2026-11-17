// bus.json(국토교통부 TAGO 버스노선정보로 만든 장소 근처 버스)이 앱 장소와 맞고 값이 믿을 만한지 확인한다
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PLACES } from "../public/data.js";

const bus = JSON.parse(await readFile(new URL("../public/bus.json", import.meta.url), "utf8"));
const ids = new Set(PLACES.map((p) => p.id));
const hm = /^([01]\d|2[0-9]):[0-5]\d$/;
const entries = Object.entries(bus.places);
assert.ok(entries.length >= 50, `버스 정보가 붙은 장소가 너무 적다: ${entries.length}`);
for (const [id, b] of entries) {
  assert.ok(ids.has(id), `앱에 없는 장소: ${id}`);
  assert.ok(b.m >= 0 && b.m <= bus.radius, `${id}: 정류장 거리 ${b.m}m`);
  assert.ok(b.routes.length >= 1 && b.routes.length <= 6, `${id}: 노선 수`);
  for (const r of b.routes) {
    if (r.first) assert.match(r.first, hm, `${id} ${r.no}번 첫차`);
    if (r.last) assert.match(r.last, hm, `${id} ${r.no}번 막차`);
    assert.ok(r.first || r.last, `${id} ${r.no}번: 시각 없음`);
    if (r.gap != null) assert.ok(r.gap > 0 && r.gap <= 300, `${id} ${r.no}번 배차 ${r.gap}`);
  }
  if (b.last) assert.equal(b.last, b.routes.reduce((a, r) => (r.last && r.last > a ? r.last : a), ""), `${id}: 막차는 노선 막차 중 가장 늦은 것`);
}
// 춘천 시내 대표 장소는 버스가 있어야 한다
for (const id of ["dakgalbi", "nangman"]) assert.ok(bus.places[id], `${id}에 버스 정보 없음`);
console.log(`ok - 장소 ${entries.length}곳 근처 버스 (첫차·막차·배차 형식, 앱 장소 일치)`);

// 엔진: 버스 노선으로 "같은 버스로 몇 정류장" 계산 · 막차 뒤에는 그 버스를 쓰지 않음 · 대중교통 일정 충돌 0
{
  const { setBus, busLeg, planTrip, verify } = await import("../public/planner.js");
  const { readFileSync } = await import("node:fs");
  const bus = JSON.parse(readFileSync(new URL("../public/bus.json", import.meta.url), "utf8"));
  setBus(bus.places);
  const ids = Object.keys(bus.places);
  // 같은 노선의 두 장소를 찾아 순서대로면 버스, 거꾸로면(반대 방면 정보 없음) 없음
  let pair = null;
  outer: for (const a of ids) for (const x of bus.places[a].legs) for (const b of ids) if (b !== a) for (const y of bus.places[b].legs) if (y.r === x.r && y.ord > x.ord + 2 && x.last) { pair = { a, b, x }; break outer; }
  assert.ok(pair, "같은 노선 위 두 장소");
  const leg = busLeg({ id: pair.a }, { id: pair.b }, 12 * 60);
  assert.ok(leg && leg.stops > 0 && leg.min > leg.wait, "버스 구간 계산");
  const lastMin = Math.max(...bus.places[pair.a].legs.filter((l) => l.last).map((l) => +l.last.slice(0, 2) * 60 + +l.last.slice(3)));
  const late = busLeg({ id: pair.a }, { id: pair.b }, lastMin + 30);
  assert.ok(!late, "모든 노선 막차가 지난 뒤에는 버스 없음");
  let busLegs = 0, legs = 0, conf = 0;
  for (const region of ["chuncheon", "wonju"]) for (let sd = 1; sd < 6; sd++) {
    const t = planTrip({ region, date: "2026-11-21", days: 2, who: "couple", move: "transit", likes: [] }, { seed: sd * 7919 });
    conf += verify(t.days);
    for (const d of t.days) for (const it of d.items.slice(1)) if (it.travelMode === "bus") { legs++; if (it.bus) busLegs++; }
  }
  setBus({});
  assert.equal(conf, 0);
  assert.ok(busLegs / legs >= 0.4, `노선으로 계산한 버스 구간 ${busLegs}/${legs}`);
  console.log(`ok - 버스 노선 반영 (춘천·원주 대중교통: 버스 구간 ${legs}개 중 ${busLegs}개를 노선·정류장 수로 계산 · 충돌 0)`);
}
