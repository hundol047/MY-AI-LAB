// 장애인편의시설 현황(scripts/bake-facilities.mjs): 응답 읽기, 이름·거리 대조, 저장된 자료의 모양
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseList, toFacility, matchFacilities, evalItems, plausible } from "../scripts/bake-facilities.mjs";
import { PLACES } from "../public/data.js";

const XML = `<facInfoList><servList><estbDate>20100101</estbDate><faclLat>37.7930</faclLat><faclLng>128.8960</faclLng><faclNm>오죽헌 &amp; 시립박물관</faclNm><lcMnad>강원특별자치도 강릉시 율곡로3139번길 24</lcMnad><salStaNm>영업</salStaNm><wfcltId>A1</wfcltId></servList><servList><faclLat>35.1</faclLat><faclLng>129.0</faclLng><faclNm>부산 어딘가</faclNm><wfcltId>B2</wfcltId></servList><totalCount>2</totalCount></facInfoList>`;

test("응답 XML을 읽고 강원 밖 시설은 버린다", () => {
  const { total, rows } = parseList(XML);
  assert.equal(total, 2); assert.equal(rows.length, 2);
  const f = rows.map(toFacility);
  assert.equal(f[0].name, "오죽헌 & 시립박물관"); assert.equal(f[0].addr, "강릉시 율곡로3139번길 24"); assert.equal(f[1], null);
});
test("이름과 위치가 모두 맞아야 같은 곳으로 본다", () => {
  const p = [{ id: "a", name: "오죽헌", lat: 37.7792, lng: 128.8776 }];
  const near = { id: "1", name: "강릉 오죽헌", lat: 37.7795, lng: 128.878 }, far = { id: "2", name: "오죽헌", lat: 37.80, lng: 128.9 }, other = { id: "3", name: "율곡주유소", lat: 37.7792, lng: 128.8776 };
  assert.equal(matchFacilities(p, [far, other]).a, undefined);
  assert.equal(matchFacilities(p, [far, other, near]).a.f.id, "1");
  assert.equal(matchFacilities(p, [{ ...near, closed: true }]).a, undefined);
  // 장소 이름을 딴 가게 지점·역은 그 장소가 아니다
  assert.equal(plausible({ name: "강문해변" }, { name: "스타벅스 강릉강문해변점" }), false);
  assert.equal(plausible({ name: "정동진역 앞 식당가" }, { name: "정동진역" }), false);
  assert.equal(plausible({ name: "정동진역" }, { name: "정동진역" }), true);
});
test("편의시설 목록은 원문 낱말 그대로, 중복 없이", () => {
  assert.deepEqual(evalItems("승강기, 대변기,승강기,"), ["승강기", "대변기"]);
});
test("저장된 자료: 앱에 있는 장소, 500m 안, 목록이 비지 않음", () => {
  const j = JSON.parse(readFileSync(new URL("../public/facilities.json", import.meta.url), "utf8"));
  const ids = new Set(PLACES.map((p) => p.id));
  for (const [id, v] of Object.entries(j.places)) { assert.ok(ids.has(id), id); assert.ok(v.name && v.items.length, id); assert.ok(v.m <= 500, id); assert.ok(plausible(PLACES.find((p) => p.id === id), v), `${id} ← ${v.name}`); }
});
