import { planTrip, swapItem, drives, fmt, addDays, parseRequestLocally, hoursFor, retimeDay, summarize, festivalsDuring, baseOf, benefitsFor, overnightCompare, souvenirsFor } from "./planner.js";
import { PLACES, REGIONS, SHOP_MALL } from "./data.js";
import { checkLodgingLocal } from "./ai-local.js";
import { t, isEN, getLang, setLang, applyStatic, loadDataEn, placeName, placeDesc, dateLabel, minutesLabel, monthsLabel, regionLabel, areaName, lodgingName, lodgingDesc, typeLabel, typeLabelFromKo, lodgingReason, benefitText, startName } from "./i18n.js";
import { startLocal, guideLocal } from "./ai-local.js";

const $ = (s) => document.querySelector(s);
// 응답이 늦으면 기다리지 않고 포기 (화면이 멈춰 보이지 않게)
function fetchT(url, opts = {}, ms = 5000) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(timer));
}
// 분류 이름은 화면에 쓸 때 t()로 바꾼다
const CAT = {
  sea: { label: "바다", color: "#0284c7" },
  cafe: { label: "카페", color: "#a16207" },
  food: { label: "식사", color: "#ea580c" },
  culture: { label: "문화", color: "#7c3aed" },
  nature: { label: "자연", color: "#15803d" },
  festival: { label: "축제", color: "#db2777" },
};
const KIND = { lunch: "점심", dinner: "저녁" };
const MODE = { walk: "도보", car: "차", taxi: "택시", bus: "버스", same: "바로 옆" };

let state = null; // { input, opts }
let trip = null;
let dayIdx = 0;
let weather = {};
let map = null, layer = null;

/* ---------- 저장 / 공유 ---------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
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
$("#date").min = addDays(tomorrow(), -1); // 오늘 (기기 시간대 기준)

document.querySelectorAll(".seg").forEach((seg) => {
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    seg.querySelectorAll("button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
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
  restoredFromLink = false;
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
    const res = await fetchT(url, {}, 4000);
    if (!res.ok) return;
    const j = await res.json();
    weather = {};
    let changed = false;
    j.daily.time.forEach((t, i) => {
      const rain = j.daily.precipitation_probability_max[i];
      weather[t] = { rain, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]) };
      // 공유받은 일정은 그대로 보여 주고, 직접 만든 일정만 비 예보에 맞춰 바꾼다
      if (rain >= 60 && !state.opts.rainDays[i] && !restoredFromLink) { state.opts.rainDays[i] = true; changed = true; }
    });
    if (changed) { rebuild(); toast(t("비 예보가 있는 날은 실내 위주로 바꿨어요")); } else render();
  } catch { /* 예보 범위 밖이거나 오프라인 */ }
}

/* ---------- 렌더링 ---------- */

function render() {
  const { input } = state;
  const nights = t(["당일", "1박 2일", "2박 3일", "3박 4일", "4박 5일"][input.days - 1] || `${input.days - 1}박 ${input.days}일`);
  $("#tripTitle").textContent = `${dateLabel(input.date)} · ${nights}`;
  const tot = trip.totals;
  $("#stats").innerHTML = `
    <span>${t("{n}곳", { n: tot.places })}</span>
    <span>${t("이동 {t}", { t: minutesLabel(tot.moveMin) })}</span>
    <span class="${tot.conflicts ? "warn" : "ok"}">${tot.conflicts ? t("영업시간 충돌 {n}건", { n: tot.conflicts }) : t("영업시간·휴무 확인 완료")}</span>
    ${trip.days.every((d) => d.road) && drives(state.input.move) ? `<span>${t("실제 도로 기준")}</span>` : ""}`;

  $("#tabs").innerHTML = trip.days.map((d, i) => {
    const w = weather[d.date];
    return `<button type="button" data-i="${i}" class="${i === dayIdx ? "on" : ""}">
      <strong>${t("{n}일차", { n: i + 1 })}</strong><span>${esc(areaName(d.areaName))}${w ? ` · ${w.min}°/${w.max}°${w.rain >= 40 ? t(" · 비 {p}%", { p: w.rain }) : ""}` : ""}</span>
    </button>`;
  }).join("");

  const o = state.opts;
  const active = { rain: !!o.rainDays[dayIdx] || o.indoor, lessWalk: o.lessWalk, relaxed: o.pace === "relaxed", packed: o.pace === "packed" };
  document.querySelectorAll("#quick button").forEach((b) => b.classList.toggle("on", !!active[b.dataset.q]));

  const day = trip.days[dayIdx];
  $("#timeline").innerHTML = (day.items.length ? day.items.map((it, i) => itemHTML(it, i, day)).join("") : `<li class="empty">${t("조건에 맞는 장소가 없어요. 조건을 바꿔보세요.")}</li>`) + lodgingHTML(day);
  renderFestivals();
  renderLodging();
  renderBenefits();
  renderOvernight();
  renderSouvenirs();
  renderShops();
  loadImages();
  drawMap(day);
}

function itemHTML(it, i, day) {
  const p = it.place, c = CAT[p.cat];
  const mode = t(MODE[it.travelMode]);
  const leg = i === 0 ? t("{start}에서 {mode} {min}분", { start: esc(startName(day.start, trip.lodging)), mode, min: it.travelMin }) : it.travelMode === "same" ? t("바로 옆") : t("{mode} {min}분", { mode, min: it.travelMin });
  const hours = hoursLabel(p, trip.days[dayIdx].date);
  return `
  <li class="leg">${leg}</li>
  <li class="item" data-i="${i}">
    <div class="time"><b>${fmt(it.start)}</b><span>${fmt(it.end)}</span></div>
    <article class="card place">
      <div class="thumb" data-photo="${p.id}" style="--c:${c.color}"><span>${i + 1}</span><em>${t(c.label)}</em></div>
      <div class="info">
        <div class="meta"><span class="tag" style="--c:${c.color}">${t(KIND[it.kind] || c.label)}</span>${p.indoor ? `<span class="tag soft">${t("실내")}</span>` : ""}</div>
        <h3>${esc(placeName(p))}</h3>
        <p>${esc(placeDesc(p))}</p>
        <div class="check${p.multi ? " soft" : ""}">${p.multi ? "" : "✓ "}${hours}</div>
      <div class="acts">
        <a class="ghost small" href="https://map.kakao.com/link/search/${encodeURIComponent(searchName(p))}" target="_blank" rel="noopener">${t("길찾기")}</a>
        <button class="ghost small" type="button" data-swap="${i}">${t("바꾸기")}</button>
      </div>
      </div>
    </article>
  </li>`;
}

// 길찾기는 카카오맵 장소 검색으로: 지도 서비스의 정확한 위치로 안내된다
const searchName = (p) => p.name;

function hoursLabel(p, date) {
  if (p.cat === "festival") return t("축제 기간 {a}–{b}", { a: p.start.slice(5).replace("-", "."), b: p.end.slice(5).replace("-", ".") });
  const h = hoursFor(p, date);
  if (h.open === 0 && h.close >= 1439) return t("상시 개방");
  if (p.multi) return t("가게별 상이 · 대체로 {a}–{b}", { a: fmt(h.open), b: fmt(h.close) });
  let s = t("운영 {a}–{b}", { a: fmt(h.open), b: fmt(h.close) });
  if (h.lastEntry !== null) s += t(p.cat === "food" || p.cat === "cafe" ? " · 주문 {t}까지" : " · 입장 {t}까지", { t: fmt(h.lastEntry) });
  if (h.breaks.length) s += t(" · 휴식 {r}", { r: h.breaks.map(([a, b]) => `${fmt(a)}–${fmt(b)}`).join(", ") });
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
      const res = await fetchT(`${OSRM}/route/v1/driving/${key}?overview=full&geometries=geojson`, {}, 5000);
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
  if (drives(state.input.move) && !day.road) {
    // 실제 도로 시간 + 자동차는 주차 5분, 택시는 기다리는 2분
    const extra = state.input.move === "taxi" ? 2 : 5;
    const legMins = route.legs.map((sec) => Math.max(5, Math.round((sec / 60 + extra) / 5) * 5));
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
   1) photos.json: 한국관광공사 TourAPI에서 이름·좌표(2km)를 확인해 미리 모은 사진 (scripts/bake-photos.mjs, reports/photos.md)
   2) /api/photo: 서버에 TourAPI 키가 있으면 같은 검증 규칙으로 찾은 공식 사진
   3) 위키백과 대표 사진: 장소에 지정된 문서(p.wiki)만, 여러 가게가 모인 곳은 제외 (다른 곳 사진 방지)
   속도: 화면에 보이는 카드만, 동시에 4개까지, 요청마다 3.5초 제한, 못 찾은 곳은 하루 동안 다시 찾지 않음 */
const DAY_MS = 864e5;
const imgCache = store.get("img4") || {};
let baked = {};
const bakedReady = fetchT("photos.json", {}, 3000).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => (baked = j));
let photoApi = true; // 서버에 사진 키가 없으면 첫 요청 뒤로 건너뜀
// 화면에 보일 이름: id나 한국어 이름으로 장소를 찾아 현재 언어로
const nameOf = (id, ko) => { const p = (id && placeById(id)) || PLACES.find((x) => x.name === ko); return p ? placeName(p) : ko; };
const placeById = (id) => PLACES.find((p) => p.id === id) || trip?.days.flatMap((d) => d.items).find((i) => i.id === id)?.place;

async function getJSON(url, ms = 3500) {
  try { const r = await fetchT(url, {}, ms); return r.ok ? await r.json() : null; } catch { return null; }
}
async function photoFor(p) {
  if (!p) return "";
  await bakedReady;
  if (baked[p.id]) return baked[p.id]; // 검증된 사진이 언제나 먼저
  const hit = imgCache[p.id];
  if (hit && (hit.url || Date.now() - hit.t < DAY_MS)) return hit.url || "";
  let src = "";
  if (!src && photoApi) {
    try {
      const r = await fetchT(`api/photo?id=${encodeURIComponent(p.id)}&name=${encodeURIComponent(p.name)}&lat=${p.lat}&lng=${p.lng}`, {}, 3500);
      if (r.ok) src = (await r.json()).url || ""; else if (r.status === 404 || r.status === 405) photoApi = false;
    } catch { photoApi = false; }
  }
  if (!src && p.wiki && !p.multi) {
    src = (await getJSON(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.wiki)}`))?.thumbnail?.source || "";
  }
  imgCache[p.id] = { url: src, t: Date.now() };
  store.set("img4", imgCache);
  return src;
}
function setPhoto(el, src) {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => { el.style.backgroundImage = `url("${src}")`; el.classList.add("has-img"); };
  img.src = src;
}
// 동시에 4개까지만 찾기
const photoQueue = [];
let photoActive = 0;
function pumpPhotos() {
  while (photoActive < 4 && photoQueue.length) {
    const el = photoQueue.shift();
    photoActive++;
    photoFor(placeById(el.dataset.photo)).then((src) => { if (src && el.isConnected) setPhoto(el, src); })
      .finally(() => { photoActive--; pumpPhotos(); });
  }
}
const photoObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { photoObserver.unobserve(e.target); photoQueue.push(e.target); pumpPhotos(); }
    }), { rootMargin: "300px" })
  : null;
function loadImages() {
  document.querySelectorAll(".thumb[data-photo]").forEach((el) => {
    const cached = baked[el.dataset.photo] || imgCache[el.dataset.photo]?.url;
    if (cached) return setPhoto(el, cached); // 이미 찾은 사진은 바로
    if (photoObserver) photoObserver.observe(el); else { photoQueue.push(el); pumpPhotos(); }
  });
}
/* ---------- 첫 화면 히어로: 오늘의 강원 ----------
   검증된 사진(photos.json) 중 풍경으로 보기 좋은 곳만 골라 하루에 한 장씩 (한국 시간 자정에 바뀜).
   큰 간판·조형물·실내·저화질 사진은 뺐다. 같은 날엔 누구에게나 같은 사진이고, 비슷한 바다가
   이어지지 않게 고정된 순서로 섞어 돌린다. 사진은 다 받은 뒤 서서히 나타난다. */
const HERO_IDS = [
  "sacheon-beach", "jeongdongjin", "seongyojang", "gyeongpodae", "heo-park", "gwana", "haslla", "time-museum",
  "gyeongpo-lake", "gasiyeon", "jumunjin-lighthouse", "chuam", "dojjaebi", "haerang", "samcheok-cable", "jangho",
  "sokcho-beach", "yeonggeumjeong", "cheongcho", "seorak-cable", "hwajinpo", "ayajin", "hajodae", "birch",
  "nami", "soyang-skywalk", "cc-museum", "gongjicheon", "hantan-trail", "goseokjeong", "hwacheon-river", "samak-cable",
  "labor-party", "jiktang", "woljeongsa", "cheongnyeongpo", "hanbando", "hwangji", "windhill", "bangyeri", "hoengseong-lake",
];
function heroOrder() {
  // 고정 씨앗으로 섞기 (mulberry32): 배포할 때마다 순서가 바뀌지 않게
  let a = 20261104;
  const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const list = [...HERO_IDS];
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
const kstDay = () => Math.floor((Date.now() + 9 * 3600e3) / 864e5); // 한국 시간 기준 날짜 번호
let heroPlace = null;
function heroCaption() {
  const el = $("#heroCaption");
  if (!heroPlace) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>${t("오늘의 강원")} · ${esc(placeName(heroPlace))}`;
}
(async () => {
  await bakedReady;
  const order = heroOrder().filter((id) => baked[id]);
  if (!order.length) return;
  const place = PLACES.find((p) => p.id === order[kstDay() % order.length]);
  const src = baked[place.id];
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const layer = $("#heroPhoto");
    layer.style.backgroundImage = `url("${src}")`;
    layer.classList.add("on");
    heroPlace = place;
    heroCaption();
  };
  img.src = src;
})();

/* ---------- 축제 ---------- */
function renderFestivals() {
  const list = festivalsDuring(state.input);
  const box = $("#festivals");
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  const fmtRange = (f) => f.confirmed ? `${f.start.slice(5).replace("-", ".")}–${f.end.slice(5).replace("-", ".")}` : t("매년 {m}월 · 날짜 발표 전", { m: monthsLabel(f.months) });
  list.sort((a, b) => (b.here - a.here) || (b.confirmed - a.confirmed));
  const row = (f) => `
    <li class="${f.here && f.confirmed ? "in" : ""}">
      <b>${esc(placeName(f))}</b><span>${regionLabel(f.region, REGIONS[f.region].label)} · ${fmtRange(f)}</span>
      ${f.here && f.confirmed && trip.days.some((d) => d.items.some((i) => i.id === f.id)) ? `<em>${t("일정에 넣었어요")}</em>` : ""}
    </li>`;
  const top = list.slice(0, 3), rest = list.slice(3);
  box.innerHTML = `<h3>${t("여행 기간의 강원 축제")}</h3><ul>${top.map(row).join("")}</ul>${rest.length ? `<details><summary>${t("{n}개 더 보기", { n: rest.length })}</summary><ul>${rest.map(row).join("")}</ul></details>` : ""}`;
}

/* ---------- 숙소: 여행 내내 한 곳 ----------
   추천 숙소 지역 + 그 지역의 실제 숙소 3곳 (한국관광공사 숙박 정보, scripts/bake-lodging.mjs → lodging-places.json)
   "바다·호수 전망"은 관광공사 소개글에 적힌 경우만 표시한다 */
let lodgingPlaces = null;
const lodgingPlacesReady = fetchT("lodging-places.json", {}, 4000).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  .then((j) => { lodgingPlaces = j; if (trip?.lodging && !$("#result").hidden) renderLodging(); });
function staysFor(l) {
  const byType = lodgingPlaces?.[l.id] || {};
  return byType[l.type]?.length ? byType[l.type] : Object.values(byType).find((v) => v.length) || [];
}
function staysHTML(l) {
  const list = staysFor(l);
  if (!list.length) return "";
  return `<div class="stays"><b>${t("이 지역 추천 숙소")}</b><ul>${list.map((h) => {
    const q = encodeURIComponent(h.name);
    return `<li>
      <div class="stay-img"${h.photo ? ` style="background-image:url('${h.photo}')"` : ""}></div>
      <div class="stay-info"><strong>${esc(h.name)}</strong>
        <span>${h.view ? `<em>${t("바다·호수 전망")}</em> · ` : ""}${t("{km}km", { km: h.km })}</span></div>
      <div class="stay-acts"><a class="ghost small" href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener">${t("네이버")}</a><a class="ghost small" href="https://map.kakao.com/?q=${q}" target="_blank" rel="noopener">${t("카카오")}</a></div>
    </li>`;
  }).join("")}</ul><p class="stay-note">${t("한국관광공사 숙박 정보 기준 · 전망 표시는 관광공사 소개글에 적힌 곳만 · 가격과 빈 방은 예약 사이트에서 확인하세요")}</p></div>`;
}
function renderLodging() {
  const box = $("#lodgingCard"), l = trip.lodging;
  if (!l) { box.hidden = true; return; }
  box.hidden = false;
  const q = encodeURIComponent(l.query);
  box.innerHTML = `
    <div class="info">
      <div class="meta"><span class="tag" style="--c:var(--brand)">${l.nights === 1 ? t("추천 숙소 · 1박") : t("추천 숙소 · {n}박 내내", { n: l.nights })}</span></div>
      <h3>${esc(lodgingName(l))} · ${typeLabel(l.type, l.typeLabel)}</h3>
      <p>${esc(lodgingDesc(l))}</p>
      <div class="why">${lodgingReason(l)}${l.others.length ? t(" · 다른 선택: {o}", { o: l.others.map(typeLabelFromKo).join(", ") }) : ""}</div>
    </div>
    ${staysHTML(l)}
    <div class="acts">
      <a class="ghost small" href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener">${t("네이버에서 찾기")}</a>
      <a class="ghost small" href="https://map.kakao.com/?q=${q}" target="_blank" rel="noopener">${t("카카오맵")}</a>
      <button class="ghost small" type="button" id="safeOpen">${t("예약 전 안심 체크")}</button>
    </div>
    <form class="safe" id="safeForm" hidden>
      <textarea id="safeText" rows="5" maxlength="6000" placeholder="${t("예약하려는 숙소 페이지의 가격, 취소·환불 규정, 후기를 그대로 붙여넣으세요")}"></textarea>
      <button type="submit" class="primary">${t("확인")}</button>
      <div class="safe-result" id="safeResult"></div>
    </form>`;
}

/* ---------- 숙소 안심 체크 ---------- */
document.addEventListener("click", (e) => {
  if (e.target.id === "safeOpen") { $("#safeForm").hidden = !$("#safeForm").hidden; if (!$("#safeForm").hidden) $("#safeText").focus(); }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "safeForm") return;
  e.preventDefault();
  const text = $("#safeText").value.trim(); if (text.length < 20) return toast(t("숙소 페이지 내용을 조금 더 붙여넣어 주세요"));
  const btn = e.target.querySelector("button"); btn.disabled = true; btn.textContent = t("확인 중…");
  let r = null;
  try {
    const res = await fetchT("api/lodging-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, nights: state.input.days - 1, date: state.input.date, lang: getLang() }) }, 20000);
    if (res.ok) r = await res.json();
  } catch {}
  if (!r) r = checkLodgingLocal(text);
  btn.disabled = false; btn.textContent = t("확인");
  const level = { low: t("안심"), mid: t("주의"), high: t("위험") };
  $("#safeResult").innerHTML = `
    <p class="safe-sum">${esc(r.summary)}</p>
    <ul>
      <li><b class="lv ${r.cancel.risk}">${level[r.cancel.risk]}</b> ${t("취소·환불: ")}${esc(r.cancel.plain)}</li>
      <li><b class="lv ${r.price.risk}">${level[r.price.risk]}</b> ${t("가격: ")}${esc(r.price.plain)}</li>
      ${r.reviews.map((v) => `<li><b class="lv ${v.risk}">${level[v.risk]}</b> ${t("후기: ")}${esc(v.plain)}</li>`).join("")}
    </ul>
    ${r.ask.length ? `<p class="safe-ask">${t("예약 전에 물어볼 것: ")}${r.ask.map(esc).join(" · ")}</p>` : ""}`;
});
function lodgingHTML(day) {
  if (!trip.lodging || day.dayIdx >= state.input.days - 1) return "";
  return `<li class="leg home">${t("숙소({name})로 · 약 {km}km", { name: esc(lodgingName(trip.lodging)), km: day.toLodgingKm ?? "-" })}</li>`;
}

/* ---------- 혜택 내비 + 증빙 보관함 ---------- */
const proofKey = () => `proofs:${state.input.region}:${state.input.date}`;
const loadProofs = () => store.get(proofKey()) || {};
function renderBenefits() {
  const list = benefitsFor(trip, state.input).filter((b) => b.status !== "closed");
  const box = $("#benefits");
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  const proofs = loadProofs();
  const total = list.filter((b) => b.kind === "place").reduce((a, b) => a + b.amount, 0);
  const badge = { auto: t("일정에 포함 · 현장에서 받기"), check: t("하반기 공고 확인 필요") };
  box.innerHTML = `
    <h3>${t("이 일정으로 받는 혜택")}${total ? ` <span class="sum">${t("현장 환급 {n}원", { n: total.toLocaleString() })}</span>` : ""}</h3>
    <ul class="benefit-list">${list.map((b) => {
      const need = b.proofs || [];
      const have = need.filter((p) => (proofs[b.id + ":" + p] || []).length).length;
      return `<li>
        <div class="b-head"><b>${benefitText(b, "title")}</b><span class="b-badge ${b.status}">${b.status === "open" ? t("신청 가능 · {d} 마감", { d: b.end.slice(5).replace("-", ".") }) : badge[b.status]}</span></div>
        <p>${benefitText(b, "how")}</p>
        ${b.steps ? `<p class="b-steps">${benefitText(b, "steps").map((x, i) => `${i + 1}. ${x}`).join("  ")}</p>` : ""}
        ${b.note ? `<p class="b-note">${benefitText(b, "note")}</p>` : ""}
        ${need.length ? `<div class="proofs"><span>${t("증빙 {a}/{b}", { a: have, b: need.length })}</span>${need.map((p) => {
          const n = (proofs[b.id + ":" + p] || []).length;
          return `<label class="proof ${n ? "ok" : ""}">${n ? "✓ " : "+ "}${t(p)}${n > 1 ? t(" {n}장", { n }) : ""}<input type="file" accept="image/*" capture="environment" data-proof="${b.id}:${p}" hidden></label>`;
        }).join("")}</div>` : ""}
      </li>`;
    }).join("")}</ul>
    ${Object.values(proofs).some((a) => a.length) ? `<details class="proof-box"><summary>${t("증빙 보관함 보기")}</summary><div class="proof-grid">${Object.entries(proofs).flatMap(([k, arr]) => arr.map((src, i) => `<figure><img src="${src}" alt=""><figcaption>${t(k.split(":").slice(1).join(":"))}</figcaption><button type="button" data-del="${k}|${i}">${t("삭제")}</button></figure>`)).join("")}</div></details>` : ""}`;
}
// 영수증 사진은 줄여서 이 기기에만 저장
function shrink(file, max = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
$("#benefits").addEventListener("change", async (e) => {
  const key = e.target.dataset.proof; if (!key || !e.target.files[0]) return;
  try {
    const src = await shrink(e.target.files[0], 900);
    const all = loadProofs();
    (all[key] ||= []).push(src);
    toast(store.set(proofKey(), all) ? t("증빙을 보관함에 넣었어요") : t("저장 공간이 부족해요. 사진을 몇 장 지워주세요"));
  } catch { toast(t("사진을 읽지 못했어요")); }
  renderBenefits();
});
$("#benefits").addEventListener("click", (e) => {
  const d = e.target.dataset.del; if (!d) return;
  const [key, i] = d.split("|");
  const all = loadProofs(); all[key].splice(Number(i), 1); store.set(proofKey(), all);
  renderBenefits();
});

/* ---------- 1박 전환 · 밤 코스 ---------- */
let overnightCache = null;
function renderOvernight() {
  const box = $("#overnight");
  if (state.input.days !== 1) { box.hidden = true; return; }
  const key = JSON.stringify([state.input, state.opts.pace, state.opts.lessWalk, state.opts.indoor, state.opts.exclude]);
  if (overnightCache?.key !== key) overnightCache = { key, c: overnightCompare(state.input, state.opts) };
  const c = overnightCache.c;
  if (!c || !c.added.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <h3>${t("하룻밤 더하면")}</h3>
    <div class="cmp">
      <div><span>${t("볼 수 있는 곳")}</span><b>${t("+{n}곳", { n: c.added.length })}</b></div>
      <div><span>${t("밤 코스")}</span><b>${c.endAfter > c.endBefore ? t("{t}까지", { t: fmt(c.endAfter) }) : t("없음")}</b></div>
      <div><span>${t("숙소")}</span><b>${esc(lodgingName(c.lodging))}</b></div>
    </div>
    ${c.endAfter > c.endBefore && c.evening.length ? `<p class="night">${t("밤 코스: ")}${c.evening.filter((e) => e.start >= c.endBefore - 60).map((e) => `${fmt(e.start)} ${esc(nameOf(e.id, e.name))}`).join(" → ")}</p>` : ""}
    <p class="more">${t("둘째 날: ")}${c.trip.days[1].items.map((i) => esc(placeName(i.place))).join(", ")}</p>
    ${c.festivals.length ? `<p class="night">${t("다음 날 축제: ")}${c.festivals.map((f) => esc(placeName(f))).join(", ")}</p>` : ""}
    ${c.benefits.length ? `<p class="more">${t("받을 수 있는 혜택: ")}${c.benefits.map((b) => benefitText(b, "title")).join(", ")}</p>` : ""}
    <p class="more">${t("추가 비용: 숙박비({type})와 식사 2끼 · 숙박비는 날짜마다 달라 검색으로 확인하세요", { type: typeLabel(c.lodging.type, c.lodging.typeLabel) })}</p>
    <button type="button" class="primary" id="toOvernight">${t("1박 2일로 바꾸기")}</button>`;
}
document.addEventListener("click", (e) => {
  if (e.target.id !== "toOvernight") return;
  state.input = { ...state.input, days: 2 };
  delete state.opts.lodgingId;
  dayIdx = 0;
  rebuild();
  window.scrollTo({ top: 0, behavior: "smooth" });
  toast(t("1박 2일로 바꿨어요"));
});

/* ---------- 사장님이 등록한 가게 (다국어 메뉴) ---------- */
let shopsCache = {};
async function renderShops() {
  const region = state.input.region, box = $("#shops");
  if (!(region in shopsCache)) {
    try { const r = await fetchT(`api/shops?region=${region}`, {}, 3000); shopsCache[region] = r.ok ? await r.json() : []; }
    catch { shopsCache[region] = []; }
  }
  const list = shopsCache[region];
  if (!list.length || state.input.region !== region) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h3>${t("사장님이 직접 등록한 가게")}</h3><ul>${list.slice(0, 6).map((x) => `
    <li><b>${esc(x.name)}</b><span>${esc(x.hours || x.address || "")}</span><a class="ghost small" href="menu.html?id=${x.id}" target="_blank" rel="noopener">${t("메뉴 {n}개 · 4개 언어", { n: x.count })}</a></li>`).join("")}</ul>`;
}

/* ---------- 특산물 재주문 ---------- */
function renderSouvenirs() {
  const list = souvenirsFor(trip);
  const box = $("#souvenirs");
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  // 다음에 앱을 열었을 때 보여주려고 기억
  const past = store.get("pastTrips") || [];
  const id = `${state.input.region}:${state.input.date}`;
  const entry = { id, date: state.input.date, region: REGIONS[state.input.region].label, items: list };
  store.set("pastTrips", [entry, ...past.filter((p) => p.id !== id)].slice(0, 5));
  box.innerHTML = `
    <h3>${t("집에서 다시 맛보기")}</h3>
    <ul>${list.map((s) => `<li><b>${s.item}</b><span>${t("{from}에서", { from: esc(nameOf(null, s.from)) })}</span><button type="button" class="ghost small" data-copy="${s.item}">${t("검색어 복사")}</button></li>`).join("")}</ul>
    <a class="ghost small" href="${SHOP_MALL.url}" target="_blank" rel="noopener">${t("{mall}(강원도 공식 쇼핑몰)에서 주문하기", { mall: SHOP_MALL.name })}</a>`;
}
document.addEventListener("click", async (e) => {
  const text = e.target.dataset.copy; if (!text) return;
  try { await navigator.clipboard.writeText(text); toast(t("\"{t}\" 복사했어요", { t: text })); } catch { toast(text); }
});
function renderPast() {
  const past = (store.get("pastTrips") || []).filter((p) => p.date < todayStr());
  const box = $("#past");
  if (!past.length) { box.hidden = true; return; }
  const p = past[0];
  box.hidden = false;
  const regionKey = p.id.split(":")[0];
  box.innerHTML = `<b>${t("지난 {region} 여행에서 먹은 {items}", { region: regionLabel(regionKey, p.region), items: p.items.slice(0, 2).map((i) => i.item).join(", ") })}</b>
    <a class="ghost small" href="${SHOP_MALL.url}" target="_blank" rel="noopener">${t("집에서 다시 주문")}</a>`;
}

/* ---------- 지도 ---------- */
// 지도 라이브러리는 일정 화면을 처음 열 때 받는다 (첫 화면을 가볍게)
let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return (leafletLoading ??= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "vendor/leaflet/leaflet.css";
    document.head.append(css);
    const js = document.createElement("script");
    js.src = "vendor/leaflet/leaflet.js";
    js.onload = resolve; js.onerror = () => { leafletLoading = null; reject(); };
    document.head.append(js);
  }));
}
function drawMap(day) {
  if (!window.L) {
    loadLeaflet().then(() => { if (trip && !$("#result").hidden) drawMap(trip.days[dayIdx]); }).catch(() => {});
    return;
  }
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
  const startLabel = t(day.start.name.startsWith("숙소") ? "숙" : "출");
  L.marker([day.start.lat, day.start.lng], { icon: L.divIcon({ className: "pin base", html: `<span>${startLabel}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(layer).bindTooltip(esc(startName(day.start, trip.lodging)));
  const L0 = trip.lodging;
  if (L0 && !day.start.name.startsWith("숙소")) L.marker([L0.lat, L0.lng], { icon: L.divIcon({ className: "pin base", html: `<span>${t("숙")}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(layer).bindTooltip(t("숙소 · {name}", { name: esc(lodgingName(L0)) }));
  day.items.forEach((it, i) => {
    const icon = L.divIcon({ className: "pin", html: `<span style="--c:${CAT[it.place.cat].color}">${i + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    L.marker([it.place.lat, it.place.lng], { icon }).addTo(layer).bindTooltip(`${fmt(it.start)} ${esc(placeName(it.place))}`);
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
      b.type = "button"; b.title = t("내 위치"); b.setAttribute("aria-label", t("내 위치"));
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
      L.DomEvent.on(b, "click", (e) => {
        L.DomEvent.stop(e);
        if (!navigator.geolocation) return toast(t("위치를 사용할 수 없어요"));
        navigator.geolocation.getCurrentPosition((pos) => {
          const ll = [pos.coords.latitude, pos.coords.longitude];
          if (meMarker) meMarker.remove();
          meMarker = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(map);
          map.setView(ll, 14);
        }, () => toast(t("위치 권한을 허용해 주세요")), { enableHighAccuracy: true, timeout: 8000 });
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
  toast(now ? t("{name}(으)로 바꿨어요", { name: placeName(now.place) }) : t("대신 갈 수 있는 곳이 없어 뺐어요"));
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
async function askGuide(question, shown = question) {
  bubble("me", shown);
  const wait = bubble("ai pending", t("생각 중"));
  let r = null;
  try {
    const res = await fetchT("api/guide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, history: guideHistory, trip: compactTrip(), lang: getLang() }) }, 20000);
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
    const missed = (r.add || []).filter((id) => !placed.has(id)).map((id) => (placeById(id) ? placeName(placeById(id)) : id));
    note = missed.length ? t(" ({names}은(는) 영업시간·휴무가 맞지 않아 넣지 못했어요)", { names: missed.join(", ") }) : t(" 영업시간을 다시 확인해 일정에 반영했어요.");
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
  // 추천 질문은 화면 언어로 보여 주고, 보내는 문장은 한국어 원문 (AI 미연결 간단 모드도 알아듣게)
  const b = e.target.closest("button"); if (b) askGuide(b.dataset.ko || b.textContent.trim(), b.textContent.trim());
});

/* ---------- AI로 한 줄 시작 ---------- */
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
$("#aiStart").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#aiStartInput").value.trim(); if (!text) return;
  const btn = $("#aiStart button"); btn.disabled = true; btn.textContent = "…";
  let r = null;
  try {
    const res = await fetchT("api/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, today: todayStr(), lang: getLang() }) }, 12000);
    if (res.ok) r = await res.json();
  } catch {}
  if (!r) { r = startLocal(text, todayStr()); notifyNoAI(); }
  btn.disabled = false; btn.textContent = t("만들기");
  fillForm({ ...r, days: Number(r.days) });
  $("#form").requestSubmit();
  if (r.summary) toast(r.summary);
});

/* ---------- 공유 / 캘린더 ---------- */
$("#shareBtn").addEventListener("click", async () => {
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: t("강원 여행 일정"), url });
    else { await navigator.clipboard.writeText(url); toast(t("링크를 복사했어요")); }
  } catch {}
});

// 캘린더 파일 규칙: 쉼표·세미콜론·역슬래시는 앞에 역슬래시
const icsText = (t) => String(t).replace(/[\\;,]/g, (c) => "\\" + c);
$("#icsBtn").addEventListener("click", () => {
  const stamp = (ds, min) => ds.replace(/-/g, "") + "T" + fmt(min).replace(":", "") + "00";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ohneul-gangneung//KO", "CALSCALE:GREGORIAN"];
  trip.days.forEach((d) => d.items.forEach((it, i) => {
    lines.push("BEGIN:VEVENT",
      `UID:${d.date}-${i}-${it.id}@ohneul-gangneung`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;TZID=Asia/Seoul:${stamp(d.date, it.start)}`,
      `DTEND;TZID=Asia/Seoul:${stamp(d.date, it.end)}`,
      `SUMMARY:${icsText(placeName(it.place))}`,
      `LOCATION:${icsText(it.place.name)}`,
      `GEO:${it.place.lat};${it.place.lng}`,
      "END:VEVENT");
  }));
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${isEN() ? "gangwon-trip" : "강원여행"}_${state.input.date}.ics`; a.click();
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
let restoredFromLink = false;
let noAINotified = false;
function notifyNoAI() {
  if (noAINotified) return;
  noAINotified = true;
  setTimeout(() => toast(t("AI에 연결되지 않아 간단 모드로 처리했어요")), 2400);
}

// 오프라인 표시
function updateOnline() { document.body.classList.toggle("offline", !navigator.onLine); }
addEventListener("online", updateOnline); addEventListener("offline", updateOnline); updateOnline();

/* ---------- 언어 전환 (한국어 / EN) ---------- */
async function switchLang(l) {
  setLang(l);
  if (isEN()) await loadDataEn((u) => fetchT(u, {}, 4000));
  applyStatic();
  heroCaption();
  if (trip && !$("#result").hidden) render();
  renderPast();
}
document.querySelector(".lang").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lang]");
  if (b && b.dataset.lang !== getLang()) switchLang(b.dataset.lang);
});
applyStatic();
if (isEN()) await loadDataEn((u) => fetchT(u, {}, 4000)); // 영문 장소 이름을 먼저 받아 첫 화면부터 영어로

(function boot() {
  const fromHash = location.hash.length > 1 ? decodeState(location.hash.slice(1)) : null;
  const saved = fromHash || null;
  if (saved && saved.input && PLACES.length) {
    restoredFromLink = true;
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

renderPast();

// 서버 없이 파일만 올린 주소(GitHub Pages 등)에서는 가게 등록이 안 되므로 링크를 숨긴다
fetchT("api/shops?region=gangneung", {}, 3000)
  .then((r) => { if (!r.ok) $("#ownerLink").hidden = true; })
  .catch(() => { $("#ownerLink").hidden = true; });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
