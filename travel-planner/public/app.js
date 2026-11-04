import { planTrip, swapItem, fmt, addDays, parseRequestLocally, hoursFor, retimeDay, summarize } from "./planner.js";
import { PLACES, BASE } from "./data.js";

const $ = (s) => document.querySelector(s);
const CAT = {
  sea: { label: "바다", color: "#0284c7" },
  cafe: { label: "카페", color: "#a16207" },
  food: { label: "식사", color: "#ea580c" },
  culture: { label: "문화", color: "#7c3aed" },
  nature: { label: "자연", color: "#15803d" },
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
  for (const name of ["days", "who", "move"]) {
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
  render();
  persist();
  trip.days.forEach((_, i) => applyRoad(i));
}

/* ---------- 날씨 (예보 범위 안일 때만) ---------- */
async function loadWeather() {
  const { date, days } = state.input;
  const end = addDays(date, days - 1);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=37.75&longitude=128.9&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&start_date=${date}&end_date=${end}`;
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
  $("#timeline").innerHTML = day.items.length ? day.items.map((it, i) => itemHTML(it, i)).join("") : `<li class="empty">조건에 맞는 장소가 없어요. 조건을 바꿔보세요.</li>`;
  loadImages();
  drawMap(day);
}

function itemHTML(it, i) {
  const p = it.place, c = CAT[p.cat];
  const leg = i === 0 ? `강릉역에서 ${MODE[it.travelMode]} ${it.travelMin}분` : it.travelMode === "same" ? "바로 옆" : `${MODE[it.travelMode]} ${it.travelMin}분`;
  const hours = hoursLabel(p, trip.days[dayIdx].date);
  return `
  <li class="leg">${leg}</li>
  <li class="item" data-i="${i}">
    <div class="time"><b>${fmt(it.start)}</b><span>${fmt(it.end)}</span></div>
    <article class="card place">
      <div class="thumb" data-wiki="${p.wiki}" style="--c:${c.color}"><span>${i + 1}</span></div>
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
const routeKey = (day) => [BASE, ...day.items.map((i) => i.place)].map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");

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
      trip = summarize(days);
      if (i === dayIdx) render(); else renderStatsOnly();
      persist();
      return;
    }
  }
  if (i === dayIdx) drawMap(day);
}
function renderStatsOnly() { if (trip.days.every((d) => d.road)) render(); }

/* ---------- 사진 ---------- */
const imgCache = store.get("img") || {};
async function wikiImage(title) {
  if (title in imgCache) return imgCache[title];
  try {
    const res = await fetch(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    const j = res.ok ? await res.json() : {};
    imgCache[title] = j.thumbnail?.source || j.originalimage?.source || "";
  } catch { return ""; }
  store.set("img", imgCache);
  return imgCache[title];
}
function loadImages() {
  document.querySelectorAll(".thumb[data-wiki]").forEach(async (el) => {
    const src = await wikiImage(el.dataset.wiki);
    if (src) { el.style.backgroundImage = `url("${src}")`; el.classList.add("has-img"); }
  });
}
(async () => {
  const src = await wikiImage("경포해수욕장");
  if (src) $("#hero").style.setProperty("--hero", `url("${src.replace(/\/\d+px-/, "/1280px-")}")`);
})();

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
    L.polyline([[BASE.lat, BASE.lng], ...pts], { color: "#0b5e6b", weight: 3, opacity: 0.6, dashArray: "6 6" }).addTo(layer);
    applyRoad(dayIdx);
  }
  L.marker([BASE.lat, BASE.lng], { icon: L.divIcon({ className: "pin base", html: "<span>역</span>", iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(layer).bindTooltip(BASE.name);
  day.items.forEach((it, i) => {
    const icon = L.divIcon({ className: "pin", html: `<span style="--c:${CAT[it.place.cat].color}">${i + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    L.marker([it.place.lat, it.place.lng], { icon }).addTo(layer).bindTooltip(`${fmt(it.start)} ${it.place.name}`);
  });
  map.invalidateSize();
  map.fitBounds(known ? known.line : [[BASE.lat, BASE.lng], ...pts], { padding: [36, 36], maxZoom: 14 });
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

$("#askForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#askInput").value.trim(); if (!text) return;
  const btn = e.submitter || $("#askForm button");
  btn.disabled = true; btn.textContent = "…";
  const o = state.opts;
  const current = { likes: state.input.likes, who: state.input.who, prefer: o.prefer, avoid: o.avoid, indoor: !!o.indoor, lessWalk: !!o.lessWalk, pace: o.pace };
  let r = null;
  try {
    const res = await fetch("api/adjust", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, current }) });
    if (res.ok) r = await res.json();
  } catch {}
  if (!r) r = { ...current, ...parseRequestLocally(text) };
  o.prefer = r.prefer || []; o.avoid = r.avoid || [];
  o.indoor = !!r.indoor; o.lessWalk = !!r.lessWalk; o.pace = r.pace || o.pace;
  rebuild();
  $("#askInput").value = "";
  btn.disabled = false; btn.textContent = "반영";
  toast(r.summary || "요청을 반영했어요");
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
