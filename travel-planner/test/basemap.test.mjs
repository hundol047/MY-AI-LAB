// 바탕 지도 스타일 검사: MapLibre 규칙에 맞지 않으면 지도 전체가 그려지지 않는다 (2026-11-21에 줌 식을 잘못 넣어 지도가 비었던 일)
import assert from "node:assert/strict";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { baseLayers, baseLayerIds, GLYPHS, OFM_URL } from "../public/basemap.js";

for (const lang of ["ko", "en", "ja", "zh"]) for (const dark of [false, true]) for (const visible of [true, false]) {
  const style = { version: 8, glyphs: GLYPHS, sources: { ofm: { type: "vector", url: OFM_URL } }, layers: baseLayers({ lang, dark, visible }) };
  const errs = validateStyleMin(style);
  assert.deepEqual(errs.map((e) => e.message), [], `${lang} ${dark ? "어둡게" : "밝게"}`);
}
const ids = baseLayerIds();
assert.equal(new Set(ids).size, ids.length, "층 이름 겹침");
assert.ok(ids.every((id) => id.startsWith("base-")));
console.log(`ok - 바탕 지도 스타일 (층 ${ids.length}개 × 4개 언어 × 밝게/어둡게, MapLibre 규칙 검사)`);
