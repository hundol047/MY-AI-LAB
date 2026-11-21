// 장소 3D로 보기: 장소 카드의 "3D로 보기"를 누르면 그 관광지를 전체 화면 3D(위성 사진 + 지형 + 건물 높이)로 연다.
// - 처음에는 장소 둘레를 천천히 돌며 보여 주고, 손을 대면 멈춘다. 한 손가락으로 움직이고 두 손가락으로 기울이거나 돌린다.
// - "내 위치 따라가기": 현장에서 켜면 내가 걷는 대로 화면이 따라 움직이고, 바라보는 방향(나침반·이동 방향)으로 돈다.
//   위치는 이 화면을 그리는 데만 쓰고 어디에도 보내지 않는다. 화면을 닫으면 위치 추적도 끝난다.
// - 위치 권한을 이미 허용했고 장소 2km 안에 있으면 열 때 바로 따라가기를 켠다.
// 지형: AWS 공개 고도 자료, 건물: OpenFreeMap, 위성 사진: Esri World Imagery, 지도: OpenStreetMap
const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const NEAR_KM = 2;       // 이 안에 있으면 "현장"으로 보고 바로 따라간다
const ORBIT_DEG_S = 5;   // 둘러보기 속도 (초당 도)

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
 * place: { name, lat, lng, desc? }
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
    </div>
    <p class="v3d-hint"></p>`;
  el.querySelector(".v3d-title b").textContent = place.name;
  el.querySelector(".v3d-hint").textContent = t("한 손가락으로 움직이고, 두 손가락으로 기울이거나 돌려요");
  document.body.append(el);
  document.body.classList.add("v3d-open");
  const q = (act) => el.querySelector(`[data-act="${act}"]`);
  const distEl = el.querySelector(".v3d-dist");

  const state = { following: false, orbit: true, satellite: true, watch: null, me: null, meMarker: null, heading: null, compass: null, raf: 0, last: 0, wake: null, lastTurn: 0, closed: false };
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
  };
  paint();

  me.stop = () => {
    state.closed = true;
    cancelAnimationFrame(state.raf);
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
      container: el.querySelector(".v3d-map"), center, zoom: 16.2, pitch: 62, bearing: -20, maxPitch: 80, minZoom: 8, maxZoom: 19.5,
      attributionControl: false, boxZoom: false,
      style: {
        version: 8,
        sources: {
          sat: { type: "raster", tiles: [SATELLITE], tileSize: 256, maxzoom: 18, attribution: "위성 사진: Esri, Maxar, Earthstar Geographics" },
          osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" },
          dem: { type: "raster-dem", tiles: [TERRAIN], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: "지형: Mapzen/AWS Terrain Tiles" },
          hill: { type: "raster-dem", tiles: [TERRAIN], tileSize: 256, maxzoom: 14, encoding: "terrarium" },
          ofm: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenFreeMap © OpenMapTiles" },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#dfe8e2" } },
          { id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } },
          { id: "sat", type: "raster", source: "sat" },
          { id: "hillshade", type: "hillshade", source: "hill", layout: { visibility: "none" }, paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#3a4a40" } },
          { id: "buildings-3d", type: "fill-extrusion", source: "ofm", "source-layer": "building", minzoom: 13, filter: ["!=", ["get", "hide_3d"], true],
            paint: {
              "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, "#efe9dc", 30, "#ddd3c0", 100, "#c6baa4"],
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.8,
            } },
        ],
        terrain: { source: "dem", exaggeration: 1.3 },
        sky: { "sky-color": "#9fd0ee", "horizon-color": "#e6f2f8", "fog-color": "#e6f2f8", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.2, "atmosphere-blend": 0.6 },
      },
    });
  } catch { toast(t("이 기기에서는 3D 화면을 볼 수 없어요")); return closeView3D(); }
  // 위성 사진·건물을 못 받아도(오프라인 등) 받은 것만으로 보여 준다
  map.on("error", (e) => console.warn("3D", e?.error?.message || e));
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right"); // 아래쪽 버튼을 가리지 않게 위로

  // 관광지 표시: 이름표가 달린 핀
  const pin = document.createElement("div");
  pin.className = "v3d-pin";
  pin.innerHTML = "<span></span><i></i>";
  pin.querySelector("span").textContent = place.name;
  new maplibregl.Marker({ element: pin, anchor: "bottom" }).setLngLat(center).addTo(map);

  // ---------- 둘러보기: 장소 둘레를 천천히 돈다. 손을 대면 멈춘다 ----------
  const stopOrbit = () => { if (state.orbit) { state.orbit = false; paint(); } };
  const tick = (now) => {
    if (state.closed) return;
    if (state.orbit && !state.following) {
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
    map.setLayoutProperty("hillshade", "visibility", state.satellite ? "none" : "visible");
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
