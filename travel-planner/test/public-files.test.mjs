// 내려받은 공공데이터 파일로 만든 자료(scripts/bake-public-files.mjs)가 앱이 믿고 쓸 수 있는 모양인지 확인한다
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLACES } from "../public/data.js";

const load = (f) => JSON.parse(readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8"));
const ids = new Set(PLACES.map((p) => p.id));
const inGangwon = (lat, lng) => lat > 36.9 && lat < 38.7 && lng > 127.0 && lng < 129.5;

test("열린관광지: 앱에 있는 장소만, 출처가 적혀 있다", () => {
  const o = load("open-sites.json");
  assert.match(o.source, /열린관광지/);
  assert.ok(Object.keys(o.places).length >= 5);
  for (const [id, v] of Object.entries(o.places)) { assert.ok(ids.has(id), id); assert.ok(v.title); }
});

test("이름으로 맞춘 공중화장실: 앱에 있는 장소만, 이름·주소·장애인 변기 여부가 있다", () => {
  const t = load("toilets-named.json");
  assert.match(t.source, /공중화장실/);
  for (const [id, list] of Object.entries(t.places)) {
    assert.ok(ids.has(id), id);
    assert.ok(list.length >= 1 && list.length <= 12, `${id} ${list.length}`);
    for (const x of list) { assert.ok(x.name && x.addr, id); assert.equal(typeof x.acc, "boolean"); }
  }
  // 음식점·카페에는 붙이지 않는다 (같은 이름의 다른 건물일 수 있다). 시장·항구는 예외
  for (const id of Object.keys(t.places)) { const p = PLACES.find((x) => x.id === id); assert.ok(!["food", "cafe"].includes(p.cat) || /(시장|항)$/.test(p.name), id); }
  // 한 장소에 같은 화장실이 두 번 나오지 않는다
  for (const [id, list] of Object.entries(t.places)) assert.equal(new Set(list.map((x) => x.name + x.addr)).size, list.length, id);
  assert.ok(!t.places.mindungsan && !JSON.stringify(t.places.cheongnyeongpo || []).includes("포레스트"));
});

test("무장애나눔길: 좌표와 선이 강원 안에 있다", () => {
  const b = load("bf-trails.json");
  assert.ok(b.trails.length >= 10);
  for (const tr of b.trails) {
    assert.ok(tr.name && tr.len > 0, tr.name);
    if (tr.lat != null) assert.ok(inGangwon(tr.lat, tr.lng), tr.name);
    for (const seg of tr.line || []) { assert.ok(seg.length >= 2, tr.name); for (const [lng, lat] of seg) assert.ok(inGangwon(lat, lng), `${tr.name} ${lat},${lng}`); }
  }
  assert.ok(b.trails.filter((x) => x.line).length >= 8);
});

test("화장실은 확인된 것만: 카카오맵 대조 결과 모양, 화장실 아닌 가게는 빼기", async () => {
  const { isToilet } = await import("../scripts/bake-kakao-toilets.mjs");
  assert.ok(isToilet({ place_name: "경포해변 공중화장실", category_name: "사회,공공기관 > 공중화장실" }));
  assert.ok(isToilet({ place_name: "낙산사 화장실", category_name: "편의시설 > 화장실" }));
  assert.ok(!isToilet({ place_name: "강릉 화장실 리모델링", category_name: "서비스,산업 > 인테리어" }));
  assert.ok(!isToilet({ place_name: "욕실·화장실용품", category_name: "가정,생활 > 생활용품" }));
  assert.ok(!isToilet({ place_name: "경포호수광장", category_name: "여행 > 관광,명소" }));
  const c = load("toilets-confirmed.json");
  for (const x of c.items) { assert.deepEqual(x.src, ["osm", "kakao"]); assert.ok(inGangwon(x.lat, x.lng), x.name); }
  // 걷기 정보의 화장실 수는 확인된 것(정부 자료 + 두 지도 일치)만: 카카오 대조 전이면 정부 자료 수를 넘지 않는다
  const w = load("walk-info.json").places, off = load("toilets.json").items;
  if (!c.kakao) for (const [id, v] of Object.entries(w)) assert.ok((v.wc || 0) <= off.length, id);
});
