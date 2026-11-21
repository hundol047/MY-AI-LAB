// 장소 3D로 보기: 장소 카드의 "3D로 보기"를 누르면 그 관광지를 전체 화면 3D(위성 사진 + 지형 + 건물 높이)로 연다.
// - 처음에는 장소 둘레를 천천히 돌며 보여 주고, 손을 대면 멈춘다. 한 손가락으로 움직이고 두 손가락으로 기울이거나 돌린다.
// - "내 위치 따라가기": 현장에서 켜면 내가 걷는 대로 화면이 따라 움직이고, 바라보는 방향(나침반·이동 방향)으로 돈다.
//   위치는 이 화면을 그리는 데만 쓰고 어디에도 보내지 않는다. 화면을 닫으면 위치 추적도 끝난다.
// - 위치 권한을 이미 허용했고 장소 2km 안에 있으면 열 때 바로 따라가기를 켠다.
// 지형: AWS 공개 고도 자료, 건물: OpenFreeMap, 위성 사진: Esri World Imagery, 지도: OpenStreetMap
const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
import { walkSummary, ratioLabel, slopeSegments, dedupe, lineMid, distM, PIN_KINDS, loadPins, savePins, toiletsNear } from "./view3d-data.js";
const NEAR_KM = 2;       // 이 안에 있으면 "현장"으로 보고 바로 따라간다
const ORBIT_DEG_S = 5;   // 둘러보기 속도 (초당 도)
const EXAG = 1.3;        // 지형을 조금 과장해 보여 준다 (경사 계산에서는 다시 나눈다)
const PATH_FILTER = ["all", ["==", ["get", "class"], "path"], ["!=", ["get", "subclass"], "steps"]];
const STEPS_FILTER = ["all", ["==", ["get", "class"], "path"], ["==", ["get", "subclass"], "steps"]];
export const SLOPE_COLORS = ["#16a34a", "#f59e0b", "#d92d20"];
const MARK_M = 700;      // 관광지에서 이 거리 안의 계단·화장실에만 표시를 붙인다
const MAX_MARKS = 40;
let toiletsData; // 공식 화장실 자료 (toilets.json). 없으면 null
const loadToilets = () => (toiletsData !== undefined ? Promise.resolve(toiletsData) : fetch("toilets.json").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => (toiletsData = j?.items?.length ? j : null)));

export function distKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const distLabel = (km) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)}m` : `${km < 10 ? km.toFixed(1) : Math.round(km)}km`);
// 나침반 값이 조금씩 떨리므로, 가장 짧은 쪽으로 일부만 따라간다 (350° → 10°는 20°만 돈다)
export function smoothAngle(prev, next, k = 0.35) {
  if (prev == null) return next;
  const d = ((next - prev + 540) % 360) - 180;
  return (prev + d * k + 360) % 360;
}

let open = null; // 열려 있는 화면 하나

export function closeView3D() {
  if (!open) return;
  const o = open; open = null;
  o.stop();
  o.el.remove();
  document.body.classList.remove("v3d-open");
}

/**
 * place: { name, lat, lng, access? } — access: 관광공사 무장애 조사 원문 { 항목: 글 }
 * deps: { t(문구), toast(msg), loadMapLibre() → Promise }
 */
export async function openView3D(place, { t, toast, loadMapLibre }) {
  closeView3D();
  const el = document.createElement("div");
  el.className = "v3d";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", `${place.name} 3D`);
  el.innerHTML = `
    <div class="v3d-map"></div>
    <div class="v3d-top">
      <div class="v3d-title"><b></b><span class="v3d-dist" hidden></span></div>
      <button type="button" class="v3d-close" aria-label="${t("닫기")}">✕</button>
    </div>
    <div class="v3d-bar">
      <button type="button" class="v3d-btn" data-act="follow" aria-pressed="false"></button>
      <button type="button" class="v3d-btn" data-act="orbit" aria-pressed="true"></button>
      <button type="button" class="v3d-btn" data-act="base" aria-pressed="true"></button>
      <button type="button" class="v3d-btn" data-act="home"></button>
      <button type="button" class="v3d-btn" data-act="pin"></button>
      <button type="button" class="v3d-btn" data-act="legend" aria-expanded="false"></button>
    </div>
    <div class="v3d-sheet" data-sheet="legend" hidden></div>
    <div class="v3d-sheet" data-sheet="pin" hidden></div>
    <div class="v3d-cross" hidden>＋</div>
    <div class="v3d-sum"><div class="v3d-sum-main"></div><p class="v3d-warn"></p></div>
    <div class="v3d-loading"></div>
    <p class="v3d-hint"></p>`;
  el.querySelector(".v3d-title b").textContent = place.name;
  el.querySelector(".v3d-hint").textContent = t("한 손가락으로 움직이고, 두 손가락으로 기울이거나 돌려요");
  el.querySelector(".v3d-loading").textContent = t("3D 화면을 불러오는 중…");
  el.querySelector(".v3d-warn").textContent = t("표시가 없다고 계단·턱이 없는 것은 아니에요 · 지도에 빠진 곳이 있을 수 있어요");
  document.body.append(el);
  document.body.classList.add("v3d-open");
  const q = (act) => el.querySelector(`[data-act="${act}"]`);
  const distEl = el.querySelector(".v3d-dist");

  const state = { following: false, orbit: true, satellite: true, watch: null, me: null, meMarker: null, heading: null, compass: null, raf: 0, last: 0, wake: null, lastTurn: 0, closed: false };
  let walkTimer = 0, walkSig = "";
  const me = { stop() {}, el };
  open = me;
  el.querySelector(".v3d-close").addEventListener("click", closeView3D);
  const onKey = (e) => { if (e.key === "Escape") closeView3D(); };
  document.addEventListener("keydown", onKey);

  let map = null;
  const paint = () => {
    q("follow").textContent = state.following ? t("📍 따라가는 중 · 끄기") : t("📍 내 위치 따라가기");
    q("follow").setAttribute("aria-pressed", String(state.following));
    q("orbit").textContent = state.orbit ? t("⏸ 멈춤") : t("⟳ 둘러보기");
    q("orbit").setAttribute("aria-pressed", String(state.orbit));
    q("base").textContent = state.satellite ? t("🗺 지도로") : t("🛰 위성 사진으로");
    q("home").textContent = t("🎯 관광지로");
    q("pin").textContent = t("📌 현장 확인 남기기");
    q("legend").textContent = t("ℹ️ 표시 설명");
  };
  paint();

  me.stop = () => {
    state.closed = true;
    cancelAnimationFrame(state.raf);
    clearTimeout(walkTimer);
    if (state.watch != null) navigator.geolocation.clearWatch(state.watch);
    window.removeEventListener("deviceorientationabsolute", onCompass);
    window.removeEventListener("deviceorientation", onCompass);
    document.removeEventListener("keydown", onKey);
    state.wake?.release?.().catch(() => {});
    try { map?.remove(); } catch { /* 이미 지워짐 */ }
  };

  try { await loadMapLibre(); } catch { toast(t("3D 화면을 불러오지 못했어요 (인터넷 연결을 확인하세요)")); return closeView3D(); }
  if (state.closed) return;
  const maplibregl = window.maplibregl;
  const center = [place.lng, place.lat];
  try {
    map = new maplibregl.Map({
      container: el.querySelector(".v3d-map"), center, zoom: 13.6, pitch: 25, bearing: -50, maxPitch: 80, minZoom: 8, maxZoom: 19.5,
      attributionControl: false, boxZoom: false,
      style: {
        version: 8,
        glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
        sources: {
          sat: { type: "raster", tiles: [SATELLITE], tileSize: 256, maxzoom: 18, attribution: "위성 사진: Esri, Maxar, Earthstar Geographics" },
          osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" },
          dem: { type: "raster-dem", tiles: [TERRAIN], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: "지형: Mapzen/AWS Terrain Tiles" },
          hill: { type: "raster-dem", tiles: [TERRAIN], tileSize: 256, maxzoom: 14, encoding: "terrarium" },
          ofm: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenFreeMap © OpenMapTiles" },
          slope: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#dfe8e2" } },
          { id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } },
          { id: "sat", type: "raster", source: "sat" },
          { id: "hillshade", type: "hillshade", source: "hill", paint: { "hillshade-exaggeration": 0.18, "hillshade-shadow-color": "#1f2a24" } }, // 위성 사진 위에서는 옅게(굴곡만 살린다), 지도에서는 진하게
          // 걷는 길(오픈스트리트맵, 미확인): 흰 테두리 + 회색 점선. 경사를 계산한 구간은 그 위에 색으로 덮는다
          { id: "paths-case", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 14, filter: PATH_FILTER, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "surface"], "unpaved", "#8b5a2b", "#ffffff"], "line-width": ["interpolate", ["linear"], ["zoom"], 14, 4, 18, 9], "line-opacity": 0.9 } }, // 흙·자갈길은 갈색 테두리
          { id: "paths", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 14, filter: PATH_FILTER, paint: { "line-color": "#6b7280", "line-width": 3, "line-dasharray": [1.5, 1.5] } },
          { id: "slope", type: "line", source: "slope", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2.5, 18, 6], "line-color": ["match", ["get", "g"], 0, SLOPE_COLORS[0], 1, SLOPE_COLORS[1], 2, SLOPE_COLORS[2], "#6b7280"] } },
          // 계단(오픈스트리트맵, 미확인): 굵은 빨간 줄무늬
          { id: "steps-case", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 14, filter: STEPS_FILTER, paint: { "line-color": "#ffffff", "line-width": 11 } },
          { id: "steps", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 14, filter: STEPS_FILTER, paint: { "line-color": "#d92d20", "line-width": 7, "line-dasharray": [0.35, 0.35] } },
          { id: "buildings-3d", type: "fill-extrusion", source: "ofm", "source-layer": "building", minzoom: 13, filter: ["!=", ["get", "hide_3d"], true],
            paint: {
              "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, "#efe9dc", 30, "#ddd3c0", 100, "#c6baa4"],
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.8,
            } },
          // 이름표: 길 이름과 주변 시설 이름 (어디가 어디인지 알아보게). 글꼴을 못 받으면 이름표만 빠진다
          { id: "road-label", type: "symbol", source: "ofm", "source-layer": "transportation_name", minzoom: 15,
            layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:ko"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 12 },
            paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,.75)", "text-halo-width": 1.4 } },
          { id: "poi-label", type: "symbol", source: "ofm", "source-layer": "poi", minzoom: 15, filter: ["all", ["has", "name"], ["<=", ["coalesce", ["get", "rank"], 99], 25], ["!=", ["get", "class"], "toilets"]],
            layout: { "text-field": ["coalesce", ["get", "name:ko"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-max-width": 8, "text-padding": 6 },
            paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,.8)", "text-halo-width": 1.5 } },
        ],
        terrain: { source: "dem", exaggeration: EXAG },
        sky: { "sky-color": "#9fd0ee", "horizon-color": "#e6f2f8", "fog-color": "#e6f2f8", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.2, "atmosphere-blend": 0.6 },
      },
    });
  } catch { toast(t("이 기기에서는 3D 화면을 볼 수 없어요")); return closeView3D(); }
  // 위성 사진·건물을 못 받아도(오프라인 등) 받은 것만으로 보여 준다
  map.on("error", (e) => console.warn("3D", e?.error?.message || e));
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right"); // 아래쪽 버튼을 가리지 않게 위로
  map.once("idle", () => el.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show")); // 처음엔 접어 둔다 (ⓘ를 누르면 펼쳐짐)

  // 들어가기: 멀리 위에서 내려다보다가 관광지로 내려앉는다 → 그 뒤 둘러보기 시작. 손을 대면 바로 멈춘다
  let intro = true;
  const endIntro = () => { intro = false; };
  map.once("load", () => { if (state.closed) return; map.flyTo({ center, zoom: 16.2, pitch: 62, bearing: -20, duration: 2600, essential: true }); map.once("moveend", endIntro); });
  setTimeout(endIntro, 6000);
  map.once("idle", () => el.querySelector(".v3d-loading")?.remove());
  setTimeout(() => el.querySelector(".v3d-loading")?.remove(), 12000);

  // 관광지 표시: 이름표가 달린 핀
  const pin = document.createElement("div");
  pin.className = "v3d-pin";
  pin.innerHTML = "<span></span><i></i>";
  pin.querySelector("span").textContent = place.name;
  new maplibregl.Marker({ element: pin, anchor: "bottom" }).setLngLat(center).addTo(map);

  // ---------- 걷기 정보: 계단·화장실 표시, 산책로 경사 ----------
  const here = [place.lng, place.lat];
  const chip = (cls, text, title) => { const d = document.createElement("div"); d.className = `v3d-chip ${cls}`; d.textContent = text; if (title) d.title = title; return d; };
  let marks = [], pinMarks = [], official = null, found = { steps: 0, toilets: 0, paths: 0, unpaved: 0, sum: null };
  // 높이 0.5m 이하(바다·물 위로 읽힌 칸)는 '모름'으로 둔다: 해안 절벽·물가 데크는 30m 지형 자료가 바다 높이로 뭉개져 경사가 엉뚱하게 나온다
  const elevAt = (lng, lat) => { try { const z = map.queryTerrainElevation([lng, lat]); return z == null || z / EXAG <= 0.5 ? null : z / EXAG; } catch { return null; } };
  function refreshWalkInfo() {
    if (state.closed || map.getZoom() < 14) return;
    let tr = [], poi = [];
    try { tr = map.querySourceFeatures("ofm", { sourceLayer: "transportation", filter: ["==", ["get", "class"], "path"] }); poi = map.querySourceFeatures("ofm", { sourceLayer: "poi", filter: ["==", ["get", "class"], "toilets"] }); } catch { return; }
    const lines = (f) => (f.geometry.type === "MultiLineString" ? f.geometry.coordinates : f.geometry.type === "LineString" ? [f.geometry.coordinates] : []);
    // 계단: 가운데 점에 "계단" 표시
    const steps = dedupe(tr.filter((f) => f.properties.subclass === "steps").flatMap((f) => lines(f).map((c) => ({ at: lineMid(c) }))).filter((x) => distM(x.at, here) <= MARK_M), 12);
    // 화장실: 공식 자료가 있으면 먼저, 그 30m 안의 오픈스트리트맵 화장실은 같은 곳으로 본다
    const off = toiletsNear(official, here, MARK_M).map((x) => ({ at: [x.lng, x.lat], official: true, acc: !!x.acc, name: x.name, open: x.open }));
    const osm = dedupe(poi.map((f) => ({ at: f.geometry.coordinates, name: f.properties.name })).filter((x) => distM(x.at, here) <= MARK_M), 20).filter((x) => !off.some((o) => distM(o.at, x.at) < 30));
    // 산책로 경사: 지형 고도(약 30m 간격)로 어림. 높이를 못 읽은 구간은 회색 점선 그대로 둔다
    const feats = [], segs = [];
    let nPaths = 0, unpaved = 0;
    for (const f of tr) {
      if (f.properties.subclass === "steps") continue;
      for (const c of lines(f)) {
        if (distM(lineMid(c), here) > MARK_M * 1.5) continue;
        nPaths++;
        if (f.properties.surface === "unpaved") unpaved++;
        if (feats.length > 1500) break;
        for (const sg of slopeSegments(c, elevAt)) { segs.push(sg); if (sg.g >= 0) feats.push({ type: "Feature", properties: { g: sg.g, pct: sg.pct }, geometry: { type: "LineString", coordinates: sg.coords } }); }
      }
    }
    // 바뀐 것이 없으면 다시 그리지 않는다 (다시 그리면 지도가 또 '그리기 끝'을 알려 와 되풀이된다)
    const sum = walkSummary(segs);
    const sig = [steps.length, off.length, osm.length, nPaths, feats.length, sum.share?.join("/")].join("|");
    if (sig === walkSig) return;
    walkSig = sig;
    marks.forEach((m) => m.remove());
    const near = (list) => list.sort((a, b) => distM(a.at, here) - distM(b.at, here)).slice(0, MAX_MARKS);
    marks = [
      ...near(steps).map((x) => new maplibregl.Marker({ element: chip("steps", t("계단"), t("오픈스트리트맵 자료 · 미확인")), anchor: "bottom" }).setLngLat(x.at).addTo(map)),
      ...near(off).map((x) => new maplibregl.Marker({ element: chip("toilet official", x.acc ? t("♿🚻 장애인 화장실") : t("🚻 화장실"), [x.name, x.open, t("행정안전부 공중화장실 자료")].filter(Boolean).join(" · ")), anchor: "bottom" }).setLngLat(x.at).addTo(map)),
      ...near(osm).map((x) => new maplibregl.Marker({ element: chip("toilet", t("🚻 화장실?"), t("오픈스트리트맵 자료 · 미확인")), anchor: "bottom" }).setLngLat(x.at).addTo(map)),
    ];
    map.getSource("slope")?.setData({ type: "FeatureCollection", features: feats });
    found = { steps: steps.length, toilets: off.length + osm.length, officialToilets: off.length, paths: nPaths, unpaved, sum };
    drawLegend(); drawSummary();
  }
  // 한눈에 보는 요약 (화면 위): 경사 비율 막대 + 계단·화장실·흙길 개수. 자료가 없으면 없다고 말한다
  const sumEl = el.querySelector(".v3d-sum-main");
  function drawSummary() {
    const sh = found.sum?.share;
    const bits = [
      found.steps ? t("계단 {n}곳", { n: found.steps }) : t("계단 표시 없음"),
      found.toilets ? t("화장실 {n}곳", { n: found.toilets }) : t("화장실 표시 없음"),
      ...(found.unpaved ? [t("흙·자갈길 있음")] : []),
    ];
    sumEl.innerHTML = (!found.paths ? `<b>${t("이 주변은 걷는 길 지도 자료가 없어요 · 현장 확인이 필요해요")}</b>`
      : sh ? `<div class="v3d-barline" role="img" aria-label="${t("완만 {a}% · 조금 가파름 {b}% · 가파름 {c}%", { a: sh[0], b: sh[1], c: sh[2] })}">${sh.map((v, i) => (v ? `<i style="flex:${v};background:${SLOPE_COLORS[i]}"></i>` : "")).join("")}</div>
         <b>${t("걷는 길: 완만 {a}% · 조금 가파름 {b}% · 가파름 {c}%", { a: sh[0], b: sh[1], c: sh[2] })}</b>`
      : `<b>${t("걷는 길의 경사를 아직 모르겠어요")}</b>`) + `<span class="v3d-bits">${bits.join(" · ")}</span>`;
  }
  // 길을 누르면 그 구간의 경사를 알려 준다
  const GRADE_NAME = ["완만", "조금 가파름", "가파름"];
  map.on("click", "slope", (e) => {
    const f = e.features?.[0]; if (!f) return;
    new maplibregl.Popup({ closeButton: false, offset: 10, className: "v3d-pop" }).setLngLat(e.lngLat)
      .setHTML(`<b>${t(GRADE_NAME[f.properties.g])}</b> · ${f.properties.pct > 20 ? t("경사 20% 넘음 (1/5보다 가파름)") : t("경사 약 {p}% ({r})", { p: Math.round(f.properties.pct), r: ratioLabel(f.properties.pct) })}<br><small>${t("지형 자료로 어림한 값")}</small>`).addTo(map);
  });
  map.on("click", "steps", (e) => new maplibregl.Popup({ closeButton: false, offset: 10, className: "v3d-pop" }).setLngLat(e.lngLat).setHTML(`<b>${t("계단")}</b><br><small>${t("오픈스트리트맵 자료 · 미확인")}</small>`).addTo(map));
  const queueWalk = () => { clearTimeout(walkTimer); walkTimer = setTimeout(refreshWalkInfo, 500); };
  map.on("idle", queueWalk);
  loadToilets().then((j) => { official = j; queueWalk(); });

  // 표시 설명: 무엇이 공식이고 무엇이 미확인인지, 이 장소에서 찾은 개수
  const legendEl = el.querySelector('[data-sheet="legend"]'), pinEl = el.querySelector('[data-sheet="pin"]'), cross = el.querySelector(".v3d-cross");
  const escH = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function drawLegend() {
    const acc = Object.entries(place.access || {}).map(([k, v]) => `<li><b>${escH(k)}</b> ${escH(v)}</li>`).join("");
    legendEl.innerHTML = `
      <button type="button" class="v3d-sheet-close" aria-label="${t("닫기")}">✕</button>
      <h4>${t("표시 설명")}</h4>
      <ul class="v3d-legend">
        <li><i class="ln" style="background:${SLOPE_COLORS[0]}"></i>${t("완만한 길 (경사 1/18 이하)")}</li>
        <li><i class="ln" style="background:${SLOPE_COLORS[1]}"></i>${t("조금 가파른 길 (1/12 이하 · 밀어 줄 사람 필요)")}</li>
        <li><i class="ln" style="background:${SLOPE_COLORS[2]}"></i>${t("가파른 길 (1/12 넘음 · 휠체어·보행기 어려움)")}</li>
        <li><i class="ln dash"></i>${t("경사를 모르는 길")}</li>
        <li><i class="ln unpaved"></i>${t("갈색 테두리: 흙·자갈길")} <em>${t("미확인")}</em></li>
        <li><i class="ln steps"></i>${t("계단")} <em>${t("미확인")}</em></li>
        <li><span class="v3d-chip toilet official">🚻</span>${t("화장실 (행정안전부 자료)")} <em class="ok">${t("공식")}</em></li>
        <li><span class="v3d-chip toilet">🚻?</span>${t("화장실 (오픈스트리트맵)")} <em>${t("미확인")}</em></li>
        <li><span class="v3d-chip mine">📌</span>${t("내가 현장에서 확인한 곳")}</li>
      </ul>
      <p class="v3d-count">${t("이 주변 지도 자료: 계단 {s}곳 · 화장실 {w}곳 · 걷는 길 {p}개", { s: found.steps, w: found.toilets, p: found.paths })}${official ? "" : ` · ${t("공식 화장실 자료는 아직 없어요")}`}</p>
      <p class="v3d-note">${t("길·계단·'화장실?'은 자원봉사자가 그린 지도(오픈스트리트맵)라 빠지거나 틀린 곳이 있을 수 있어요. 경사는 약 30m 간격 지형 자료로 어림한 값이라 짧은 턱·급경사는 보이지 않아요. 중요한 방문은 시설에 전화로 확인하세요.")}</p>
      ${acc ? `<h4>${t("한국관광공사 무장애 조사")} <em class="ok">${t("공식")}</em></h4><ul class="v3d-acc">${acc}</ul>` : `<p class="v3d-note">${t("이 장소는 한국관광공사 무장애 조사 자료가 없어요.")}</p>`}`;
  }
  drawLegend();
  const showSheet = (which) => {
    legendEl.hidden = which !== "legend"; pinEl.hidden = which !== "pin";
    cross.hidden = which !== "pin" || (state.following && !!state.me);
    q("legend").setAttribute("aria-expanded", String(which === "legend"));
  };
  el.addEventListener("click", (e) => { if (e.target.closest(".v3d-sheet-close")) showSheet(null); });
  q("legend").addEventListener("click", () => showSheet(legendEl.hidden ? "legend" : null));

  // 현장 확인 남기기: 따라가는 중이면 내 위치에, 아니면 화면 가운데(＋)에 표시를 남긴다. 이 기기에만 저장한다
  let pins = loadPins();
  function drawPins() {
    pinMarks.forEach((m) => m.remove());
    pinMarks = pins.filter((p) => distM([p.lng, p.lat], here) <= 3000).map((p) => {
      const d = chip("mine", `${PIN_KINDS[p.kind].icon} ${t(PIN_KINDS[p.kind].ko)}`, `${t("내가 확인")} · ${p.date}`);
      d.addEventListener("click", () => { if (confirm(t("이 표시를 지울까요?"))) { pins = pins.filter((x) => x !== p); savePins(pins); drawPins(); } });
      return new maplibregl.Marker({ element: d, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map);
    });
  }
  drawPins();
  q("pin").addEventListener("click", () => {
    if (!pinEl.hidden) return showSheet(null);
    const atMe = state.following && state.me;
    pinEl.innerHTML = `<button type="button" class="v3d-sheet-close" aria-label="${t("닫기")}">✕</button><h4>${t("현장 확인 남기기")}</h4><p class="v3d-note">${atMe ? t("지금 내 위치에 남겨요.") : t("화면 가운데 ＋ 자리에 남겨요. 지도를 움직여 맞추세요.")} ${t("이 기기에만 저장돼요.")}</p>
      <div class="v3d-pinbtns">${Object.entries(PIN_KINDS).map(([k, v]) => `<button type="button" class="v3d-btn" data-kind="${k}">${v.icon} ${t(v.ko)}</button>`).join("")}</div>`;
    showSheet("pin");
  });
  pinEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kind]"); if (!b) return;
    const c = state.following && state.me ? state.me : { lat: map.getCenter().lat, lng: map.getCenter().lng };
    pins.push({ kind: b.dataset.kind, lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), date: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) });
    savePins(pins); drawPins(); showSheet(null);
    toast(t("남겼어요 · 표시를 누르면 지울 수 있어요"));
  });

  // ---------- 둘러보기: 장소 둘레를 천천히 돈다. 손을 대면 멈춘다 ----------
  const stopOrbit = () => { if (intro) { intro = false; map.stop(); } if (state.orbit) { state.orbit = false; paint(); } };
  const tick = (now) => {
    if (state.closed) return;
    if (state.orbit && !state.following && !intro) {
      const dt = Math.min(100, now - (state.last || now));
      map.setBearing(map.getBearing() + (ORBIT_DEG_S * dt) / 1000);
    }
    state.last = now;
    state.raf = requestAnimationFrame(tick);
  };
  state.raf = requestAnimationFrame(tick);
  for (const ev of ["mousedown", "touchstart", "wheel"]) map.getCanvas().addEventListener(ev, stopOrbit, { passive: true });
  // 따라가는 중에 손으로 지도를 끌면 따라가기를 잠시 멈춘다 (버튼으로 다시 켠다)
  map.on("dragstart", (e) => { if (e.originalEvent && state.following) setFollow(false); });

  // ---------- 내 위치 ----------
  function drawMe() {
    if (!state.me) return;
    if (!state.meMarker) {
      const d = document.createElement("div");
      d.className = "v3d-me";
      d.innerHTML = "<i></i><b></b>";
      state.meMarker = new maplibregl.Marker({ element: d, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([state.me.lng, state.me.lat]).addTo(map);
    }
    state.meMarker.setLngLat([state.me.lng, state.me.lat]);
    const h = state.heading;
    state.meMarker.getElement().classList.toggle("has-heading", h != null);
    if (h != null) state.meMarker.setRotation(h);
    const km = distKm(state.me, place);
    distEl.hidden = false;
    distEl.textContent = km < 0.03 ? t("도착했어요") : t("여기서 {dist}", { dist: distLabel(km) });
  }
  function moveCamera(first = false) {
    if (!state.following || !state.me) return;
    const opts = { center: [state.me.lng, state.me.lat], duration: first ? 1400 : 900, essential: true };
    if (first) { opts.zoom = Math.max(map.getZoom(), 17.2); opts.pitch = 65; }
    if (state.heading != null) opts.bearing = state.heading;
    map.easeTo(opts);
  }
  function onFix(pos) {
    if (state.closed) return;
    const first = !state.me;
    state.me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    // 걷거나 차로 움직일 때는 이동 방향, 서 있을 때는 나침반
    const moving = pos.coords.speed > 0.7 && Number.isFinite(pos.coords.heading);
    if (moving) state.heading = smoothAngle(state.heading, pos.coords.heading, 0.6);
    else if (state.compass != null) state.heading = state.compass;
    drawMe();
    moveCamera(first || state.justOn);
    state.justOn = false;
  }
  function onCompass(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;              // 아이폰
    else if (e.absolute && typeof e.alpha === "number") h = (360 - e.alpha) % 360;           // 안드로이드
    if (h == null || Number.isNaN(h)) return;
    h = (h + (screen.orientation?.angle || 0)) % 360;
    state.compass = smoothAngle(state.compass, h);
    const now = Date.now();
    if (now - state.lastTurn < 250) return;
    const turned = state.heading == null ? 999 : Math.abs(((state.compass - state.heading + 540) % 360) - 180);
    if (turned < 4) return;
    state.lastTurn = now;
    state.heading = state.compass;
    drawMe();
    if (state.following && state.me && !map.isMoving()) map.easeTo({ bearing: state.heading, duration: 300, essential: true });
  }
  async function startCompass() {
    try {
      // 아이폰은 버튼을 누른 순간에만 나침반 권한을 물을 수 있다
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return;
      }
    } catch { return; }
    window.addEventListener("deviceorientationabsolute", onCompass);
    window.addEventListener("deviceorientation", onCompass);
  }
  function startWatch() {
    if (state.watch != null) return true;
    if (!navigator.geolocation) { toast(t("위치를 사용할 수 없어요")); return false; }
    state.watch = navigator.geolocation.watchPosition(onFix, (err) => {
      if (err.code === 1) { toast(t("위치 권한을 허용해 주세요")); setFollow(false); }
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
    return true;
  }
  function setFollow(on) {
    if (on && !startWatch()) return;
    state.following = on;
    if (on) {
      state.orbit = false; state.justOn = true;
      startCompass();
      // 걸으면서 보는 동안 화면이 꺼지지 않게 (지원하는 기기만)
      navigator.wakeLock?.request?.("screen").then((w) => { if (state.following && !state.closed) state.wake = w; else w.release(); }).catch(() => {});
      if (state.me) { moveCamera(true); state.justOn = false; }
    } else { state.wake?.release?.().catch(() => {}); state.wake = null; }
    paint();
  }

  q("follow").addEventListener("click", () => setFollow(!state.following));
  q("orbit").addEventListener("click", () => {
    state.orbit = !state.orbit;
    if (state.orbit && state.following) setFollow(false);
    paint();
  });
  q("base").addEventListener("click", () => {
    state.satellite = !state.satellite;
    map.setLayoutProperty("sat", "visibility", state.satellite ? "visible" : "none");
    map.setLayoutProperty("osm", "visibility", state.satellite ? "none" : "visible");
    map.setPaintProperty("hillshade", "hillshade-exaggeration", state.satellite ? 0.18 : 0.4);
    for (const id of ["road-label", "poi-label"]) { map.setPaintProperty(id, "text-color", state.satellite ? "#ffffff" : "#1f2937"); map.setPaintProperty(id, "text-halo-color", state.satellite ? "rgba(0,0,0,.8)" : "rgba(255,255,255,.9)"); }
    paint();
  });
  q("home").addEventListener("click", () => {
    if (state.following) setFollow(false);
    map.flyTo({ center, zoom: 16.2, pitch: 62, duration: 1200, essential: true });
  });

  // 위치 권한을 이미 준 경우에만 조용히 확인: 현장(2km 안)이면 바로 따라간다. 처음이면 버튼을 누를 때 묻는다
  try {
    const perm = await navigator.permissions?.query({ name: "geolocation" });
    if (perm?.state === "granted" && !state.closed) {
      navigator.geolocation.getCurrentPosition((pos) => {
        if (state.closed || state.following) return;
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (distKm(here, place) <= NEAR_KM) { setFollow(true); toast(t("현장에 계시네요 · 내 위치를 따라가요")); }
        else { state.me = here; drawMe(); }
      }, () => {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    }
  } catch { /* 권한 조회를 지원하지 않는 브라우저: 버튼으로 켠다 */ }
}
