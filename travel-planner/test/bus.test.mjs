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
