// 바탕 지도: OpenFreeMap 벡터 지도 조각(오픈스트리트맵 자료, 키 없음, 앱 배포 허용)으로 직접 그린다.
// tile.openstreetmap.org 그림 조각은 이용 정책상 "앱으로 배포해 많이 쓰는 것"이 금지라 스토어 앱에서는 쓰지 않는다.
// 3D 지도(app.js)와 장소 3D 화면(view3d.js)의 '지도' 모드가 같이 쓴다. 한글 이름표는 기기 글꼴로 그린다(MapLibre 기본).
export const OFM_URL = "https://tiles.openfreemap.org/planet";
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const OFM_ATTR = "© OpenFreeMap © OpenMapTiles © OpenStreetMap";
const FONT = ["Noto Sans Regular"];

// 이름: 화면 언어에 맞는 이름이 있으면 그것, 없으면 현지 이름
export const nameExpr = (lang = "ko") => (lang === "ko" ? ["coalesce", ["get", "name:ko"], ["get", "name"]] : ["coalesce", ["get", `name:${lang}`], ["get", "name:en"], ["get", "name_en"], ["get", "name"]]);

/**
 * 바탕 지도 층 목록. source는 "ofm"(OpenMapTiles 벡터)이어야 한다.
 * opts: { lang, dark, prefix: 층 이름 앞에 붙일 말, visible: false면 처음엔 숨김 }
 */
export function baseLayers({ lang = "ko", dark = false, prefix = "base-", visible = true } = {}) {
  const C = dark
    ? { bg: "#1d2228", wood: "#24332a", grass: "#27352b", park: "#25372b", res: "#23272d", water: "#1f3a52", road: "#3b4350", roadCase: "#14181d", major: "#6b5a3a", motor: "#7a5f34", path: "#8a7d6a", rail: "#555c66", text: "#e5e7eb", halo: "rgba(0,0,0,.75)", bld: "#2c3138" }
    : { bg: "#f2efe9", wood: "#d6e6c3", grass: "#e2edd2", park: "#d4e9c4", res: "#ebe6df", water: "#a9d3ee", road: "#ffffff", roadCase: "#d3cbbd", major: "#fde2a1", motor: "#f6c06f", path: "#9c8b74", rail: "#a9a9a9", text: "#2b2b2b", halo: "rgba(255,255,255,.9)", bld: "#e2dccf" };
  const vis = { visibility: visible ? "visible" : "none" };
  const L = (id, o) => ({ id: prefix + id, source: "ofm", ...o, layout: { ...vis, ...(o.layout || {}) } });
  // 줌 값은 맨 바깥 interpolate 안에서만 쓸 수 있어, 테두리 폭(add)도 단계마다 미리 더해 둔다
  const roadW = (base, add = 0) => ["interpolate", ["exponential", 1.5], ["zoom"], 8, base * 0.4 + add, 12, base + add, 16, base * 4 + add, 19, base * 12 + add];
  const cls = (...c) => ["match", ["get", "class"], c, true, false];
  return [
    { id: prefix + "bg", type: "background", layout: vis, paint: { "background-color": C.bg } },
    L("res", { type: "fill", "source-layer": "landuse", filter: cls("residential", "suburb", "neighbourhood"), paint: { "fill-color": C.res } }),
    L("wood", { type: "fill", "source-layer": "landcover", filter: cls("wood", "forest"), paint: { "fill-color": C.wood } }),
    L("grass", { type: "fill", "source-layer": "landcover", filter: cls("grass", "farmland", "meadow", "scrub"), paint: { "fill-color": C.grass } }),
    L("park", { type: "fill", "source-layer": "park", paint: { "fill-color": C.park, "fill-opacity": 0.7 } }),
    L("water", { type: "fill", "source-layer": "water", paint: { "fill-color": C.water } }),
    L("waterway", { type: "line", "source-layer": "waterway", paint: { "line-color": C.water, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 3] } }),
    L("bld", { type: "fill", "source-layer": "building", minzoom: 14, paint: { "fill-color": C.bld, "fill-opacity": 0.8 } }),
    L("rail", { type: "line", "source-layer": "transportation", filter: cls("rail", "transit"), paint: { "line-color": C.rail, "line-width": 1.4, "line-dasharray": [3, 2] } }),
    L("path", { type: "line", "source-layer": "transportation", minzoom: 14, filter: cls("path", "track"), paint: { "line-color": C.path, "line-width": 1.2, "line-dasharray": [2, 1.5] } }),
    L("road-case", { type: "line", "source-layer": "transportation", filter: cls("minor", "service", "tertiary", "secondary", "primary", "trunk", "motorway"), layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": C.roadCase, "line-width": roadW(1.2, 1.5) } }),
    L("road", { type: "line", "source-layer": "transportation", filter: cls("minor", "service", "tertiary"), layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": C.road, "line-width": roadW(1.2) } }),
    L("road-major", { type: "line", "source-layer": "transportation", filter: cls("secondary", "primary", "trunk"), layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": C.major, "line-width": roadW(1.6) } }),
    L("road-motor", { type: "line", "source-layer": "transportation", filter: cls("motorway"), layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": C.motor, "line-width": roadW(1.8) } }),
    L("water-name", { type: "symbol", "source-layer": "water_name", layout: { "text-field": nameExpr(lang), "text-font": FONT, "text-size": 12 }, paint: { "text-color": dark ? "#9cc7e6" : "#2f6c99", "text-halo-color": C.halo, "text-halo-width": 1.2 } }),
    L("road-name", { type: "symbol", "source-layer": "transportation_name", minzoom: 14, layout: { "symbol-placement": "line", "text-field": nameExpr(lang), "text-font": FONT, "text-size": 11 }, paint: { "text-color": C.text, "text-halo-color": C.halo, "text-halo-width": 1.3 } }),
    L("place", { type: "symbol", "source-layer": "place", filter: cls("city", "town", "village", "suburb", "neighbourhood", "hamlet"), layout: { "text-field": nameExpr(lang), "text-font": FONT, "text-size": ["match", ["get", "class"], "city", 16, "town", 14, 12], "text-max-width": 8 }, paint: { "text-color": C.text, "text-halo-color": C.halo, "text-halo-width": 1.5 } }),
  ];
}
export const baseLayerIds = (prefix = "base-") => baseLayers({ prefix }).map((l) => l.id);
