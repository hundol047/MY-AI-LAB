import { planTrip, swapItem, fmt, addDays, parseRequestLocally, hoursFor, retimeDay, summarize, festivalsDuring, baseOf } from "./planner.js";
import { PLACES, REGIONS } from "./data.js";
import { startLocal, guideLocal } from "./ai-local.js";

const $ = (s) => document.querySelector(s);
const CAT = {
  sea: { label: "바다", color: "#0284c7" },
  cafe: { label: "카페", color: "#a16207" },
  food: { label: "식사", color: "#ea580c" },
  culture: { label: "문화", color: "#7c3aed" },
  nature: { label: "자연", color: "#15803d" },
  festival: { label: "축제", color: "#db2777" },
};
const KIND = { lunch: "점심", dinner: "저녁" };
const MODE = { walk: "도보", car: "차", bus: "버스", same: "바로 옆" };
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

let state = null; // { input, opts }
let trip = null;
let dayIdx = 0;
let weather = {};
let map = null, layer = null;

/* ---------- 저장 / 공유 ---------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function encodeState(s) { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))); }
function decodeState(h) { try { return JSON.parse(decodeURIComponent(escape(atob(h)))); } catch { return null; } }
function snapshot() {
  return { input: state.input, opts: { ...state.opts, keep: trip.days.map((d) => d.items.map((i) => i.id)) } };
}
function persist() {
  const snap = snapshot();
  store.set("lastTrip", snap);
  history.replaceState(null, "", "#" + encodeState(snap));
}

/* ---------- 입력 폼 ---------- */
function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
$("#date").value = tomorrow();
$("#date").min = new Date().toISOString().slice(0, 10);

document.querySelectorAll(".seg").forEach((seg) => {
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  });
});
document.querySelector('.chips[data-name="likes"]').addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (b) b.classList.toggle("on");
});
const segValue = (name) => document.querySelector(`.seg[data-name="${name}"] .on`)?.dataset.v;

$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = {
    region: segValue("region"),
    date: $("#date").value || tomorrow(),
    days: Number(segValue("days")),
    who: segValue("who"),
    likes: [...document.querySelectorAll('.chips[data-name="likes"] .on')].map((b) => b.dataset.v),
    move: segValue("move"),
  };
  const lessWalk = input.who === "parents";
  state = { input, opts: { pace: "normal", lessWalk, prefer: [], avoid: [], exclude: [], rainDays: [] } };
  dayIdx = 0;
  rebuild();
  show("result");
  loadWeather();
});

function fillForm(input) {
  $("#date").value = input.date;
  for (const name of ["region", "days", "who", "move"]) {
    document.querySelectorAll(`.seg[data-name="${name}"] button`).forEach((b) => b.classList.toggle("on", b.dataset.v === String(input[name])));
  }
  document.querySelectorAll('.chips[data-name="likes"] button').forEach((b) => b.classList.toggle("on", input.likes.includes(b.dataset.v)));
}

/* ---------- 화면 전환 ---------- */
function show(which) {
  $("#setup").hidden = which !== "setup";
  $("#result").hidden = which !== "result";
  $("#topActions").hidden = which !== "result";
  window.scrollTo({ top: 0 });
  if (which === "result" && trip) setTimeout(() => drawMap(trip.days[dayIdx]), 50);
}
$("#home").addEventListener("click", () => { if (state) fillForm(state.input); show("setup"); });
$("#editBtn").addEventListener("click", () => { fillForm(state.input); show("setup"); });

/* ---------- 일정 생성 ---------- */
function rebuild(keepLayout = false) {
  const opts = { ...state.opts };
  if (!keepLayout) delete opts.keep;
  state.opts = opts;
  trip = planTrip(state.input, opts);
  if (trip.lodging) state.opts.lodgingId = trip.lodging.id; // 조건을 조금 바꿔도 숙소는 그대로
  render();
  persist();
  trip.days.forEach((_, i) => applyRoad(i));
}

/* ---------- 날씨 (예보 범위 안일 때만) ---------- */
async function loadWeather() {
  const { date, days } = state.input;
  const end = addDays(date, days - 1);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${baseOf(state.input).lat}&longitude=${baseOf(state.input).lng}&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&start_date=${date}&end_date=${end}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const j = await res.json();
    weather = {};
    let changed = false;
    j.daily.time.forEach((t, i) => {
      const rain = j.daily.precipitation_probability_max[i];
      weather[t] = { rain, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]) };
      if (rain >= 60 && !state.opts.rainDays[i]) { state.opts.rainDays[i] = true; changed = true; }
    });
    if (changed) { rebuild(); toast("비 예보가 있는 날은 실내 위주로 바꿨어요"); } else render();
  } catch { /* 예보 범위 밖이거나 오프라인 */ }
}

/* ---------- 렌더링 ---------- */
function dateLabel(ds) {
  const [y, m, d] = ds.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(y, m - 1, d).getDay()]})`;
}
function minutesLabel(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}시간${r ? ` ${r}분` : ""}` : `${r}분`;
}

function render() {
  const { input } = state;
  const nights = ["당일", "1박 2일", "2박 3일"][input.days - 1];
  $("#tripTitle").textContent = `${dateLabel(input.date)} · ${nights}`;
  const t = trip.totals;
  $("#stats").innerHTML = `
    <span>${t.places}곳</span>
    <span>이동 ${minutesLabel(t.moveMin)}</span>
    <span class="${t.conflicts ? "warn" : "ok"}">${t.conflicts ? `영업시간 충돌 ${t.conflicts}건` : "영업시간·휴무 확인 완료"}</span>
    ${trip.days.every((d) => d.road) && state.input.move === "car" ? `<span>실제 도로 기준</span>` : ""}`;

  $("#tabs").innerHTML = trip.days.map((d, i) => {
    const w = weather[d.date];
    return `<button type="button" data-i="${i}" class="${i === dayIdx ? "on" : ""}">
      <strong>${i + 1}일차</strong><span>${d.areaName}${w ? ` · ${w.min}°/${w.max}°${w.rain >= 40 ? ` · 비 ${w.rain}%` : ""}` : ""}</span>
    </button>`;
  }).join("");

  const o = state.opts;
  const active = { rain: !!o.rainDays[dayIdx] || o.indoor, lessWalk: o.lessWalk, relaxed: o.pace === "relaxed", packed: o.pace === "packed" };
  document.querySelectorAll("#quick button").forEach((b) => b.classList.toggle("on", !!active[b.dataset.q]));

  const day = trip.days[dayIdx];
  $("#timeline").innerHTML = (day.items.length ? day.items.map((it, i) => itemHTML(it, i, day)).join("") : `<li class="empty">조건에 맞는 장소가 없어요. 조건을 바꿔보세요.</li>`) + lodgingHTML(day);
  renderFestivals();
  renderLodging();
  loadImages();
  drawMap(day);
}

function itemHTML(it, i, day) {
  const p = it.place, c = CAT[p.cat];
  const leg = i === 0 ? `${day.start.name}에서 ${MODE[it.travelMode]} ${it.travelMin}분` : it.travelMode === "same" ? "바로 옆" : `${MODE[it.travelMode]} ${it.travelMin}분`;
  const hours = hoursLabel(p, trip.days[dayIdx].date);
  return `
  <li class="leg">${leg}</li>
  <li class="item" data-i="${i}">
    <div class="time"><b>${fmt(it.start)}</b><span>${fmt(it.end)}</span></div>
    <article class="card place">
      <div class="thumb" data-photo="${p.id}" style="--c:${c.color}"><span>${i + 1}</span><em>${c.label}</em></div>
      <div class="info">
        <div class="meta"><span class="tag" style="--c:${c.color}">${KIND[it.kind] || c.label}</span>${p.indoor ? `<span class="tag soft">실내</span>` : ""}</div>
        <h3>${p.name}</h3>
        <p>${p.desc}</p>
        <div class="check${p.multi ? " soft" : ""}">${p.multi ? "" : "✓ "}${hours}</div>
      <div class="acts">
        <a class="ghost small" href="https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}" target="_blank" rel="noopener">길찾기</a>
        <button class="ghost small" type="button" data-swap="${i}">바꾸기</button>
      </div>
      </div>
    </article>
  </li>`;
}

function hoursLabel(p, date) {
  if (p.cat === "festival") return `축제 기간 ${p.start.slice(5).replace("-", ".")}–${p.end.slice(5).replace("-", ".")}`;
  const h = hoursFor(p, date);
  if (h.open === 0 && h.close >= 1439) return "상시 개방";
  if (p.multi) return `가게별 상이 · 대체로 ${fmt(h.open)}–${fmt(h.close)}`;
  let s = `운영 ${fmt(h.open)}–${fmt(h.close)}`;
  if (h.lastEntry !== null) s += ` · ${p.cat === "food" || p.cat === "cafe" ? "주문" : "입장"} ${fmt(h.lastEntry)}까지`;
  if (h.breaks.length) s += ` · 휴식 ${h.breaks.map(([a, b]) => `${fmt(a)}–${fmt(b)}`).join(", ")}`;
  return s;
}

/* ---------- 실제 도로 경로 (OSRM) ---------- */
const OSRM = "https://router.project-osrm.org";
const routeCache = new Map();
const routeKey = (day) => [day.start, ...day.items.map((i) => i.place)].map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");

async function roadRoute(day) {
  const key = routeKey(day);
  if (routeCache.has(key)) return routeCache.get(key);
  const pending = (async () => {
    try {
      const res = await fetch(`${OSRM}/route/v1/driving/${key}?overview=full&geometries=geojson`);
      if (!res.ok) return null;
      const j = await res.json();
      const r = j.code === "Ok" && j.routes?.[0];
      if (!r) return null;
      return { line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), legs: r.legs.map((l) => l.duration) };
    } catch { return null; }
  })();
  routeCache.set(key, pending);
  const out = await pending;
  if (out) routeCache.set(key, out); else routeCache.delete(key);
  return out;
}

// 실제 도로 이동시간(+주차 5분)으로 그날 시간을 다시 계산
async function applyRoad(i) {
  const day = trip.days[i];
  if (!day || !day.items.length) return;
  const route = await roadRoute(day);
  if (!route || trip.days[i] !== day) return;
  if (state.input.move === "car" && !day.road) {
    const legMins = route.legs.map((sec) => Math.max(5, Math.round((sec / 60 + 5) / 5) * 5));
    const re = retimeDay(day, state.input, state.opts, legMins);
    if (re) {
      const days = trip.days.slice(); days[i] = re;
      trip = summarize(days, trip.lodging);
      if (i === dayIdx) render(); else renderStatsOnly();
      persist();
      return;
    }
  }
  if (i === dayIdx) drawMap(day);
}
function renderStatsOnly() { if (trip.days.every((d) => d.road)) render(); }

/* ---------- 사진 ----------
   1) photos.json: 미리 모아 둔 장소별 사진 (scripts/bake-photos.mjs)
   2) /api/photo: 서버에 한국관광공사 TourAPI 키가 있으면 공식 사진
   3) 위키백과 대표 사진 → 위키미디어 공용 검색 */
const imgCache = store.get("img2") || {};
let baked = null;
const bakedReady = fetch("photos.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => (baked = j));
const placeById = (id) => PLACES.find((p) => p.id === id) || trip?.days.flatMap((d) => d.items).find((i) => i.id === id)?.place;

async function getJSON(url) {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
}
async function photoFor(p) {
  if (!p) return "";
  if (imgCache[p.id]) return imgCache[p.id];
  await bakedReady;
  let src = baked?.[p.id] || "";
  if (!src) src = (await getJSON(`api/photo?id=${encodeURIComponent(p.id)}&name=${encodeURIComponent(p.name)}&lat=${p.lat}&lng=${p.lng}`))?.url || "";
  if (!src && p.wiki) {
    const j = await getJSON(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.wiki)}`);
    src = j?.thumbnail?.source || "";
  }
  if (!src) {
    const q = encodeURIComponent(p.name.replace(/[·()]/g, " "));
    const j = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=1&gsrsearch=${q}&prop=imageinfo&iiprop=url&iiurlwidth=480&format=json&origin=*`);
    const page = j?.query?.pages && Object.values(j.query.pages)[0];
    src = page?.imageinfo?.[0]?.thumburl || "";
  }
  if (src) { imgCache[p.id] = src; store.set("img2", imgCache); }
  return src;
}
function setPhoto(el, src) {
  const img = new Image();
  img.onload = () => { el.style.backgroundImage = `url("${src}")`; el.classList.add("has-img"); };
  img.src = src;
}
function loadImages() {
  document.querySelectorAll(".thumb[data-photo]").forEach(async (el) => {
    const src = await photoFor(placeById(el.dataset.photo));
    if (src) setPhoto(el, src);
  });
}
(async () => {
  const src = await photoFor(PLACES.find((p) => p.id === "gyeongpo-beach"));
  if (src) $("#hero").style.setProperty("--hero", `url("${src.replace(/\/\d+px-/, "/1280px-")}")`);
})();

/* ---------- 축제 ---------- */
function renderFestivals() {
  const list = festivalsDuring(state.input);
  const box = $("#festivals");
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  const fmtRange = (f) => f.confirmed ? `${f.start.slice(5).replace("-", ".")}–${f.end.slice(5).replace("-", ".")}` : `매년 ${f.months.join("·")}월 · 날짜 발표 전`;
  list.sort((a, b) => (b.here - a.here) || (b.confirmed - a.confirmed));
  const row = (f) => `
    <li class="${f.here && f.confirmed ? "in" : ""}">
      <b>${f.name}</b><span>${REGIONS[f.region].label} · ${fmtRange(f)}</span>
      ${f.here && f.confirmed && trip.days.some((d) => d.items.some((i) => i.id === f.id)) ? `<em>일정에 넣었어요</em>` : ""}
    </li>`;
  const top = list.slice(0, 3), rest = list.slice(3);
  box.innerHTML = `<h3>여행 기간의 강원 축제</h3><ul>${top.map(row).join("")}</ul>${rest.length ? `<details><summary>${rest.length}개 더 보기</summary><ul>${rest.map(row).join("")}</ul></details>` : ""}`;
}

/* ---------- 숙소: 여행 내내 한 곳 ---------- */
function renderLodging() {
  const box = $("#lodgingCard"), l = trip.lodging;
  if (!l) { box.hidden = true; return; }
  box.hidden = false;
  const q = encodeURIComponent(l.query);
  box.innerHTML = `
    <div class="info">
      <div class="meta"><span class="tag" style="--c:#0b5e6b">추천 숙소 · ${l.nights}박 내내</span></div>
      <h3>${l.name} · ${l.typeLabel}</h3>
      <p>${l.desc}</p>
      <div class="why">${l.reason}${l.others.length ? ` · 다른 선택: ${l.others.join(", ")}` : ""}</div>
    </div>
    <div class="acts">
      <a class="ghost small" href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener">네이버에서 찾기</a>
      <a class="ghost small" href="https://map.kakao.com/?q=${q}" target="_blank" rel="noopener">카카오맵</a>
    </div>`;
}
function lodgingHTML(day) {
  if (!trip.lodging || day.dayIdx >= state.input.days - 1) return "";
  return `<li class="leg home">숙소(${trip.lodging.name})로 · 약 ${day.toLodgingKm ?? "-"}km</li>`;
}

/* ---------- 지도 ---------- */
function drawMap(day) {
  if (!window.L) return;
  if (!map) {
    map = L.map("map", { zoomControl: false });
    map.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    addLocateControl();
  }
  if (layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  const pts = day.items.map((it) => [it.place.lat, it.place.lng]);
  if (!pts.length) return;
  const cached = routeCache.get(routeKey(day));
  const known = cached && !(cached instanceof Promise) ? cached : null;
  if (known) {
    L.polyline(known.line, { color: "#0b5e6b", weight: 5, opacity: 0.85 }).addTo(layer);
  } else {
    L.polyline([[day.start.lat, day.start.lng], ...pts], { color: "#0b5e6b", weight: 3, opacity: 0.6, dashArray: "6 6" }).addTo(layer);
    applyRoad(dayIdx);
  }
  const startLabel = day.start.name.startsWith("숙소") ? "숙" : "출";
  L.marker([day.start.lat, day.start.lng], { icon: L.divIcon({ className: "pin base", html: `<span>${startLabel}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(layer).bindTooltip(day.start.name);
  const L0 = trip.lodging;
  if (L0 && !day.start.name.startsWith("숙소")) L.marker([L0.lat, L0.lng], { icon: L.divIcon({ className: "pin base", html: "<span>숙</span>", iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(layer).bindTooltip(`숙소 · ${L0.name}`);
  day.items.forEach((it, i) => {
    const icon = L.divIcon({ className: "pin", html: `<span style="--c:${CAT[it.place.cat].color}">${i + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    L.marker([it.place.lat, it.place.lng], { icon }).addTo(layer).bindTooltip(`${fmt(it.start)} ${it.place.name}`);
  });
  map.invalidateSize();
  const extra = trip.lodging ? [[trip.lodging.lat, trip.lodging.lng]] : [];
  map.fitBounds([...(known ? known.line : [[day.start.lat, day.start.lng], ...pts]), ...extra], { padding: [36, 36], maxZoom: 14 });
}

let meMarker = null;
function addLocateControl() {
  const Ctl = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create("button", "locate");
      b.type = "button"; b.title = "내 위치"; b.setAttribute("aria-label", "내 위치");
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
      L.DomEvent.on(b, "click", (e) => {
        L.DomEvent.stop(e);
        if (!navigator.geolocation) return toast("위치를 사용할 수 없어요");
        navigator.geolocation.getCurrentPosition((pos) => {
          const ll = [pos.coords.latitude, pos.coords.longitude];
          if (meMarker) meMarker.remove();
          meMarker = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(map);
          map.setView(ll, 14);
        }, () => toast("위치 권한을 허용해 주세요"), { enableHighAccuracy: true, timeout: 8000 });
      });
      return b;
    },
  });
  new Ctl({ position: "bottomright" }).addTo(map);
}

/* ---------- 조작 ---------- */
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  dayIdx = Number(b.dataset.i); render();
});

$("#timeline").addEventListener("click", (e) => {
  const b = e.target.closest("[data-swap]"); if (!b) return;
  const i = Number(b.dataset.swap);
  const old = trip.days[dayIdx].items[i].id;
  state.opts.exclude = [...new Set([...(state.opts.exclude || []), old])];
  trip = swapItem(trip, state.input, state.opts, dayIdx, i);
  render(); persist();
  applyRoad(dayIdx);
  const now = trip.days[dayIdx].items[i];
  toast(now ? `${now.place.name}(으)로 바꿨어요` : "대신 갈 수 있는 곳이 없어 뺐어요");
});

$("#quick").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const o = state.opts, q = b.dataset.q;
  if (q === "rain") {
    const on = !(o.rainDays[dayIdx] || o.indoor);
    o.rainDays[dayIdx] = on; if (!on) o.indoor = false;
  }
  if (q === "lessWalk") o.lessWalk = !o.lessWalk;
  if (q === "relaxed") o.pace = o.pace === "relaxed" ? "normal" : "relaxed";
  if (q === "packed") o.pace = o.pace === "packed" ? "normal" : "packed";
  rebuild();
});

/* ---------- AI 가이드 ---------- */
const guideHistory = [];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function bubble(who, text) {
  const el = document.createElement("div");
  el.className = `msg ${who}`;
  el.innerHTML = esc(text);
  $("#guideLog").append(el);
  $("#guideLog").scrollTop = $("#guideLog").scrollHeight;
  return el;
}
function compactTrip() {
  const o = state.opts;
  return {
    input: state.input,
    opts: { pace: o.pace, lessWalk: !!o.lessWalk, indoor: !!o.indoor, prefer: o.prefer || [], avoid: o.avoid || [] },
    lodging: trip.lodging && { name: trip.lodging.name, typeLabel: trip.lodging.typeLabel },
    days: trip.days.map((d) => ({ date: d.date, areaName: d.areaName, items: d.items.map((i) => ({ id: i.id, name: i.place.name, start: fmt(i.start) })) })),
  };
}
async function askGuide(question) {
  bubble("me", question);
  const wait = bubble("ai pending", "…");
  let r = null;
  try {
    const res = await fetch("api/guide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, history: guideHistory, trip: compactTrip() }) });
    if (res.ok) r = await res.json();
  } catch {}
  if (!r) r = guideLocal(question, trip, dayIdx);
  let note = "";
  if (r.changed) {
    const o = state.opts, uniq = (a) => [...new Set(a)];
    o.exclude = uniq([...(o.exclude || []), ...(r.remove || [])]).filter((id) => !(r.add || []).includes(id));
    o.must = uniq([...(o.must || []), ...(r.add || [])]);
    if (r.prefer) o.prefer = r.prefer;
    if (r.avoid) o.avoid = r.avoid;
    if (r.indoor === "on") o.indoor = true; else if (r.indoor === "off") { o.indoor = false; o.rainDays = []; }
    if (r.lessWalk === "on") o.lessWalk = true; else if (r.lessWalk === "off") o.lessWalk = false;
    if (r.pace && r.pace !== "keep") o.pace = r.pace;
    rebuild();
    // 엔진이 다시 확인한 결과를 그대로 알려준다
    const placed = new Set(trip.days.flatMap((d) => d.items.map((i) => i.id)));
    const missed = (r.add || []).filter((id) => !placed.has(id)).map((id) => placeById(id)?.name || id);
    note = missed.length ? ` (${missed.join(", ")}은(는) 영업시간·휴무가 맞지 않아 넣지 못했어요)` : " 영업시간을 다시 확인해 일정에 반영했어요.";
  }
  wait.classList.remove("pending");
  wait.innerHTML = esc(r.answer + note);
  guideHistory.push({ q: question, a: r.answer });
}
$("#askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#askInput").value.trim(); if (!text) return;
  $("#askInput").value = "";
  askGuide(text);
});
$("#suggest").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (b) askGuide(b.textContent);
});

/* ---------- AI로 한 줄 시작 ---------- */
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
$("#aiStart").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#aiStartInput").value.trim(); if (!text) return;
  const btn = $("#aiStart button"); btn.disabled = true; btn.textContent = "…";
  let r = null;
  try {
    const res = await fetch("api/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, today: todayStr() }) });
    if (res.ok) r = await res.json();
  } catch {}
  if (!r) r = startLocal(text, todayStr());
  btn.disabled = false; btn.textContent = "만들기";
  fillForm({ ...r, days: Number(r.days) });
  $("#form").requestSubmit();
  if (r.summary) toast(r.summary);
});

/* ---------- 공유 / 캘린더 ---------- */
$("#shareBtn").addEventListener("click", async () => {
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: "강릉 여행 일정", url });
    else { await navigator.clipboard.writeText(url); toast("링크를 복사했어요"); }
  } catch {}
});

$("#icsBtn").addEventListener("click", () => {
  const stamp = (ds, min) => ds.replace(/-/g, "") + "T" + fmt(min).replace(":", "") + "00";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ohneul-gangneung//KO", "CALSCALE:GREGORIAN"];
  trip.days.forEach((d) => d.items.forEach((it, i) => {
    lines.push("BEGIN:VEVENT",
      `UID:${d.date}-${i}-${it.id}@ohneul-gangneung`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;TZID=Asia/Seoul:${stamp(d.date, it.start)}`,
      `DTEND;TZID=Asia/Seoul:${stamp(d.date, it.end)}`,
      `SUMMARY:${it.place.name}`,
      `LOCATION:${it.place.name}`,
      `GEO:${it.place.lat};${it.place.lng}`,
      "END:VEVENT");
  }));
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `강릉여행_${state.input.date}.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ---------- 알림 ---------- */
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------- 시작: 공유 링크 / 지난 일정 복원 ---------- */
(function boot() {
  const fromHash = location.hash.length > 1 ? decodeState(location.hash.slice(1)) : null;
  const saved = fromHash || null;
  if (saved && saved.input && PLACES.length) {
    state = { input: saved.input, opts: { rainDays: [], exclude: [], prefer: [], avoid: [], ...saved.opts } };
    trip = planTrip(state.input, state.opts);
    show("result"); render();
    trip.days.forEach((_, i) => applyRoad(i));
    loadWeather();
  } else {
    const last = store.get("lastTrip");
    if (last?.input) fillForm({ ...last.input, date: last.input.date < $("#date").min ? tomorrow() : last.input.date });
  }
})();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
