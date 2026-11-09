import { recommendBooking, bookingPeople, bookingScope } from "./booking-links.js";
import { planTrip, swapItem, addPlacesToDay, drives, fmt, addDays, parseRequestLocally, hoursFor, retimeDay, summarize, festivalsDuring, baseOf, benefitsFor, overnightCompare, souvenirsFor, lodgingForDay, routeOf, regionForDay, setCrowd, crowdOn, crowdedOn, planOptions, planStats } from "./planner.js";
import { PLACES, REGIONS, SHOP_MALL, LODGING, BENEFITS } from "./data.js";
import { estimateTrip, taxiFare, defaultPeople, TAXI, FUEL, BUS, ASSUME } from "./costs.js";
import { ORIGINS } from "./origins.js";
import { sunTimes } from "./sun.js";
import { alertsFor as weatherAlertsFor, kmaAlertsFor, OFFICIAL_CHECKS } from "./alerts.js";
import { todayStatus, kstNow } from "./today.js";
import { toPlannerPlace } from "./directory-place.js";
import { bestArrival, hasRoute, returnTrips } from "./transit.js";
import { t, souvenirName, isEN, isForeign, getLang, namesEn, setLang, applyStatic, loadDataEn, loadLang, placeName, placeDesc, dateLabel, minutesLabel, monthsLabel, regionLabel, areaName, lodgingName, lodgingDesc, typeLabel, typeLabelFromKo, lodgingReason, benefitText, startName } from "./i18n.js";
// 무료 간단 모드(가이드·한 줄 시작·숙소 체크)와 그 지식은 첫 화면 뒤에 받는다 (첫 화면을 가볍게)
const localAI = () => import("./ai-local.js");

const $ = (s) => document.querySelector(s);
// 응답이 늦으면 기다리지 않고 포기 (화면이 멈춰 보이지 않게)
function fetchT(url, opts = {}, ms = 5000) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(timer));
}
// 사용 집계: 앱 서버가 있을 때만, 기능 이름과 고정된 선택지만 보낸다 (입력 내용·위치·기기 정보 없음). 브라우저의 "추적 안 함"을 따른다
function track(event, value) {
  if (!document.body.classList.contains("has-server") || navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  fetch("api/stats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, value }), keepalive: true }).catch(() => {});
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
// 이동 편의(휠체어·유모차): 일정 엔진의 5가지 선택과 따로, 켜면 계단·긴 산길을 빼고 무장애 정보가 있는 곳을 먼저 넣는다
document.querySelector('.chips[data-name="access"]').addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (b) b.classList.toggle("on");
});
const accessNow = () => [...document.querySelectorAll('.chips[data-name="access"] .on')].map((b) => b.dataset.v);
document.querySelector('.chips[data-name="likes"]').addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (b) b.classList.toggle("on");
});
const segValue = (name) => document.querySelector(`.seg[data-name="${name}"] .on`)?.dataset.v;
// 이어서 갈 권역 (일정 엔진의 5가지 선택과 따로): 2일 이상일 때만 보이고, 고른 순서대로 최대 2곳(일수-1곳까지)
const routeBox = document.querySelector('.chips[data-name="route"]');
let routePicks = [];
function renderRouteRow() {
  const row = $("#routeRow"); if (!row) return;
  const days = Number(segValue("days")), first = segValue("region");
  row.hidden = days < 2;
  routePicks = routePicks.filter((r) => r !== first).slice(0, Math.max(0, Math.min(2, days - 1)));
  routeBox.querySelectorAll("button").forEach((b) => {
    const i = routePicks.indexOf(b.dataset.v);
    b.hidden = b.dataset.v === first;
    b.classList.toggle("on", i >= 0);
    b.setAttribute("aria-pressed", String(i >= 0));
    b.dataset.order = i >= 0 ? String(i + 2) : "";
  });
  $("#routeNote").textContent = routePicks.length ? t("{route} 순서로 이어서 가요 · 날짜는 앞 권역부터 고르게 나눠요", { route: [first, ...routePicks].map((r) => regionLabel(r, REGIONS[r].label)).join(" → ") }) : t("고르지 않으면 한 권역에서만 다녀요");
}
routeBox?.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const v = b.dataset.v, days = Number(segValue("days"));
  if (routePicks.includes(v)) routePicks = routePicks.filter((x) => x !== v);
  else if (routePicks.length < Math.min(2, days - 1)) routePicks.push(v);
  else return toast(t("{n}일 일정에는 이어서 갈 권역을 {k}곳까지 고를 수 있어요", { n: days, k: Math.min(2, days - 1) }));
  renderRouteRow();
});
document.querySelectorAll('.seg[data-name="region"], .seg[data-name="days"]').forEach((el) => el.addEventListener("click", () => setTimeout(renderRouteRow, 0)));
const routeNow = (input) => (input.days >= 2 && routePicks.length ? [input.region, ...routePicks] : null);
renderRouteRow();

$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = {
    region: segValue("region"),
    date: $("#date").value || tomorrow(),
    days: Number(segValue("days")),
    who: segValue("who"),
    likes: [...document.querySelectorAll('.chips[data-name="likes"] .on')].map((b) => b.dataset.v),
    move: segValue("move"),
  };
  const route = routeNow(input);
  if (route) input.route = route;
  const lessWalk = input.who === "parents";
  const access = accessNow();
  const v = pendingVoice; pendingVoice = null;
  state = { input, opts: { pace: v?.pace || "normal", lessWalk: lessWalk || access.length > 0 || !!v?.lessWalk, prefer: [], avoid: [], exclude: [], rainDays: [], ...(access.length ? { access } : {}), ...(v?.people ? { people: bookingPeople(v.people) } : {}), ...startOpts(input) } };
  if (v) { state.heard = v.heard; state.said = v.said; }
  state.baseOpts = { ...state.opts }; // 일정 3개 비교의 기준 조건
  state.choice = "best";
  restoredFromLink = false;
  dayIdx = 0;
  await thinkThrough(input, state.opts, !!v);
  rebuild();
  show("result");
  $("#thinking").hidden = true;
  loadWeather();
  track("plan"); track("plan_region", input.region); track("plan_days", String(input.days)); track("plan_move", input.move); track("plan_who", input.who);
  if (state.opts.start) track("start_custom");
});

/* ---------- 일정을 짜는 과정 ----------
   엔진은 순식간에 끝나지만, 무엇을 따져 골랐는지가 보이도록 실제 단계와 숫자를 차례로 보여 준다
   (후보 수·그날 문 연 곳·붐빔으로 미룬 곳·축제·충돌 0건·3개 비교). 꾸민 숫자는 없다 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let optionsCache = { key: "", list: null };
function optionsFor(input, base) {
  const key = JSON.stringify([input, base]);
  if (optionsCache.key !== key) optionsCache = { key, list: planOptions(input, base) };
  return optionsCache.list;
}
async function thinkThrough(input, opts, voice) {
  const box = $("#thinking"), list = $("#thinkSteps");
  // 누르자마자 화면부터 보여 주고(느린 폰에서 멈춘 것처럼 보이지 않게), 다음 화면 그리기 뒤에 계산한다
  $("#thinkTitle").textContent = t("여행 일정을 짜고 있어요");
  list.innerHTML = "";
  box.hidden = false;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const stats = planStats(input, opts);
  const opt = optionsFor(input, state.baseOpts);
  const best = opt[0];
  const steps = [
    voice ? t("말씀을 알아들었어요: {what}", { what: (state.heard || []).filter((h) => ["region", "days", "who"].includes(h.key)).map(heardLabel).join(" · ") }) : t("고른 조건을 확인했어요"),
    t("강원 장소 {n}곳 중 여행 날짜에 문 여는 {open}곳을 골랐어요", { n: stats.candidates, open: stats.open }) + (stats.closed ? t(" · 쉬는 날 {c}곳 제외", { c: stats.closed }) : ""),
    ...(stats.crowded ? [t("붐빔 예상 {c}곳은 뒤로 미뤘어요 (관광공사 혼잡 예측)", { c: stats.crowded })] : []),
    ...(stats.festivals.length ? [t("여행 기간 축제도 살폈어요: {f}", { f: stats.festivals.slice(0, 2).map((f) => placeName(f)).join(", ") })] : []),
    t("이동 시간과 운영시간을 맞춰 동선을 짰어요 · 영업시간 충돌 {c}건", { c: best.totals.conflicts }),
    t("성격이 다른 일정 3개를 비교했어요"),
  ];
  list.innerHTML = steps.map((x) => `<li>${esc(x)}</li>`).join("");
  const items = [...list.children], gap = reduceMotion() ? 100 : 300;
  for (let i = 0; i < items.length; i++) {
    items[i].classList.add("show");
    await sleep(gap);
    items[i].classList.add("done");
  }
  await sleep(reduceMotion() ? 50 : 150);
}

// 반값여행(지역사랑 휴가지원) 대상 시군 장소가 일정에 있는지
const HALF = BENEFITS.find((b) => b.id === "b-halfprice");
const halfPriceIn = (tr) => { const ids = new Set(HALF?.placeIds || []); return tr.days.some((d) => d.items.some((it) => ids.has(it.id))); };
// 일정 3개 비교 카드
const OPT_NAME = { best: "추천", relaxed: "여유롭게", packed: "알차게", different: "색다른 코스" };
const OPT_SUB = { best: "가장 균형 잡힌 동선", relaxed: "장소를 줄이고 덜 걷고 덜 이동", packed: "하루에 더 많이 보기", different: "추천 일정에 없는 곳 위주" };
function whyText() {
  const s = planStats(state.input, state.baseOpts), inp = state.input, acc = state.baseOpts.access || [];
  const parts = [t("후보 {n}곳 중 여행 날짜에 문 여는 {open}곳에서 골랐어요.", { n: s.candidates, open: s.open })];
  if (s.crowded) parts.push(t("붐빔 예상 {c}곳은 뒤로 미뤘어요.", { c: s.crowded }));
  if (acc.length) parts.push(t("휠체어·유모차로 다니기 쉬운 곳을 먼저 넣었어요."));
  else if (inp.who === "parents") parts.push(t("부모님과 함께라 걷기를 줄였어요."));
  else if (inp.who === "family") parts.push(t("아이와 함께라 오래 걷는 산길은 줄였어요."));
  else if (inp.who === "pet") parts.push(t("반려동물 동반이 확인된 곳을 먼저 넣었어요."));
  if (inp.move === "transit") parts.push(t("기차·버스 시간표와 걷는 거리에 맞췄어요."));
  if (s.festivals.length) parts.push(t("여행 기간 축제({f})도 살폈어요.", { f: s.festivals.slice(0, 2).map((f) => placeName(f)).join(", ") }));
  return parts.join(" ");
}
function renderOptions() {
  const box = $("#options"); if (!box) return;
  if (!state.baseOpts) { box.hidden = true; return; }
  const list = optionsFor(state.input, state.baseOpts);
  box.hidden = false;
  box.innerHTML = `<h3>${t("일정 3개 중에서 고르세요")}</h3><p class="why">${esc(whyText())}</p>
    <div class="opt-list">${list.map((o) => `<button type="button" class="opt${state.choice === o.key ? " on" : ""}" data-opt="${o.key}">
      <b>${t(OPT_NAME[o.key])}</b><span class="opt-sub">${t(OPT_SUB[o.key])}</span>
      <span class="opt-stats">${t("{n}곳 · 이동 {m} · 걷기 {km}km", { n: o.places, m: minutesLabel(o.totals.moveMin), km: o.totals.walkKm })}</span>
      <span class="opt-hl">${o.highlights.map((n) => esc(placeName(PLACES.find((p) => p.name === n) || { name: n }))).join(" · ")}</span>
      ${halfPriceIn(o.trip) ? `<span class="opt-half">${t("💰 반값여행 대상 지역 포함")}</span>` : ""}
      <span class="opt-pick">${state.choice === o.key ? t("지금 보는 일정") : t("이 일정으로")}</span></button>`).join("")}</div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-opt]"); if (!b || !state?.baseOpts) return;
  const o = optionsFor(state.input, state.baseOpts).find((x) => x.key === b.dataset.opt);
  if (!o || state.choice === o.key) return;
  state.choice = o.key;
  state.opts = { ...o.opts, rainDays: state.baseOpts.rainDays };
  if (o.key !== "different") delete state.opts.lodgingId;
  dayIdx = 0;
  track("plan_option", o.key);
  rebuild();
  toast(t("{name} 일정으로 바꿨어요", { name: t(OPT_NAME[o.key]) }));
});

/* ---------- 일정 저장·비교 (이 기기에만, 최대 20개) ---------- */
const savedTrips = () => (store.get("savedTrips") || []).filter((x) => x?.snap?.input && x.meta);
function tripSummary() {
  let cost = null;
  try { const c = estimateTrip(trip, state.input, peopleNow(), feesData || {}, []); cost = c?.total || null; } catch { /* 비용 계산 전 */ }
  return { places: trip.totals.places, moveMin: trip.totals.moveMin, walkKm: trip.totals.walkKm, cost, stops: trip.days.flatMap((d) => d.items.filter((i) => i.kind === "visit").map((i) => i.place.name)).slice(0, 4) };
}
$("#saveTripBtn").addEventListener("click", () => {
  const list = savedTrips();
  const meta = { date: state.input.date, regions: state.input.route || [state.input.region], days: state.input.days, choice: state.choice || "best" };
  const entry = { id: Date.now().toString(36), meta, savedAt: Date.now(), snap: snapshot(), extra: { baseOpts: state.baseOpts, choice: state.choice, heard: state.heard, said: state.said }, sum: tripSummary() };
  if (!store.set("savedTrips", [entry, ...list].slice(0, 20))) return toast(t("저장 공간이 부족해요 · 저장한 일정을 지워 주세요"));
  track("trip_save");
  toast(t("이 기기에 저장했어요 · 첫 화면 '저장한 일정'에서 열 수 있어요"));
  renderSaved();
});
let comparePick = new Set();
// 저장한 일정 이름은 화면 언어로 그때그때 만든다 (예: "11월 14일 (토) · 춘천·철원 → 속초·양양 · 2박 3일 · 여유롭게")
const savedName = (x) => [dateLabel(x.meta.date), x.meta.regions.map((r) => regionLabel(r, REGIONS[r].label)).join(" → "), t(DAYS_KO[x.meta.days]), x.meta.choice !== "best" ? t(OPT_NAME[x.meta.choice]) : ""].filter(Boolean).join(" · ");
function renderSaved() {
  const box = $("#saved"); if (!box) return;
  const list = savedTrips();
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  const won = (n) => `${Math.round(n / 10000)}${t("만 원")}`;
  box.innerHTML = `<h3>${t("저장한 일정")}</h3><ul class="saved-list">${list.map((x) => `<li>
      <label class="pick"><input type="checkbox" data-cmp="${x.id}" ${comparePick.has(x.id) ? "checked" : ""}></label>
      <div><b>${esc(savedName(x))}</b><span>${t("{n}곳 · 이동 {m}", { n: x.sum.places, m: minutesLabel(x.sum.moveMin) })}${x.sum.cost ? ` · ${won(x.sum.cost.low)}~${won(x.sum.cost.high)}` : ""}</span></div>
      <button class="ghost small" type="button" data-open-saved="${x.id}">${t("열기")}</button><button class="ghost small icon" type="button" data-del-saved="${x.id}" aria-label="${t("삭제")}" title="${t("삭제")}">✕</button>
    </li>`).join("")}</ul>
    ${list.length > 1 ? `<button class="ghost small" type="button" id="compareBtn" ${comparePick.size >= 2 ? "" : "disabled"}>${t("고른 일정 비교 ({n})", { n: comparePick.size })}</button>` : ""}
    <div id="compareBox"></div>`;
}
document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-open-saved]");
  if (o) { const x = savedTrips().find((y) => y.id === o.dataset.openSaved); if (x) { openSnapshot(x.snap, x.extra || {}); track("trip_open_saved"); } return; }
  const d = e.target.closest("[data-del-saved]");
  if (d) { store.set("savedTrips", savedTrips().filter((y) => y.id !== d.dataset.delSaved)); comparePick.delete(d.dataset.delSaved); renderSaved(); return; }
  if (e.target.id === "compareBtn") {
    const rows = savedTrips().filter((x) => comparePick.has(x.id));
    const won = (n) => `${Math.round(n / 10000)}${t("만 원")}`;
    const best = (f, low = true) => { const v = rows.map(f); const m = low ? Math.min(...v) : Math.max(...v); return (x) => (f(x) === m ? " class=\"best\"" : ""); };
    const bm = best((x) => x.sum.moveMin), bw = best((x) => x.sum.walkKm), bp = best((x) => x.sum.places, false), bc = best((x) => x.sum.cost?.low ?? 1e12);
    $("#compareBox").innerHTML = `<div class="cmp-wrap"><table class="cmp"><thead><tr><th></th>${rows.map((x) => `<th>${esc(savedName(x))}</th>`).join("")}</tr></thead><tbody>
      <tr><th>${t("장소")}</th>${rows.map((x) => `<td${bp(x)}>${x.sum.places}</td>`).join("")}</tr>
      <tr><th>${t("이동")}</th>${rows.map((x) => `<td${bm(x)}>${minutesLabel(x.sum.moveMin)}</td>`).join("")}</tr>
      <tr><th>${t("걷기")}</th>${rows.map((x) => `<td${bw(x)}>${x.sum.walkKm}km</td>`).join("")}</tr>
      <tr><th>${t("예상 비용")}</th>${rows.map((x) => `<td${bc(x)}>${x.sum.cost ? `${won(x.sum.cost.low)}~${won(x.sum.cost.high)}` : "-"}</td>`).join("")}</tr>
      <tr><th>${t("주요 장소")}</th>${rows.map((x) => `<td>${x.sum.stops.map((n) => esc(placeName(PLACES.find((p) => p.name === n) || { name: n }))).join(", ")}</td>`).join("")}</tr>
    </tbody></table></div>`;
    track("trip_compare");
  }
});
document.addEventListener("change", (e) => {
  const c = e.target.closest("[data-cmp]"); if (!c) return;
  if (c.checked) { if (comparePick.size >= 3) { c.checked = false; return toast(t("한 번에 3개까지 비교할 수 있어요")); } comparePick.add(c.dataset.cmp); } else comparePick.delete(c.dataset.cmp);
  const b = $("#compareBtn"); if (b) { b.disabled = comparePick.size < 2; b.textContent = t("고른 일정 비교 ({n})", { n: comparePick.size }); }
});

/* ---------- 장소 정보 오류 제보 ----------
   앱 서버가 있으면 서버(api/place-reports)로, 없으면(GitHub Pages·APK) 공개 저장소의 GitHub 이슈 작성 화면을 미리 채워 연다 */
const REPORT_KIND = { closed: "문을 닫았어요 (폐업·휴업)", hours: "운영시간·쉬는 날이 달라요", parking: "주차 정보가 달라요", location: "위치가 달라요", other: "기타" };
const reported = () => new Set(store.get("reportedPlaces") || []);
let reportPlace = null;
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-report]"); if (!b) return;
  reportPlace = PLACES.find((p) => p.id === b.dataset.report); if (!reportPlace) return;
  $("#reportTitle").textContent = t("{name} 정보가 달라요", { name: placeName(reportPlace) });
  $("#reportForm").reset();
  $("#reportDlg").showModal?.() ?? $("#reportDlg").setAttribute("open", "");
});
$("#reportCancel").addEventListener("click", () => $("#reportDlg").close());
$("#reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), kind = f.get("kind"), note = String(f.get("note") || "").trim();
  if (!reportPlace || !kind) return;
  const p = reportPlace;
  let sent = false;
  if (document.body.classList.contains("has-server")) {
    try { const r = await fetchT("api/place-reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ place: p.id, kind, note }) }, 5000); sent = r.ok; } catch { sent = false; }
  }
  if (!sent) {
    const title = `[장소 제보] ${p.name} (${p.id}) · ${REPORT_KIND[kind]}`;
    const body = [`장소: ${p.name} (${p.id})`, `종류: ${REPORT_KIND[kind]}`, `내용: ${note || "-"}`, `여행 날짜: ${state?.input?.date || "-"}`, "", "(오늘강원 앱의 '정보가 달라요'에서 보냄)"].join("\n");
    window.open(`https://github.com/hundol047/MY-AI-LAB/issues/new?labels=place-report&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
  }
  store.set("reportedPlaces", [...new Set([...reported(), p.id])].slice(-200));
  $("#reportDlg").close();
  track("place_report", kind);
  toast(sent ? t("고마워요! 제보를 받았어요") : t("제보 작성 화면을 열었어요 · 보내기를 눌러 주세요"));
  if (trip && !$("#result").hidden) render();
});

/* ---------- 출발지 (이 기기에 저장) ----------
   첫날은 고른 출발지에서 출발한다. 없으면 권역 기준점(역·터미널). 출발 시각 자동: 가까우면 10시, 60km 넘으면 8시 */
const distKm = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const savedStart = () => { const s = store.get("startPoint"); return s && Number.isFinite(s.lat) && Number.isFinite(s.lng) ? s : null; };
function startOpts(input) {
  const s = savedStart(), base = REGIONS[input.region].base;
  const time = store.get("startTime") || (s && distKm(s, base) * 1.35 > 60 ? "08:00" : "");
  // 대중교통으로 서울 쪽 역·터미널에서 출발하면 실제 시간표(transit.json)에서 가장 일찍 도착하는 편을 골라, 도착 15분 뒤 기준점에서 첫날을 시작한다
  const hub = input.move === "transit" && transitHub(s);
  if (hub && transitData && hasRoute(transitData, hub, input.region)) {
    // 출발 시각을 직접 정하지 않았으면 첫차부터 고른다 (먼 출발지의 기본값 08:00 때문에 07:50 열차를 놓치지 않게)
    const [h, m] = (store.get("startTime") || "05:00").split(":").map(Number);
    const best = bestArrival(transitData, hub, input.region, input.date, h * 60 + m);
    // 18시 넘어 도착하면 첫날 일정을 짤 수 없어 시간표를 쓰지 않는다 (카드에서 안내)
    if (best && best.arrMin + 15 <= 18 * 60) {
      const begin = Math.ceil((best.arrMin + 15) / 5) * 5;
      return { start: { name: best.hub, lat: base.lat, lng: base.lng }, startTime: fmt(begin), arrival: { mode: best.mode, grade: best.grade, from: hub, hub: best.hub, dep: best.dep, arr: best.arr, fare: best.fare, refDate: best.refDate } };
    }
  }
  return { ...(s ? { start: { name: s.name, ...(s.nameEn ? { nameEn: s.nameEn } : {}), lat: s.lat, lng: s.lng } } : {}), ...(time ? { startTime: time } : {}) };
}
// 시간표가 있는 서울 쪽 출발지 (origins.js 이름과 같음)
const TRANSIT_HUBS = ["서울역", "청량리역", "상봉역", "동서울종합터미널", "서울고속버스터미널", "부전역", "동대구역", "인천국제공항", "김포국제공항", "부산동부터미널", "대전복합터미널"];
function transitHub(s) {
  if (!s) return null;
  // 공항은 터미널이 넓어 3km 안이면 같은 곳으로 본다
  const o = ORIGINS.find((x) => TRANSIT_HUBS.includes(x.name) && (x.name === s.name || distKm(x, s) < (/공항/.test(x.name) ? 3 : 1.5)));
  return o ? o.name : null;
}
let transitData = null;
fetchT("transit.json", {}, 6000).then((r) => (r.ok ? r.json() : null)).then((j) => { transitData = j; if (trip && !$("#result").hidden) renderTransit(); }).catch(() => {});

/* ---------- 오가는 길 카드: 가는 편과 마지막 날 돌아오는 편 ---------- */
const MODE_NAME = { train: "기차", express: "고속버스", intercity: "시외버스" };
// 도착역·터미널 이름 (외국어 화면에서는 영어 + 한국어)
const HUB_EN = { 강릉: "Gangneung", 속초: "Sokcho", 춘천: "Chuncheon", 원주: "Wonju", 진부: "Jinbu" };
function hubLabel(name) {
  if (!isForeign()) return name;
  const m = name.match(/^(\S+?)(역| 고속버스터미널| 시외버스터미널)$/);
  if (!m || !HUB_EN[m[1]]) return name;
  const kind = { "역": "Station", " 고속버스터미널": "Express Bus Terminal", " 시외버스터미널": "Intercity Bus Terminal" }[m[2]];
  return `${HUB_EN[m[1]]} ${kind} (${name})`;
}
function renderTransit() {
  const box = $("#transit"); if (!box || !trip) return;
  const a = state.opts.arrival, hub = transitHub(savedStart());
  if (state.input.move !== "transit") { box.hidden = true; return; }
  const refLabel = (d) => d ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : "";
  const line = (x) => `<li><b>${esc(x.dep)}</b> → ${esc(x.arr)} · ${t(MODE_NAME[x.mode])} ${esc(x.grade || "")}${x.fare ? ` · ${won(x.fare)}` : ""}${x.last ? ` · <em>${t("막차")}</em>` : ""}</li>`;
  let html = `<h3>${t("오가는 길")}</h3>`;
  if (a) {
    html += `<p>${t("가는 편: {from} {dep} → {hub} {arr}", { from: esc(isForeign() ? (ORIGINS.find((o) => o.name === a.from)?.nameEn || a.from) : a.from), dep: a.dep, hub: esc(hubLabel(a.hub)), arr: a.arr })} · ${t(MODE_NAME[a.mode])} ${esc(a.grade || "")}${a.fare ? ` · ${won(a.fare)}` : ""}</p>`;
    const last = trip.days.at(-1), end = last.items.length ? last.items.at(-1).end + 30 : 17 * 60;
    const back = transitData ? returnTrips(transitData, a.from, regionForDay(state.input, state.input.days - 1), last.date, end) : [];
    html += back.length ? `<h4>${t("마지막 날 돌아오는 편 ({time} 이후)", { time: fmt(end) })}</h4><ul class="pet-list">${back.map(line).join("")}</ul>`
      : `<p class="sub warn">${t("마지막 일정 뒤에 돌아오는 편이 시간표에 없어요. 일정을 줄이거나 하루 더 머무세요.")}</p>`;
    html += `<p class="sub">${t("국토교통부 TAGO 시간표 기준 (기차 {t}, 버스 {b}). 예매·시간 변경은 코레일·버스 예매 사이트에서 확인하세요.", { t: refLabel(a.mode === "train" ? a.refDate : transitData?.trainDays?.[isWeekendDate(state.input.date) ? "weekend" : "weekday"]), b: refLabel(transitData?.busDate) })}</p>`;
  } else {
    html += `<p class="sub">${hub ? t("이 권역으로 가는 기차·버스 시간표가 없어 이동 시간을 거리로 추정했어요.") : t("출발지를 서울역·청량리역·상봉역·동서울·서울고속버스터미널, 부전역·동대구역, 인천·김포공항, 부산동부·대전복합터미널 중 하나로 정하면 실제 기차·버스 시간표로 첫날을 짜요.")}</p>`;
  }
  box.hidden = false;
  box.innerHTML = html;
}
const isWeekendDate = (d) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w === 0 || w === 6; };
function renderStartRow() {
  const s = savedStart(), region = segValue("region") || "gangneung";
  const base = REGIONS[region].base;
  $("#startLabel").textContent = s ? (isForeign() && s.nameEn ? s.nameEn : s.name) : t("{name} (기본)", { name: startName(base) });
  $("#startTime").value = store.get("startTime") || "";
  const recent = (store.get("startRecent") || []).filter((r) => !s || r.name !== s.name);
  renderStartResults($("#startSearch").value, recent);
}
function setStart(s) {
  if (s) {
    store.set("startPoint", s);
    store.set("startRecent", [s, ...(store.get("startRecent") || []).filter((r) => r.name !== s.name)].slice(0, 5));
    toast(t("출발지를 {name}(으)로 정했어요", { name: isForeign() && s.nameEn ? s.nameEn : s.name }));
  } else { try { localStorage.removeItem("startPoint"); } catch { /* 저장소 없음 */ } }
  $("#startSearch").value = "";
  renderStartRow();
}
function startCandidates() {
  const own = [
    ...ORIGINS,
    ...Object.values(REGIONS).map((r) => ({ name: r.base.name, lat: r.base.lat, lng: r.base.lng })),
    ...LODGING.map((l) => ({ name: l.name, nameEn: isForeign() ? lodgingName(l) : undefined, lat: l.lat, lng: l.lng })),
    ...PLACES.map((p) => ({ name: p.name, nameEn: isForeign() ? placeName(p) : undefined, lat: p.lat, lng: p.lng })),
  ];
  const seen = new Set();
  return own.filter((o) => (seen.has(o.name) ? false : seen.add(o.name)));
}
function renderStartResults(q, recent = []) {
  const box = $("#startResults");
  const norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, "");
  const query = norm(q);
  let list, head = "";
  if (query) {
    list = startCandidates().filter((o) => norm(o.name).includes(query) || norm(o.nameEn).includes(query)).slice(0, 8);
    if (!list.length) { box.innerHTML = `<li class="none">${t("검색 결과가 없어요")}</li>`; return; }
  } else { list = recent; head = list.length ? `<li class="head">${t("최근 출발지")}</li>` : ""; }
  box.innerHTML = head + list.map((o, i) => `<li><button type="button" data-start="${i}">${esc(isForeign() && o.nameEn ? o.nameEn : o.name)}</button></li>`).join("");
  box._list = list;
}
$("#startEdit").addEventListener("click", () => {
  const p = $("#startPanel"); p.hidden = !p.hidden; $("#startEdit").setAttribute("aria-expanded", String(!p.hidden));
  if (!p.hidden) { renderStartRow(); $("#startSearch").focus(); }
});
$("#startSearch").addEventListener("input", (e) => renderStartResults(e.target.value, store.get("startRecent") || []));
$("#startResults").addEventListener("click", (e) => {
  const b = e.target.closest("[data-start]"); if (!b) return;
  const o = $("#startResults")._list[Number(b.dataset.start)];
  setStart({ name: o.name, ...(o.nameEn ? { nameEn: o.nameEn } : {}), lat: o.lat, lng: o.lng });
});
$("#startDefault").addEventListener("click", () => setStart(null));
$("#startTime").addEventListener("change", (e) => { if (e.target.value) store.set("startTime", e.target.value); else { try { localStorage.removeItem("startTime"); } catch { /* 없음 */ } } });
$("#startGps").addEventListener("click", () => {
  if (!navigator.geolocation) return toast(t("위치를 사용할 수 없어요"));
  toast(t("위치를 찾는 중…"));
  navigator.geolocation.getCurrentPosition((pos) => {
    setStart({ name: t("내 위치"), nameEn: "My location", lat: Math.round(pos.coords.latitude * 1e5) / 1e5, lng: Math.round(pos.coords.longitude * 1e5) / 1e5 });
  }, () => toast(t("위치 권한을 허용해 주세요")), { enableHighAccuracy: true, timeout: 10000 });
});
document.querySelector('.seg[data-name="region"]').addEventListener("click", () => setTimeout(renderStartRow, 0));

function fillForm(input) {
  $("#date").value = input.date;
  for (const name of ["region", "days", "who", "move"]) {
    document.querySelectorAll(`.seg[data-name="${name}"] button`).forEach((b) => b.classList.toggle("on", b.dataset.v === String(input[name])));
  }
  document.querySelectorAll('.chips[data-name="likes"] button').forEach((b) => b.classList.toggle("on", input.likes.includes(b.dataset.v)));
  routePicks = (input.route || []).slice(1);
  renderRouteRow();
  const acc = state?.opts?.access || [];
  document.querySelectorAll('.chips[data-name="access"] button').forEach((b) => b.classList.toggle("on", acc.includes(b.dataset.v)));
}

/* ---------- 화면 전환 ---------- */
function show(which) {
  $("#setup").hidden = which !== "setup";
  $("#result").hidden = which !== "result";
  $("#topActions").hidden = which !== "result";
  window.scrollTo({ top: 0 });
  if (which === "result" && trip) setTimeout(() => drawMap(trip.days[dayIdx]), 50);
}
$("#home").addEventListener("click", () => { if (state) fillForm(state.input); show("setup"); renderSaved(); });
$("#editBtn").addEventListener("click", () => { fillForm(state.input); $("#manual").open = true; show("setup"); });

/* ---------- 직접 넣은 장소 (탐색 목록) ----------
   앱이 검토하지 않은 관광공사 장소를 사람이 일정에 넣으면 opts.custom에 장소 정보를 함께 저장한다(공유 링크에도 들어감).
   일정을 다시 만들 때 PLACES에 다시 올려 둔다 */
function registerCustom(opts) {
  for (const p of opts?.custom || []) if (p?.id?.startsWith("dir-") && !PLACES.some((x) => x.id === p.id)) PLACES.push(p);
}

/* ---------- 순서 바꾸기 ----------
   그날 장소 순서를 바꾸고, 바뀐 순서로 시간을 다시 계산한다. 영업시간에 안 맞으면 바꾸지 않고 알려 준다 */
function moveItem(i, dir) {
  const j = i + dir, day = trip.days[dayIdx];
  if (j < 0 || j >= day.items.length) return;
  const keep = trip.days.map((d) => d.items.map((it) => it.id));
  [keep[dayIdx][i], keep[dayIdx][j]] = [keep[dayIdx][j], keep[dayIdx][i]];
  const trial = planTrip(state.input, { ...state.opts, keep });
  const got = trial.days[dayIdx].items.map((it) => it.id);
  if (got.join() !== keep[dayIdx].join()) { toast(t("그 순서로는 영업시간이 맞지 않아요")); return; }
  state.opts.keep = keep; trip = trial;
  render(); persist(); applyRoad(dayIdx); track("reorder");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-move]"); if (!b || !trip) return;
  const [i, d] = b.dataset.move.split(":").map(Number);
  moveItem(i, d);
});

/* ---------- 일정 생성 ---------- */
function rebuild(keepLayout = false) {
  const opts = { ...state.opts };
  if (!keepLayout) delete opts.keep;
  state.opts = opts;
  registerCustom(opts);
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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${baseOf(state.input).lat}&longitude=${baseOf(state.input).lng}&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max,snowfall_sum&wind_speed_unit=ms&timezone=Asia%2FSeoul&start_date=${date}&end_date=${end}`;
  try {
    const res = await fetchT(url, {}, 4000);
    if (!res.ok) return;
    const j = await res.json();
    weather = {};
    let changed = false;
    j.daily.time.forEach((t, i) => {
      const rain = j.daily.precipitation_probability_max[i];
      weather[t] = { rain, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]), gust: j.daily.wind_gusts_10m_max?.[i] ?? null, snow: j.daily.snowfall_sum?.[i] ?? null };
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
      <strong>${t("{n}일차", { n: i + 1 })}${d.items.some((it) => alertsFor(it.place, d.date, weather[d.date]).some((a) => a.level === "warn")) ? " ⚠" : ""}</strong><span>${esc(areaName(d.areaName))}${w ? ` · ${w.min}°/${w.max}°${w.rain >= 40 ? t(" · 비 {p}%", { p: w.rain }) : ""}` : ""}</span>
    </button>`;
  }).join("");

  const o = state.opts;
  const active = { rain: !!o.rainDays[dayIdx] || o.indoor, lessWalk: o.lessWalk, relaxed: o.pace === "relaxed", packed: o.pace === "packed" };
  document.querySelectorAll("#quick button").forEach((b) => b.classList.toggle("on", !!active[b.dataset.q]));

  const day = trip.days[dayIdx];
  $("#timeline").innerHTML = sunHTML(day) + (day.items.length ? day.items.map((it, i) => itemHTML(it, i, day)).join("") : `<li class="empty">${t("조건에 맞는 장소가 없어요. 조건을 바꿔보세요.")}</li>`) + lodgingHTML(day);
  renderOptions();
  renderHeard();
  renderFestivals();
  renderLodging();
  renderBenefits();
  renderOvernight();
  renderSouvenirs();
  renderCosts();
  renderChecks();
  renderToday();
  renderPet();
  renderTransit();
  renderShops();
  loadImages();
  drawMap(day);
}

// 일출·일몰 (그날 첫 장소 기준) + 동해안에서 묵은 다음 날 아침 해돋이 제안 (숙소에서 가장 가까운 일출 명소, 해 뜨기 15분 전 도착)
const SUNRISE_SPOTS = ["jeongdongjin", "gyeongpo-beach", "chuam", "yeonggeumjeong", "naksan-beach", "sokcho-beach"];
function sunHTML(day) {
  const at = day.items[0]?.place || day.start;
  const s = at && sunTimes(day.date, at.lat, at.lng);
  if (!s) return "";
  let rise = "";
  const night = day.dayIdx > 0 ? lodgingForDay(trip, day.dayIdx - 1) : null;
  if (night) {
    const spot = SUNRISE_SPOTS.map((id) => PLACES.find((p) => p.id === id)).filter(Boolean)
      .map((p) => ({ p, km: distKm(night, p) })).sort((a, b) => a.km - b.km)[0];
    if (spot && spot.km <= 25) {
      const sr = sunTimes(day.date, spot.p.lat, spot.p.lng).rise;
      const walk = spot.km < 1.2;
      const min = walk ? Math.max(5, Math.round(spot.km * 1.3 * 15)) : Math.max(5, Math.round((spot.km * 1.35) / 40 * 60 / 5) * 5);
      const [h, m] = sr.split(":").map(Number);
      const go = fmt(h * 60 + m - 15 - min);
      rise = `<div class="sunrise">${t("🌅 해돋이 보기: {spot} 일출 {rise} · 숙소에서 {mode} {min}분, {go}에 나가면 돼요", { spot: esc(placeName(spot.p)), rise: sr, mode: t(walk ? "걸어서" : state.input.move === "transit" ? "택시로" : "차로"), min, go })}</div>`;
    }
  }
  return `<li class="sun">☀️ ${t("일출 {r} · 일몰 {s}", { r: s.rise, s: s.set })}${rise}</li>`;
}
function itemHTML(it, i, day) {
  const p = it.place, c = CAT[p.cat];
  const mode = t(MODE[it.travelMode]);
  let leg = i === 0 ? t("{start}에서 {mode} {min}분", { start: esc(startName(day.start, trip.lodging)), mode, min: it.travelMin }) : it.travelMode === "same" ? t("바로 옆") : t("{mode} {min}분", { mode, min: it.travelMin });
  if (it.travelMode === "taxi" && it.km) leg += t(" · 약 {won}", { won: won(taxiFare(it.km)) });
  // 앞 장소를 나와 다음 장소에 도착하기까지 30분 넘게 비면 "자유 시간"으로 보여 준다 (저녁 시간 기다림·문 여는 시간 기다림)
  const prev = i > 0 ? day.items[i - 1] : null, free = prev ? it.start - it.travelMin - prev.end : 0;
  if (free >= 30) leg = t("자유 시간 {min}분 · 근처 산책·쉬기", { min: free }) + " · " + leg;
  const hours = hoursLabel(p, trip.days[dayIdx].date);
  return `
  <li class="leg">${leg}</li>
  <li class="item" data-i="${i}">
    <div class="time"><b>${fmt(it.start)}</b><span>${fmt(it.end)}</span></div>
    <article class="card place">
      <div class="thumb" data-photo="${p.id}" style="--c:${c.color}"><span>${i + 1}</span><em>${t(c.label)}</em>${p.photoAt ? `<i class="near" title="${esc(t("주변 사진 · {place}", { place: p.photoAt }))}">${t("주변 사진")}</i>` : ""}</div>
      <div class="info">
        <div class="meta"><span class="tag" style="--c:${c.color}">${t(KIND[it.kind] || c.label)}</span>${p.indoor ? `<span class="tag soft">${t("실내")}</span>` : ""}${state.input.who === "pet" && p.cat !== "festival" ? `<span class="tag ${p.pet ? "pet" : "soft"}">${p.pet ? t("🐾 동반 가능") : p.pet === false ? t("🐾 동반 불가") : t("🐾 동반 확인 필요")}</span>` : ""}</div>
        <h3>${esc(placeName(p))}</h3>
        <p>${esc(placeDesc(p))}</p>
        ${it.extra ? `<div class="check soft">${t("저녁까지 시간이 있어 {min}분 더 여유 있게 머물러요", { min: it.extra })}</div>` : ""}
        ${(state.opts.access || []).length ? accessLine(p) : ""}
        ${state.input.move === "transit" ? busLine(p, it) : ""}
        ${crowdLine(p, trip.days[dayIdx].date)}
        ${state.input.move === "car" ? parkingLine(p) : ""}
        ${p.petOnly ? `<div class="check soft">${p.hoursGuessed ? t("영업시간 정보가 없어 {h}로 가정했어요 · 방문 전 확인하세요", { h: p.hours.join("–") }) : t("영업시간(관광공사 원문): {text}", { text: esc(p.hoursText || t("운영 정보 없음")) })}${p.tel ? ` · <a href="tel:${esc(p.tel)}">${t("전화로 영업·동반 확인")} ${esc(p.tel)}</a>` : ""}</div>` : ""}
        ${p.petOnly ? "" : p.unverified ? `<div class="check soft">${t("앱이 검토하지 않은 장소 · 관광공사 원문: {text}", { text: esc(p.hoursText || t("운영 정보 없음")) })}${p.hoursGuessed ? t(" · 시간은 09:00–18:00로 가정") : ""}</div>` : `<div class="check${p.multi ? " soft" : ""}">${p.multi ? "" : "✓ "}${hours}</div>`}
        ${alertsFor(p, trip.days[dayIdx].date, weather[trip.days[dayIdx].date]).map((a) => `<div class="alert ${a.level}">${alertText(a)}</div>`).join("")}
      <div class="acts">
        <a class="ghost small" href="${esc(routeLink(i === 0 ? { name: startName(day.start, lodgingForDay(trip, dayIdx - 1) || trip.lodging), lat: day.start.lat, lng: day.start.lng } : { name: placeName(day.items[i - 1].place), lat: day.items[i - 1].place.lat, lng: day.items[i - 1].place.lng }, { name: placeName(p), lat: p.lat, lng: p.lng }))}" target="_blank" rel="noopener" title="${esc(t("{from}에서 여기까지 길찾기", { from: i === 0 ? startName(day.start, trip.lodging) : placeName(day.items[i - 1].place) }))}">${t("길찾기")}</a>
        <a class="ghost small needs-server" href="reviews.html?place=${encodeURIComponent(p.id)}">${t("후기")}</a><button class="ghost small" type="button" data-report="${p.id}">${reported().has(p.id) ? t("제보함") : t("정보가 달라요")}</button><button class="ghost small" type="button" data-swap="${i}">${t("바꾸기")}</button>${i > 0 ? `<button class="ghost small icon" type="button" data-move="${i}:-1" aria-label="${t("위로")}" title="${t("위로")}">↑</button>` : ""}${i < trip.days[dayIdx].items.length - 1 ? `<button class="ghost small icon" type="button" data-move="${i}:1" aria-label="${t("아래로")}" title="${t("아래로")}">↓</button>` : ""}
      </div>
      </div>
    </article>
  </li>`;
}

// 기상특보(기상청 특보 현황): GitHub Actions가 2시간마다 받아 live-data 브랜치에 올린 warnings.json을 읽는다 (인증키를 앱에 넣지 않음).
// 장소의 시군은 pet.json의 sigun 표(관광공사 주소 기준)를 함께 쓴다. 오늘·내일 일정에만 붙인다
let kma = null, placeSigun = null;
const WARNINGS_URL = "https://raw.githubusercontent.com/hundol047/MY-AI-LAB/live-data/warnings.json";
// 특보 받는 순서: 앱 서버(/api/warnings) → 저장소 live-data 브랜치(공개 저장소일 때) → 같은 사이트의 warnings.json
async function loadWarnings() {
  for (const u of ["api/warnings", WARNINGS_URL, "warnings.json"]) {
    const j = await fetchT(u, { cache: "no-cache" }, 6000).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (j?.fetchedAt && Array.isArray(j.now)) return j;
  }
  return null;
}
// 시군 표(pet.json)는 지금 특보가 있을 때만 받는다 (첫 화면 데이터 줄이기)
loadWarnings().then(async (w) => [w, w?.now?.length ? await fetchT("pet.json", {}, 6000).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null]).then(([w, pj]) => { kma = w; placeSigun = pj?.sigun || null; if (pj && !petData) petData = pj; if (w && trip && !$("#result").hidden) render(); });
function alertsFor(p, date, wx) {
  const k = kstNow(), tomorrowStr = addDays(k.date, 1);
  return [...kmaAlertsFor(p, date, { warnings: kma, sigun: placeSigun?.[p.id], today: k.date, tomorrow: tomorrowStr }), ...weatherAlertsFor(p, date, wx)];
}

// 통제·운휴 경고 문구 (alerts.js). 예보로 본 가능성이라 "멈출 수 있어요"로 말하고, 다른 곳으로 바꿀 수 있게 한다
function alertText(a) {
  if (a.kind === "kma") return a.prelim ? t("예비특보: {name} 예정 · 출발 전 기상청 특보를 확인하세요", { name: t(a.name) }) : a.level === "warn" ? t("⚠ {name} 발효 중 · 운영·통제 여부를 꼭 확인하세요", { name: t(a.name) }) : t("{name} 발효 중", { name: t(a.name) });
  if (a.kind === "wind") return t("⚠ 돌풍 최대 {g}m/s 예보 · 운휴·통제될 수 있어요. 출발 전 운영 여부를 확인하거나 '바꾸기'로 다른 곳을 고르세요", { g: a.gust });
  if (a.kind === "sea") return t("⚠ 바람이 센 날(돌풍 {g}m/s) · 풍랑특보가 나면 통제돼요. 출발 전 확인하세요", { g: a.gust });
  if (a.kind === "snow") return t("⚠ 눈 {s}cm 예보 · 고갯길이 막히거나 체인이 필요할 수 있어요", { s: a.snow });
  if (a.kind === "fire") return t("산불조심기간: 국립공원 일부 탐방로가 통제될 수 있어요. 국립공원 누리집에서 확인하세요");
  if (a.kind === "ski") return t("스키장 개장·폐장일은 해마다 달라요. 리조트 공지를 확인하세요");
  return "";
}
// 여행 중 모드: 오늘이 여행 날이면 맨 위에 "지금 할 일"을 보여 준다. 1분마다 다시 계산, 위치는 버튼을 눌렀을 때만 쓴다
let todayHere = null;
function renderToday() {
  const box = $("#today"); if (!box || !trip) return;
  const s = todayStatus(trip, kstNow(), todayHere, state.input.move);
  if (!s) { box.hidden = true; return; }
  box.hidden = false;
  const name = (it) => esc(placeName(it.place));
  let body;
  if (s.state === "done") body = `<p>${t("오늘 일정은 모두 끝났어요. 편히 쉬세요!")}</p>`;
  else if (s.state === "at") body = `<p>${t("지금 {place} 일정 중 · {time}까지", { place: `<b>${name(s.item)}</b>`, time: fmt(s.leaveAt) })}</p>`;
  else {
    const left = s.leaveBy - kstNow().min;
    body = `<p>${t("다음: {place} {time}", { place: `<b>${name(s.item)}</b>`, time: fmt(s.item.start) })}</p>
      <p class="${s.late ? "warn" : ""}">${s.late ? t("⚠ 지금 출발해도 {arrive} 도착 · 입장 마감 {deadline}에 늦어요. '바꾸기'로 다른 곳을 고르세요", { arrive: fmt(s.arrive), deadline: fmt(s.deadline) })
        : left > 0 ? t("{leave}까지 출발하면 돼요 ({min}분 남음 · 이동 약 {travel}분)", { leave: fmt(s.leaveBy), min: left, travel: s.travelMin })
        : t("지금 출발하세요 · 이동 약 {travel}분, {arrive} 도착", { travel: s.travelMin, arrive: fmt(s.arrive) })}</p>`;
  }
  box.innerHTML = `<h3>${t("오늘 여행 중")}</h3>${body}
    <div class="acts"><button type="button" class="ghost small" id="todayGps">${todayHere ? t("내 위치 기준 · 다시 계산") : t("내 위치로 다시 계산")}</button>
    ${s.dayIdx !== dayIdx ? `<button type="button" class="ghost small" data-goday="${s.dayIdx}">${t("오늘 일정 보기")}</button>` : ""}</div>`;
}
setInterval(() => { if (trip && !$("#result").hidden) renderToday(); }, 60000);
document.addEventListener("click", (e) => {
  if (e.target.closest("#todayGps")) {
    if (!navigator.geolocation) return toast(t("이 기기에서는 위치를 쓸 수 없어요"));
    navigator.geolocation.getCurrentPosition((p) => { todayHere = { lat: p.coords.latitude, lng: p.coords.longitude }; renderToday(); track("trip_today"); },
      () => toast(t("위치를 가져오지 못했어요")), { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
  }
  const g = e.target.closest("[data-goday]");
  if (g) { dayIdx = Number(g.dataset.goday); render(); }
});

// 무장애 편의시설 한 줄 (한국관광공사 무장애 여행 정보). 자세한 원문은 펼쳐 본다 (원문은 한국어)
const ACCESS_LABEL = { wheel: "휠체어 대여", ramp: "경사로·턱 없음", elevator: "엘리베이터", toilet: "장애인 화장실", parking: "장애인 주차", stroller: "유모차 대여", nursing: "수유실" };
function accessLine(p) {
  if (!p.access) return p.cat === "festival" ? "" : `<div class="access none">${t("무장애 정보 없음 · 계단·경사를 미리 확인하세요")}</div>`;
  const tags = Object.keys(ACCESS_LABEL).filter((k) => p.access[k]).map((k) => t(ACCESS_LABEL[k]));
  const raw = Object.entries(p.access.text || {}).map(([k, v]) => `<li><b>${esc(k)}</b> ${esc(v)}</li>`).join("");
  return `<details class="access"><summary>${tags.length ? `♿ ${tags.join(" · ")}` : t("무장애 정보 있음")}</summary><ul>${raw}</ul><small>${t("한국관광공사 무장애 여행 정보")}</small></details>`;
}

// 주차 (parking.json, 한국관광공사 소개정보의 주차 원문) — 자동차 일정 카드에만
let parkingData = null;
fetchT("parking.json", {}, 6000).then((r) => (r.ok ? r.json() : null)).then((j) => { parkingData = j?.places || null; if (trip && state.input.move === "car" && !$("#result").hidden) render(); }).catch(() => {});
function parkingLine(p) {
  const v = parkingData?.[p.id];
  if (!v) return p.multi || p.cat === "festival" ? "" : `<div class="parking none">${t("🅿️ 주차 정보 없음 · 근처 공영주차장을 확인하세요")}</div>`;
  if (v.ok === false) return `<div class="parking no">${t("🅿️ 전용 주차장 없음 · 근처 공영주차장 이용")}</div>`;
  const cnt = (v.text.match(/(\d[\d,]*)\s*대/) || [])[1];
  const fee = v.fee === "free" ? t("무료") : v.fee === "paid" ? t("유료") : "";
  return `<div class="parking ok" title="${esc(v.text)}">${t("🅿️ 주차 가능")}${cnt ? t(" · {n}대", { n: cnt }) : ""}${fee ? ` · ${fee}` : ""}</div>`;
}

// 관광지 혼잡 예측 (crowd.json, 한국관광공사 집중률 · 앞으로 30일 · 하루 단위). 일정을 짜기 전에 불러 엔진에 넘긴다
fetchT("crowd.json", {}, 6000).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.places) setCrowd(j.places); }).catch(() => {});
function crowdLine(p, dateStr) {
  const v = crowdOn(p.id, dateStr);
  if (v == null || v < 70) return "";
  const high = crowdedOn(p.id, dateStr); // 그날 다른 곳보다 유난히 붐빔
  return `<div class="crowd ${high ? "high" : "mid"}">${high ? t("👥 붐빔 예상 (집중률 {v}) · 문 여는 시간에 맞춰 가면 덜 붐벼요", { v: Math.round(v) }) : t("👥 붐비는 날 (집중률 {v})", { v: Math.round(v) })}</div>`;
}

// 장소 근처 시내·농어촌버스 (bus.json, 국토교통부 TAGO 버스노선정보 · 춘천·원주·횡성·태백·홍천·철원만)
// 첫차·막차는 노선 기점 출발 시각이라 정류장 도착은 조금 늦다 → 막차 30분 전부터 경고한다
let busData = null;
fetchT("bus.json", {}, 6000).then((r) => (r.ok ? r.json() : null)).then((j) => { busData = j; if (trip && state.input.move === "transit" && !$("#result").hidden) render(); }).catch(() => {});
function busLine(p, it) {
  const b = busData?.places?.[p.id];
  if (!b) return "";
  const nos = b.routes.slice(0, 3).map((r) => t("{n}번", { n: esc(r.no) })).join(", ");
  const list = b.routes.map((r) => `<li><b>${t("{n}번", { n: esc(r.no) })}</b> ${r.first || "?"}–${r.last || "?"}${r.gap ? " · " + t("{m}분 간격", { m: r.gap }) : ""} · ${esc(r.stop)} ${r.m}m</li>`).join("");
  const [lh, lm] = (b.last || "").split(":").map(Number);
  const late = b.last && it && it.end >= lh * 60 + lm - 30;
  return `<details class="access bus"><summary>🚌 ${esc(b.stop)} ${b.m}m · ${nos}${b.last ? " · " + t("막차 {t}", { t: b.last }) : ""}</summary><ul>${list}</ul><small>${t("국토교통부 TAGO 버스노선정보 · 첫차·막차는 기점 출발 시각")}</small></details>${late ? `<div class="alert warn">${t("근처 버스 막차({t}, 기점 출발)에 가까워요 · 택시를 준비하세요", { t: b.last })}</div>` : ""}`;
}

/* ---------- 반려동물 동행 ----------
   강원 반려동물 동반 시설 목록(pet.json)으로: 여행하는 시군의 동반 가능 숙소, 동물병원·동물약국(전화·지도), 동반 식당이 없는 날 안내 */
let petData = null;
function renderPet() {
  const box = $("#pet"); if (!box) return;
  if (state.input.who !== "pet" || !trip) { box.hidden = true; return; }
  if (!petData) { fetchT("pet.json", {}, 6000).then((r) => r.json()).then((j) => { petData = j; renderPet(); }).catch(() => {}); return; }
  const SG_EN = { 춘천: "Chuncheon", 원주: "Wonju", 강릉: "Gangneung", 동해: "Donghae", 태백: "Taebaek", 속초: "Sokcho", 삼척: "Samcheok", 홍천: "Hongcheon", 횡성: "Hoengseong", 영월: "Yeongwol", 평창: "Pyeongchang", 정선: "Jeongseon", 철원: "Cheorwon", 화천: "Hwacheon", 양구: "Yanggu", 인제: "Inje", 고성: "Goseong", 양양: "Yangyang" };
  const sgName = (s) => (isForeign() ? `${SG_EN[s] || s} (${s})` : s);
  const towns = [...new Set(trip.days.flatMap((d) => d.items.map((i) => petData.sigun[i.id]).filter(Boolean)))];
  // 숙소 시군: 추천 숙소 지역과 가장 가까운 장소의 시군
  const nearestTown = (pt) => { let best = null, bd = Infinity; for (const p of PLACES) { const sg = petData.sigun[p.id]; if (!sg) continue; const d = distKm(p, pt); if (d < bd) { bd = d; best = sg; } } return best; };
  const stayTowns = trip.lodging ? [...new Set((trip.lodgings || [trip.lodging]).map((l) => nearestTown(l) || towns[0]).filter(Boolean))] : [];
  const link = (x) => `<li><a href="https://map.kakao.com/link/search/${encodeURIComponent(x.name)}" target="_blank" rel="noopener">${esc(x.name)}</a>${x.tel ? ` · <a href="tel:${esc(x.tel)}">${esc(x.tel)}</a>` : ""}</li>`;
  const list = (title, map, ts, n) => { const rows = ts.flatMap((s) => (map[s] || []).slice(0, n).map((x) => ({ ...x, s }))); return rows.length ? `<h4>${title}</h4><ul class="pet-list">${rows.map(link).join("")}</ul>` : ""; };
  const noLunch = trip.days.map((d, i) => (d.items.some((it) => it.kind === "lunch") ? null : i + 1)).filter(Boolean);
  box.hidden = false;
  box.innerHTML = `<h3>${t("반려동물과 함께")}</h3>
    <p class="sub">${t("강원 반려동물 동반 시설 목록에 있는 곳(🐾 동반 가능)을 먼저 넣고, 확인이 안 된 실내 시설·식당은 빼요. 야외 자연·해변은 '동반 확인 필요'로 표시해요. 목줄·배변봉투를 챙기고, 실내 동반 조건은 시설마다 달라요.")}</p>
    ${noLunch.length ? `<p class="sub warn">${t("{days}일차는 근처에 동반 가능한 식당이 목록에 없어 점심을 넣지 않았어요. 포장이나 테라스 좌석을 이용하세요.", { days: noLunch.join(", ") })}</p>` : ""}
    ${trip.lodging ? list(t("{town} 동반 가능 숙소", { town: stayTowns.map(sgName).join(", ") }), petData.stays, stayTowns, 6) : ""}
    ${list(t("동물병원"), petData.vets, towns, 3)}
    ${list(t("동물약국"), petData.pharmacies, towns, 2)}
    <p class="sub">${t("출처: {src}. 방문 전 동반 가능 여부를 한 번 더 확인하세요.", { src: esc(petData.source) })}</p>`;
}

function renderChecks() {
  const el = $("#checks"); if (!el) return;
  el.hidden = false;
  el.innerHTML = `<h3>${t("출발 전 확인")}</h3><p class="sub">${t("임시 휴장·통제는 미리 알 수 없어요. 출발 전날 공식 안내를 한 번 확인하세요.")}</p>
    <div class="acts">${OFFICIAL_CHECKS.map((c) => `<a class="ghost small" href="${c.url}" target="_blank" rel="noopener">${t(c.label)}</a>`).join("")}</div>`;
}

// 길찾기는 카카오맵 장소 검색으로: 지도 서비스의 정확한 위치로 안내된다
const searchName = (p) => p.name;
// 길찾기: 앞 장소(첫 장소는 그날 출발점)에서 이 장소까지 카카오맵 길 안내를 연다 (map.kakao.com/link/by/교통수단/출발,위도,경도/도착,위도,경도)
// 이름에 쉼표·슬래시가 있으면 주소 형식이 깨지므로 뺀다. 대중교통이면 1km 안은 걷기, 그보다 멀면 대중교통 길찾기
function routeLink(a, b) {
  const nm = (x) => encodeURIComponent(String(x.name || "").replace(/[,/]/g, " ").trim() || "지점");
  const km = Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 88);
  const by = drives(state.input.move) ? "car" : km < 1 ? "walk" : "traffic";
  return `https://map.kakao.com/link/by/${by}/${nm(a)},${a.lat},${a.lng}/${nm(b)},${b.lat},${b.lng}`;
}

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
      trip = summarize(days, trip.lodging, trip);
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
function priceLinks(query) {
  const choice = recommendBooking(query, stayInput(), peopleNow(), getLang(), store.get("offers:"+query));
  return `<div class="booking-choice">
    <a class="ghost small price" href="${esc(choice.primary.url)}" target="_blank" rel="noopener">${t(choice.compared ? "추천 · {platform}에서 예약 찾기" : "{platform}에서 숙소 검색", {platform:esc(choice.primary.name)})}</a>
    <details class="booking-alternatives"><summary>${t("다른 플랫폼 보기")}</summary>${choice.alternatives.map(link =>
      `<a class="ghost small" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.name)} · ${t("가격·예약")}</a>`).join("")}</details>
    <details><summary>${t("확인한 요금 비교")}</summary>
    <form class="offer-form" data-query="${esc(query)}">
      <label>${t("같은 객실 유형")}<input name="roomType" required maxlength="100"></label>
      ${['Booking.com','Agoda'].map((platform,i)=>`<label>${platform} · ${t("세금 포함 전체 숙박 총액 (원)")}<input name="total${i}" type="number" min="1" max="100000000" step="1" required></label><label><input name="refund${i}" type="checkbox">${t("무료 취소 가능")}</label>`).join("")}
      <label><input name="sameTerms" type="checkbox" required>${t("같은 날짜·인원·객실·식사 조건을 확인했어요")}</label>
      <label><input name="refundableOnly" type="checkbox">${t("무료 취소 상품만 비교")}</label>
      <button type="submit">${t("비교 적용")}</button>
      <p>${t("직접 확인한 요금만 비교하며, 날짜·인원이 바뀌거나 24시간이 지나면 다시 확인해야 해요.")}</p>
    </form></details>
  </div>`;
}
function bookingReason(query) {
  const choice = recommendBooking(query, stayInput(), peopleNow(), getLang(), store.get("offers:"+query));
  return `<p class="booking-reason">${t(choice.reason)}<br>${choice.dates.checkin ? `${esc(choice.dates.checkin)} → ${esc(choice.dates.checkout)} · ` : ""}${t("어른 {adults}명 · 어린이 {kids}명 · 객실 {rooms}개", {adults:choice.adults,kids:choice.kids,rooms:choice.rooms})}</p>`;
}
// 사진이 없거나 못 받은 숙소는 숙소 종류 그림을 보여 준다 (사진 아래 층에 깔아 두어, 사진이 뜨면 가려진다)
const STAY_ART = (() => {
  const bg = '<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3f1ef"/><stop offset="1" stop-color="#f6ecdc"/></linearGradient></defs><rect width="56" height="56" fill="url(#b)"/>';
  const T = "#0b5e6b", M = "#5f9b9a", A = "#f2a541", W = "#ffffff";
  const art = {
    ocean: `<circle cx="42" cy="15" r="5" fill="${A}"/><rect x="14" y="14" width="20" height="28" rx="2" fill="${T}"/><g fill="${W}"><rect x="18" y="19" width="4" height="4"/><rect x="26" y="19" width="4" height="4"/><rect x="18" y="27" width="4" height="4"/><rect x="26" y="27" width="4" height="4"/></g><rect y="42" width="56" height="14" fill="${M}"/><path d="M4 47q4-3 8 0t8 0t8 0t8 0t8 0t8 0" fill="none" stroke="${W}" stroke-width="2" stroke-linecap="round"/>`,
    business: `<rect x="10" y="18" width="16" height="30" rx="2" fill="${M}"/><rect x="24" y="10" width="22" height="38" rx="2" fill="${T}"/><g fill="${W}"><rect x="28" y="15" width="4" height="4"/><rect x="37" y="15" width="4" height="4"/><rect x="28" y="23" width="4" height="4"/><rect x="37" y="23" width="4" height="4"/><rect x="28" y="31" width="4" height="4"/><rect x="37" y="31" width="4" height="4"/><rect x="14" y="23" width="3" height="3"/><rect x="19" y="23" width="3" height="3"/><rect x="14" y="30" width="3" height="3"/><rect x="19" y="30" width="3" height="3"/></g><rect y="48" width="56" height="8" fill="${M}" opacity=".5"/>`,
    pension: `<circle cx="44" cy="30" r="7" fill="${M}"/><rect x="43" y="34" width="2" height="12" fill="${T}"/><path d="M8 28L22 15L36 28Z" fill="${A}"/><rect x="11" y="28" width="22" height="18" fill="${T}"/><rect x="19" y="34" width="6" height="12" fill="${W}"/><rect x="13" y="31" width="4" height="4" fill="${W}"/><rect y="46" width="56" height="10" fill="${M}" opacity=".5"/>`,
    hanok: `<path d="M5 25Q10 28 28 24Q46 28 51 25L46 19Q28 22 10 19Z" fill="${T}"/><path d="M16 19Q28 11 40 19Z" fill="${T}"/><rect x="12" y="27" width="32" height="17" fill="#f3e3c3"/><g fill="${T}"><rect x="12" y="27" width="2" height="17"/><rect x="27" y="27" width="2" height="17"/><rect x="42" y="27" width="2" height="17"/></g><g fill="${M}"><rect x="16" y="31" width="8" height="8"/><rect x="32" y="31" width="8" height="8"/></g><rect x="8" y="44" width="40" height="4" fill="${M}"/>`,
    resort: `<path d="M0 34L14 20L24 28L36 14L56 34V56H0Z" fill="${M}" opacity=".7"/><rect x="10" y="26" width="36" height="20" rx="2" fill="${T}"/><g fill="${W}"><rect x="14" y="30" width="5" height="4"/><rect x="22" y="30" width="5" height="4"/><rect x="30" y="30" width="5" height="4"/><rect x="38" y="30" width="4" height="4"/><rect x="14" y="37" width="5" height="4"/><rect x="22" y="37" width="5" height="4"/><rect x="30" y="37" width="5" height="4"/><rect x="38" y="37" width="4" height="4"/></g><rect x="6" y="46" width="44" height="5" rx="2.5" fill="#7cc4c9"/>`,
    guesthouse: `<path d="M12 27L28 14L44 27Z" fill="${T}"/><rect x="15" y="27" width="26" height="19" fill="${M}"/><circle cx="28" cy="33" r="3.5" fill="${W}"/><rect x="25" y="38" width="6" height="8" fill="${T}"/><rect x="36" y="16" width="4" height="7" fill="${T}"/><circle cx="46" cy="14" r="3" fill="${A}"/><rect y="46" width="56" height="10" fill="${M}" opacity=".45"/>`,
  };
  return Object.fromEntries(Object.entries(art).map(([k, v]) => [k, `url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56">${bg}${v}</svg>`).replace(/'/g, "%27")}')`])); // style="…" 안에 들어가므로 작은따옴표
})();
function staysHTML(l) {
  const list = staysFor(l);
  if (!list.length) return "";
  const byType = lodgingPlaces?.[l.id] || {};
  const type = byType[l.type]?.length ? l.type : Object.keys(byType).find((k) => byType[k]?.length) || l.type; // staysFor가 고른 목록의 종류
  const art = STAY_ART[type] || STAY_ART.pension;
  return `<div class="stays"><b>${t("이 지역 추천 숙소")}</b><ul>${list.map((h) => {
    const q = encodeURIComponent(h.name);
    return `<li>
      <div class="stay-img" style="background-image:${h.photo ? `url('${h.photo}'), ` : ""}${art}"></div>
      <div class="stay-info"><strong>${esc(h.name)}</strong>
        <span>${h.view ? `<em>${t("바다·호수 전망")}</em> · ` : ""}${t("{km}km", { km: h.km })}</span></div>
      <div class="stay-acts">${priceLinks(h.name, true)}<a class="ghost small" href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener">${t("지도")}</a></div>
    </li>`;
  }).join("")}</ul><p class="stay-note">${t("여행 날짜와 인원으로 예약 플랫폼을 엽니다. 객실·아동 나이·세금·취소 조건과 최종 금액을 확인하세요. 최저가는 보장하지 않습니다.")}</p></div>`;
}
// 여러 권역 여행: 보고 있는 날의 밤 숙소(마지막 날이면 마지막 숙소)를 보여 주고, 예약 검색 날짜도 그 숙소의 체크인·박수로 연다
const currentLodging = () => (trip?.lodgings?.length ? lodgingForDay(trip, dayIdx) || trip.lodgings.at(-1) : trip?.lodging);
function stayInput() {
  const l = currentLodging();
  return l && trip.lodgings?.length ? { ...state.input, date: addDays(state.input.date, l.from), days: l.nights + 1 } : state.input;
}
function renderLodging() {
  const box = $("#lodgingCard"), l = currentLodging();
  if (!l) { box.hidden = true; return; }
  box.hidden = false;
  const q = encodeURIComponent(l.query);
  const multi = trip.lodgings?.length > 1;
  const tag = multi ? t("추천 숙소 · {d}일차 밤부터 {n}박", { d: l.from + 1, n: l.nights }) : l.nights === 1 ? t("추천 숙소 · 1박") : t("추천 숙소 · {n}박 내내", { n: l.nights });
  const plan = multi ? `<ol class="stay-plan">${trip.lodgings.map((x) => `<li class="${x === l ? "on" : ""}"><button type="button" class="linkish" data-goday="${x.from}">${t("{d}일차 밤", { d: x.from + 1 })}</button> ${esc(lodgingName(x))} · ${t("{n}박", { n: x.nights })}</li>`).join("")}</ol>` : "";
  box.innerHTML = `
    ${plan}
    <div class="info">
      <div class="meta"><span class="tag" style="--c:var(--brand)">${tag}</span></div>
      <h3>${esc(lodgingName(l))} · ${typeLabel(l.type, l.typeLabel)}</h3>
      <p>${esc(lodgingDesc(l))}</p>
      <div class="why">${lodgingReason(l)}${l.others.length ? t(" · 다른 선택: {o}", { o: l.others.map(typeLabelFromKo).join(", ") }) : ""}</div>
    </div>
    <div class="booking-options"><label>${t("객실 수")}<input id="bookingRooms" type="number" min="1" max="${peopleNow().adults}" value="${bookingPeople(peopleNow()).rooms}"></label>
    ${bookingPeople(peopleNow()).ages.map((age,i)=>`<label>${t("어린이 {n} 나이",{n:i+1})}<select data-child-age="${i}"><option value="">${t("선택 필요")}</option>${Array.from({length:18},(_,a)=>`<option value="${a}" ${age===a?'selected':''}>${a}</option>`).join('')}</select></label>`).join('')}
    <p>${t("아동 나이를 모두 선택하면 예약 검색에 전달합니다. 플랫폼에서 최종 조건을 확인하세요.")}</p></div>
    ${bookingReason(l.query)}
    ${staysHTML(l)}
    <div class="acts">
      ${priceLinks(l.query, false)}
      <button class="ghost small" type="button" id="safeOpen">${t("예약 전 안심 체크")}</button>
    </div>
    <form class="safe" id="safeForm" hidden>
      <textarea id="safeText" rows="5" maxlength="6000" placeholder="${t("예약하려는 숙소 페이지의 가격, 취소·환불 규정, 후기를 그대로 붙여넣으세요")}"></textarea>
      <button type="submit" class="primary">${t("확인")}</button>
      <div class="safe-result" id="safeResult"></div>
    </form>`;
}

document.addEventListener("change",e=>{
  if(e.target.id!=="bookingRooms" && !e.target.matches('[data-child-age]'))return;
  const p=bookingPeople(peopleNow());
  if(e.target.id==='bookingRooms')p.rooms=Number(e.target.value);else p.ages[Number(e.target.dataset.childAge)]=e.target.value===''?null:Number(e.target.value);
  state.opts.people=bookingPeople(p);renderLodging();renderCosts();persist();
});
document.addEventListener("submit",e=>{
  if(!e.target.matches('.offer-form'))return;e.preventDefault();
  const form=e.target, f=new FormData(form),query=form.dataset.query;
  store.set('offers:'+query,{scope:bookingScope(query,stayInput(),peopleNow()),checkedAt:Date.now(),roomType:f.get('roomType'),sameTerms:f.has('sameTerms'),refundableOnly:f.has('refundableOnly'),offers:['Booking.com','Agoda'].map((platform,i)=>({platform,total:Number(f.get('total'+i)),refundable:f.has('refund'+i)}))});
  renderLodging();
});

/* ---------- 숙소 안심 체크 ---------- */
document.addEventListener("click", (e) => {
  if (e.target.id === "safeOpen") { $("#safeForm").hidden = !$("#safeForm").hidden; if (!$("#safeForm").hidden) $("#safeText").focus(); }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "safeForm") return;
  e.preventDefault();
  const text = $("#safeText").value.trim(); if (text.length < 20) return toast(t("숙소 페이지 내용을 조금 더 붙여넣어 주세요"));
  const btn = e.target.querySelector("button"); btn.disabled = true; btn.textContent = t("확인 중…");
  const r = (await localAI()).checkLodgingLocal(text, getLang());
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
  const night = lodgingForDay(trip, day.dayIdx);
  if (!night || day.dayIdx >= state.input.days - 1) return "";
  const roadKm = (day.toLodgingKm ?? 0) * 1.35;
  const fare = state.input.move === "taxi" && roadKm > 1.2 ? t(" · 택시 약 {won}", { won: won(taxiFare(roadKm)) }) : "";
  return `<li class="leg home">${t("숙소({name})로 · 약 {km}km", { name: esc(lodgingName(night)), km: day.toLodgingKm ?? "-" })}${fare}</li>`;
}

/* ---------- 혜택 내비 + 증빙 보관함 ---------- */
const proofKey = () => `proofs:${state.input.region}:${state.input.date}`;
const loadProofs = () => store.get(proofKey()) || {};
// 반값여행 예상 환급: 이 일정의 예상 경비(교통·입장·식사·숙박) 50%, 1명 최대 10만 원·2명 이상 최대 20만 원.
// 경비 중 대상 시군에서 쓴 몫만 인정되므로 "최대"로 보여 준다
function halfPriceEstimate(b) {
  const ppl = peopleNow(), n = (ppl.adults || 0) + (ppl.kids || 0);
  const cap = n >= 2 ? b.caps.group : b.caps.one;
  let est = null;
  try { const c = estimateTrip(trip, state.input, ppl, feesData || {}, []); est = c?.total ? Math.round((c.total.low * b.rate) / 1000) * 1000 : null; } catch { /* 비용을 아직 못 셈 */ }
  const ids = new Set(b.placeIds || []);
  const stops = trip.days.flatMap((d) => d.items.filter((it) => ids.has(it.id)).map((it) => placeName(it.place)));
  return t("대상 시군 장소 {n}곳 ({names}) · 승인되면 경비의 50%, 최대 {cap}원", { n: stops.length, names: [...new Set(stops)].slice(0, 3).join(", "), cap: cap.toLocaleString() })
    + (est ? t(" · 이 일정 예상 경비로는 약 {won}원까지", { won: Math.min(cap, est).toLocaleString() }) : "");
}
function renderBenefits() {
  const list = benefitsFor(trip, state.input).filter((b) => b.status !== "closed");
  const box = $("#benefits");
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  const proofs = loadProofs();
  const total = list.filter((b) => b.kind === "place").reduce((a, b) => a + b.amount, 0);
  const badge = { auto: t("일정에 포함 · 현장에서 받기"), check: t("시군 공고에서 회차 확인") };
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
        ${b.caps ? `<p class="b-est">${halfPriceEstimate(b)}</p>` : ""}
        ${b.link ? `<a class="ghost small" href="${esc(b.link)}" target="_blank" rel="noopener">${t("지금 진행 중인 회차·신청 날짜 보기")}</a>` : ""}
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

/* ---------- 예상 비용 (일정 맨 마지막) ----------
   교통(택시 요금·연료·버스)과 입장료는 근거 있는 값, 식사·숙박은 앱이 정한 평균 범위 (costs.js) */
let feesData = {};
fetchT("fees.json", {}, 4000).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => { feesData = j; if (trip && !$("#result").hidden) renderCosts(); });
const won = (n) => (isForeign() ? `₩${Math.round(n).toLocaleString("en-US")}` : `${Math.round(n).toLocaleString("ko-KR")}원`);
const wonShort = (n) => {
  if (isForeign()) return `₩${n >= 10000 ? `${Math.round(n / 1000).toLocaleString("en-US")}k` : Math.round(n).toLocaleString("en-US")}`;
  return n >= 10000 ? `${(Math.round(n / 1000) / 10).toLocaleString("ko-KR")}만 원` : `${Math.round(n).toLocaleString("ko-KR")}원`;
};
const range = (lo, hi) => (lo === hi ? wonShort(lo) : `${wonShort(lo)} ~ ${wonShort(hi)}`);
function peopleNow() { return state.opts.people || defaultPeople(state.input.who); }
function renderCosts() {
  const box = $("#costs");
  if (!trip?.days?.length) { box.hidden = true; return; }
  box.hidden = false;
  const people = peopleNow();
  // 오가는 기차·버스 운임: 가는 편 운임 + 돌아오는 편(마지막 날 첫 편) 운임
  let longFare = null;
  if (state.opts.arrival?.fare && transitData) {
    const last = trip.days.at(-1), end = last.items.length ? last.items.at(-1).end + 30 : 17 * 60;
    const back = returnTrips(transitData, state.opts.arrival.from, regionForDay(state.input, state.input.days - 1), last.date, end, 1)[0];
    longFare = { go: state.opts.arrival.fare, back: back?.fare || state.opts.arrival.fare };
  }
  const e = estimateTrip(trip, state.input, people, feesData, benefitsFor(trip, state.input), longFare);
  const label = {
    taxi: t("택시"), fuel: t("자동차 연료"), bus: t("버스"), longway: t("오가는 기차·버스"), fees: t("입장료"), meals: t("식사·카페"), stay: t("숙박"),
  };
  const detail = (r) => {
    const d = r.detail;
    if (r.key === "taxi") return t("{n}구간 · 택시 {cars}대 · {src}", { n: d.legs, cars: d.cars, src: t(TAXI.source) }) + (d.far ? t(" · 출발지에서 오는 먼 구간은 기차·버스 요금 별도") : "");
    if (r.key === "fuel") return t("약 {km}km · 연비 {eff}km/L · {src}", { km: d.km, eff: FUEL.kmPerL, src: t(FUEL.source) });
    if (r.key === "bus") return t("{n}번 탑승 · 1회 {fare}", { n: d.rides, fare: won(BUS.fare) }) + (d.far ? t(" · 먼 구간 {n}번은 시외버스라 요금 확인 필요", { n: d.far }) : "");
    if (r.key === "longway") return t("가는 편 {go} · 돌아오는 편 {back} (어린이는 할인될 수 있어요)", { go: won(r.detail.go), back: won(r.detail.back) });
    if (r.key === "fees") return t("요금 확인된 {n}곳 (한국관광공사)", { n: d.known }) + (e.unknownFees.length ? t(" · 요금 정보 없음: {names}", { names: e.unknownFees.map((p) => esc(placeName(p))).join(", ") }) : "");
    if (r.key === "meals") return t("점심 {l} · 저녁 {d} · 카페 {c} (앱 가정: 1인 점심 {a}, 저녁 {b})", { l: d.lunch, d: d.dinner, c: d.cafe, a: range(...ASSUME.lunch), b: range(...ASSUME.dinner) });
    if (r.key === "stay") return t("{n}박 · {units}{unit} · {type} (앱 가정: 평균 범위, 주말·성수기엔 더 비쌈)", { n: d.nights, units: d.units, unit: d.type === "guesthouse" ? t("명") : t("실"), type: typeLabel(d.type, trip.lodging.typeLabel) });
    return "";
  };
  box.innerHTML = `
    <h3>${t("예상 비용")}</h3>
    <div class="cost-total"><b>${range(e.net.low, e.net.high)}</b><span>${t("1인당 {r}", { r: range(e.perPerson.low, e.perPerson.high) })}</span></div>
    ${e.refund.back ? `<p class="cost-refund">${t("환급 {won} 뺀 금액 (돌려받는 지역 상품권: {list})", { won: won(e.refund.back), list: e.refund.sure.map((b) => esc(benefitText(b, "title"))).join(", ") })}</p>` : ""}
    ${e.refund.maybe.length ? `<p class="cost-refund maybe">${t("신청하면 더 돌려받을 수 있어요: {list}", { list: e.refund.maybe.map((b) => t("{title} 최대 {won}", { title: esc(benefitText(b, "title")), won: won(b.amount) }) + (b.unconfirmed ? t(" (공고 확인 필요)") : "")).join(" · ") })}</p>` : ""}
    <div class="cost-people">
      <span>${t("어른")}</span><button type="button" class="ghost small" data-ppl="adults:-1" aria-label="-">−</button><b>${people.adults}</b><button type="button" class="ghost small" data-ppl="adults:1" aria-label="+">+</button>
      <span>${t("어린이")}</span><button type="button" class="ghost small" data-ppl="kids:-1" aria-label="-">−</button><b>${people.kids}</b><button type="button" class="ghost small" data-ppl="kids:1" aria-label="+">+</button>
    </div>
    <ul class="cost-rows">${e.rows.map((r) => `<li><div><b>${label[r.key]}</b><span>${detail(r)}</span></div><strong>${range(r.low, r.high)}</strong></li>`).join("")}</ul>
    <p class="cost-note">${t("집에서 강원까지 오가는 교통비, 주차·통행료, 쇼핑은 빠져 있어요. 식사·숙박은 앱이 정한 평균 범위라 실제와 다를 수 있어요.")}</p>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ppl]"); if (!b || !state) return;
  const [k, d] = b.dataset.ppl.split(":");
  const p = { ...peopleNow() };
  p[k] = Math.max(k === "adults" ? 1 : 0, Math.min(10, p[k] + Number(d)));
  state.opts.people = p;
  renderCosts(); renderLodging(); persist();
});

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
    <ul>${list.map((s) => `<li><b>${esc(souvenirName(s.item))}</b><span>${t("{from}에서", { from: esc(nameOf(null, s.from)) })}</span><button type="button" class="ghost small" data-copy="${s.item}">${t("검색어 복사")}</button></li>`).join("")}</ul>
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
  box.innerHTML = `<b>${t("지난 {region} 여행에서 먹은 {items}", { region: regionLabel(regionKey, p.region), items: p.items.slice(0, 2).map((i) => souvenirName(i.item)).join(", ") })}</b>
    <a class="ghost small" href="${SHOP_MALL.url}" target="_blank" rel="noopener">${t("집에서 다시 주문")}</a>`;
}

/* ---------- 지도 ---------- */
// 지도 라이브러리는 일정 화면을 처음 열 때 받는다 (첫 화면을 가볍게)
let leafletLoading = null, mlLoading = null;
let lastMapViewKey = null;
let mapInteractive = false;
let mapKind = null; // "3d"(MapLibre, 지형 입체) | "2d"(Leaflet, WebGL이 없거나 3D를 못 불러올 때)
const loadScript = (src, css) => new Promise((resolve, reject) => {
  if (css) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = css; document.head.append(l); }
  const js = document.createElement("script"); js.src = src; js.onload = resolve; js.onerror = reject; document.head.append(js);
});
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return (leafletLoading ??= loadScript("vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css").catch((e) => { leafletLoading = null; throw e; }));
}
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  return (mlLoading ??= loadScript("vendor/maplibre/maplibre-gl.js", "vendor/maplibre/maplibre-gl.css").catch((e) => { mlLoading = null; throw e; }));
}
const hasWebGL = (() => { let ok = null; return () => { if (ok === null) { try { const c = document.createElement("canvas"); ok = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { ok = false; } } return ok; }; })();

// 지도에 그릴 것: 출발점, 숙소, 방문지(번호), 선
function mapModel(day) {
  const L0 = lodgingForDay(trip, day.dayIdx) || (day.dayIdx >= state.input.days - 1 ? null : trip.lodging);
  const marks = [{ lat: day.start.lat, lng: day.start.lng, label: t(day.start.name.startsWith("숙소") ? "숙" : "출"), base: true, tip: startName(day.start, trip.lodging) }];
  if (L0 && !day.start.name.startsWith("숙소")) marks.push({ lat: L0.lat, lng: L0.lng, label: t("숙"), base: true, tip: t("숙소 · {name}", { name: lodgingName(L0) }) });
  day.items.forEach((it, i) => marks.push({ lat: it.place.lat, lng: it.place.lng, label: String(i + 1), color: CAT[it.place.cat].color, tip: `${fmt(it.start)} ${placeName(it.place)}` }));
  const cached = routeCache.get(routeKey(day));
  const known = cached && !(cached instanceof Promise) ? cached : null;
  const line = known ? known.line : [[day.start.lat, day.start.lng], ...day.items.map((it) => [it.place.lat, it.place.lng])];
  return { marks, line, known: !!known, bounds: [...line, ...(L0 ? [[L0.lat, L0.lng]] : [])] };
}

// 번호가 서로 가리지 않게: 화면에서 32px 안에 겹치는 표시는 한데 모아 원 둘레로 펼치고, 원래 위치까지 선을 긋는다
// pts: [{x, y}] (화면 좌표) → [{dx, dy}] (펼친 만큼의 이동)
function declutter(pts, gap = 32) {
  const out = pts.map(() => ({ dx: 0, dy: 0 }));
  const seen = new Array(pts.length).fill(false);
  for (let i = 0; i < pts.length; i++) {
    if (seen[i]) continue;
    const group = [i]; seen[i] = true;
    for (let k = 0; k < group.length; k++) for (let j = 0; j < pts.length; j++) {
      if (!seen[j] && Math.hypot(pts[group[k]].x - pts[j].x, pts[group[k]].y - pts[j].y) < gap) { seen[j] = true; group.push(j); }
    }
    if (group.length < 2) continue;
    const cx = group.reduce((a, g) => a + pts[g].x, 0) / group.length, cy = group.reduce((a, g) => a + pts[g].y, 0) / group.length;
    const r = Math.max(gap * 0.75, (gap * group.length) / (2 * Math.PI)); // 이웃 표시끼리 gap만큼 떨어지는 반지름
    group.forEach((g, n) => {
      const a = -Math.PI / 2 + (2 * Math.PI * n) / group.length;
      out[g] = { dx: cx + r * Math.cos(a) - pts[g].x, dy: cy + r * Math.sin(a) - pts[g].y };
    });
  }
  // 펼친 무리끼리 다시 맞닿으면 서로 밀어낸다 (원래 자리에 있는 표시는 덜 움직인다)
  const pos = pts.map((p, i) => ({ x: p.x + out[i].dx, y: p.y + out[i].dy }));
  for (let it = 0; it < 40; it++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      let vx = pos[j].x - pos[i].x, vy = pos[j].y - pos[i].y, d = Math.hypot(vx, vy);
      if (d >= gap) continue;
      if (d < 0.01) { vx = Math.cos(i + j); vy = Math.sin(i + j); d = 1; }
      const push = (gap - d) / 2 + 0.5;
      pos[i].x -= (vx / d) * push; pos[i].y -= (vy / d) * push;
      pos[j].x += (vx / d) * push; pos[j].y += (vy / d) * push;
      moved = true;
    }
    if (!moved) break;
  }
  return pos.map((p, i) => ({ dx: p.x - pts[i].x, dy: p.y - pts[i].y }));
}
function pinEl(m) {
  const el = document.createElement("div");
  el.className = `pin3d${m.base ? " base" : ""}`;
  el.innerHTML = `<i class="stem"></i><span style="${m.color ? `--c:${m.color}` : ""}">${esc(m.label)}</span>`;
  el.title = m.tip; el.setAttribute("aria-label", m.tip);
  return el;
}
function placePin(el, dx, dy) {
  const span = el.querySelector("span"), stem = el.querySelector(".stem");
  span.style.transform = `translate(${dx}px, ${dy}px)`;
  const len = Math.hypot(dx, dy);
  stem.style.width = `${len}px`;
  stem.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  el.classList.toggle("moved", len > 1);
}

function drawMap(day) {
  if (mapKind === null) {
    if (!hasWebGL()) mapKind = "2d";
    else {
      loadMapLibre().then(() => { mapKind = "3d"; }).catch(() => { mapKind = "2d"; })
        .finally(() => { if (trip && !$("#result").hidden) drawMap(trip.days[dayIdx]); });
      return;
    }
  }
  if (mapKind === "3d") return drawMap3D(day);
  if (!window.L) {
    loadLeaflet().then(() => { if (trip && !$("#result").hidden) drawMap(trip.days[dayIdx]); }).catch(() => {});
    return;
  }
  drawMap2D(day);
}

/* 3D: OpenStreetMap 지도를 지형(AWS 공개 고도 자료, terrarium) 위에 입혀 기울여 본다. 산·계곡이 솟아 보인다 */
let ml = null, mlMarkers = [], mlModel = null;
const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
function drawMap3D(day) {
  const model = mapModel(day);
  if (!day.items.length) return;
  if (!ml) {
    ml = new maplibregl.Map({
      container: "map", attributionControl: { compact: true }, pitch: 55, bearing: -12, maxPitch: 75,
      center: [model.line[0][1], model.line[0][0]], zoom: 11,
      dragPan: false, dragRotate: false, scrollZoom: false, touchZoomRotate: false, touchPitch: false, keyboard: false, doubleClickZoom: false, boxZoom: false,
      style: {
        version: 8,
        sources: {
          osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" },
          dem: { type: "raster-dem", tiles: [TERRAIN_TILES], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: "지형: Mapzen/AWS Terrain Tiles" },
          hill: { type: "raster-dem", tiles: [TERRAIN_TILES], tileSize: 256, maxzoom: 14, encoding: "terrarium" },
          // 3D 건물: OpenFreeMap(무료, 키 없음)의 OpenMapTiles 벡터 지도 building 층 (render_height·render_min_height, m)
          ofm: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenFreeMap © OpenMapTiles" },
        },
        layers: [
          { id: "osm", type: "raster", source: "osm" },
          { id: "hillshade", type: "hillshade", source: "hill", paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#3a4a40" } },
          // 시내를 가까이 볼 때(13~) 건물이 솟아오른다. 높이가 없는 건물은 2층(6m)으로 본다
          { id: "buildings-3d", type: "fill-extrusion", source: "ofm", "source-layer": "building", minzoom: 13, filter: ["!=", ["get", "hide_3d"], true],
            paint: {
              "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, "#e6e0d4", 30, "#d4cbbb", 100, "#bfb4a1"],
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, 0.85],
            } },
        ],
        terrain: { source: "dem", exaggeration: 1.4 },
        sky: { "sky-color": "#bfe3f0", "horizon-color": "#e9f4f7", "sky-horizon-blend": 0.6, "atmosphere-blend": 0.5 },
      },
    });
    ml.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    ml.addControl({ onAdd: () => locateButton((ll) => { ml.flyTo({ center: [ll[1], ll[0]], zoom: 14 }); return new maplibregl.Marker({ color: "#2563eb" }).setLngLat([ll[1], ll[0]]).addTo(ml); }), onRemove() {} }, "bottom-right");
    // 건물 자료를 못 받아도(오프라인 등) 지형 지도는 그대로 보인다
    ml.on("error", (e) => console.warn("지도", e?.error?.message || e));
    ml.on("move", () => spread3D());
  }
  // 번호·시점은 바로, 경로선은 지도 스타일이 준비되면 (타일을 다 받을 때까지 기다리지 않는다)
  mlMarkers.forEach((m) => m.remove());
  // 방문지 번호가 출발·숙소 표시보다 위에 오도록 나중에 넣는다
  mlMarkers = [...model.marks].sort((a, b) => Number(!a.base) - Number(!b.base)).map((m) => {
    const el = pinEl(m);
    const mk = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([m.lng, m.lat]).addTo(ml);
    el.addEventListener("click", () => new maplibregl.Popup({ offset: 18, closeButton: false }).setLngLat([m.lng, m.lat]).setText(m.tip).addTo(ml));
    return mk;
  });
  mlModel = model;
  ml.resize();
  const viewKey = routeKey(day);
  if (lastMapViewKey !== viewKey) {
    const lats = model.bounds.map((p) => p[0]), lngs = model.bounds.map((p) => p[1]);
    // 오른쪽 아래 확대·방향 버튼, 위쪽 '지도 이동' 버튼에 번호가 가리지 않도록 여백을 둔다
    ml.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 70, bottom: 50, left: 40, right: 70 }, maxZoom: 14, pitch: 55, bearing: -12, duration: 0 });
    fit3D();
    lastMapViewKey = viewKey;
  }
  spread3D();
  if (!model.known) applyRoad(dayIdx);
  const line = () => {
    const geo = { type: "Feature", geometry: { type: "LineString", coordinates: model.line.map(([la, ln]) => [ln, la]) } };
    if (ml.getSource("route")) ml.getSource("route").setData(geo);
    else {
      ml.addSource("route", { type: "geojson", data: geo });
      ml.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 } });
      ml.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#0b5e6b", "line-width": 4.5 } });
    }
    ml.setPaintProperty("route", "line-dasharray", model.known ? [1, 0] : [1.5, 1.5]);
  };
  // 스타일 JSON만 준비되면 선을 넣을 수 있다 (타일이 다 오기를 기다리는 isStyleLoaded 대신 시도해 보고, 안 되면 style.load 때)
  const tryLine = () => { try { line(); return true; } catch { return false; } };
  if (!tryLine()) ml.once("style.load", () => { if (mlModel === model) tryLine(); });
}
// 기울인 3D 시점은 화면 가장자리 계산이 어긋나 번호가 잘릴 수 있다 → 펼친 번호까지 모두 화면 안(여백 28px)에 들 때까지 조금씩 멀리 본다
function fit3D() {
  const c = ml.getContainer(), w = c.clientWidth, h = c.clientHeight, m = 28;
  for (let k = 0; k < 6; k++) {
    const pts = mlMarkers.map((mk) => ml.project(mk.getLngLat()));
    const off = declutter(pts);
    const out = pts.some((p, i) => { const x = p.x + off[i].dx, y = p.y + off[i].dy; return x < m || y < m + 40 || x > w - m - 50 || y > h - m; });
    if (!out) return;
    ml.jumpTo({ zoom: ml.getZoom() - 0.4 });
  }
}
function spread3D() {
  if (!ml || !mlMarkers.length) return;
  const pts = mlMarkers.map((m) => ml.project(m.getLngLat()));
  declutter(pts).forEach((d, i) => placePin(mlMarkers[i].getElement(), d.dx, d.dy));
}

/* 2D (Leaflet): WebGL을 못 쓰는 기기 */
let leafletPins = [];
function drawMap2D(day) {
  if (!map) {
    map = L.map("map", { zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false });
    map.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const Ctl = L.Control.extend({ onAdd: () => locateButton((ll) => { map.setView(ll, 14); return L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(map); }) });
    new Ctl({ position: "bottomright" }).addTo(map);
    map.on("zoomend moveend", spread2D);
  }
  if (layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  const model = mapModel(day);
  if (!day.items.length) return;
  L.polyline(model.line, model.known ? { color: "#0b5e6b", weight: 5, opacity: 0.85 } : { color: "#0b5e6b", weight: 3, opacity: 0.6, dashArray: "6 6" }).addTo(layer);
  if (!model.known) applyRoad(dayIdx);
  leafletPins = [...model.marks].sort((a, b) => Number(!a.base) - Number(!b.base)).map((m, i) => {
    const el = pinEl(m);
    const mk = L.marker([m.lat, m.lng], { icon: L.divIcon({ className: "pin-holder", html: el, iconSize: [0, 0] }), zIndexOffset: m.base ? 0 : 1000 + i }).addTo(layer).bindTooltip(esc(m.tip));
    return mk;
  });
  map.invalidateSize({ pan: false });
  const viewKey = routeKey(day);
  if (lastMapViewKey !== viewKey) {
    map.fitBounds(model.bounds, { paddingTopLeft: [40, 70], paddingBottomRight: [70, 50], maxZoom: 14, animate: false });
    lastMapViewKey = viewKey;
  }
  spread2D();
}
function spread2D() {
  if (!map || !leafletPins.length) return;
  const pts = leafletPins.map((m) => map.latLngToContainerPoint(m.getLatLng()));
  declutter(pts).forEach((d, i) => { const el = leafletPins[i].getElement()?.querySelector(".pin3d"); if (el) placePin(el, d.dx, d.dy); });
}

$("#mapInteract").addEventListener("click", () => {
  if (!map && !ml) return;
  mapInteractive = !mapInteractive;
  if (ml) for (const h of [ml.dragPan, ml.touchZoomRotate, ml.keyboard, ml.dragRotate, ml.touchPitch, ml.doubleClickZoom]) h[mapInteractive ? "enable" : "disable"]();
  if (map) for (const handler of [map.dragging, map.touchZoom, map.keyboard]) handler[mapInteractive ? "enable" : "disable"]();
  document.querySelector(".map-wrap").classList.toggle("map-active", mapInteractive);
  $("#mapInteract").setAttribute("aria-pressed", String(mapInteractive));
  $("#mapInteract").textContent = t(mapInteractive ? "지도 이동 끄기" : "지도 이동 켜기");
});
// 내 위치 버튼 (3D·2D 공통). mark(ll): 지도에 표시하고 그 표시를 돌려준다
let meMarker = null;
function locateButton(mark) {
  const wrap = document.createElement("div");
  wrap.className = "maplibregl-ctrl leaflet-bar locate-wrap";
  const b = document.createElement("button");
  b.className = "locate"; b.type = "button"; b.title = t("내 위치"); b.setAttribute("aria-label", t("내 위치"));
  b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
  b.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!navigator.geolocation) return toast(t("위치를 사용할 수 없어요"));
    navigator.geolocation.getCurrentPosition((pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (meMarker) meMarker.remove();
      meMarker = mark(ll);
    }, () => toast(t("위치 권한을 허용해 주세요")), { enableHighAccuracy: true, timeout: 8000 });
  });
  wrap.append(b);
  return wrap;
}

/* ---------- 조작 ---------- */
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  dayIdx = Number(b.dataset.i); render();
});

$("#timeline").addEventListener("click", (e) => {
  const b = e.target.closest("[data-swap]"); if (!b) return;
  track("swap");
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
let guideQueue = Promise.resolve();
let guideRenderVersion = 0;
function askGuide(question, shown = question) {
  guideQueue = guideQueue.then(() => runGuide(question, shown)).catch(() => toast(t("조건에 맞는 대안을 찾지 못해 기존 일정을 유지했어요.")));
  return guideQueue;
}
function resultNote(entry) {
  if (!entry.result.changed) return "";
  if (!entry.applied) return " " + t("조건에 맞는 대안을 찾지 못해 기존 일정을 유지했어요.");
  const missed = entry.missed || [];
  return missed.length ? t(" ({names}은(는) 영업시간이나 동선이 맞지 않아 넣지 못했어요)", {names:missed.map(id=>{const p=PLACES.find(p=>p.id===id);return p?placeName(p):id;}).join(", ")}) : t(" 영업시간을 다시 확인해 일정에 반영했어요.");
}
async function renderGuideHistory() {
  const version = ++guideRenderVersion, lang = getLang();
  for (const entry of guideHistory) {
    if (!entry.translations[lang]) {
      entry.translations[lang] = (await localAI()).guideLocal(entry.q, entry.trip, entry.dayIdx, {...entry.ctx, namesEn:namesEn(), forceLang:lang}).answer;
    }
    if (version !== guideRenderVersion || lang !== getLang()) return;
    entry.node.textContent = (entry.translations[lang] || t("대화 번역을 불러오지 못했어요. 원문을 표시합니다.") + " " + entry.a) + resultNote(entry);
  }
}
async function runGuide(question, shown) {
  const activeState = state;
  const before = structuredClone(trip), beforeOpts = structuredClone(state.opts), input = {...state.input};
  const currentDay = dayIdx, requestLang = getLang();
  const history = guideHistory.map(({q,a})=>({q,a}));
  if (/[a-z]{3}/i.test(question)) await loadDataEn((u) => fetchT(u, {}, 4000));
  const ctx = {input, opts:beforeOpts, fees:feesData, lang:requestLang, forceLang:requestLang, namesEn:namesEn(), history};
  bubble("me", shown);
  const wait = bubble("ai pending", t("생각 중"));
  const module = await localAI();
  const local = true, r = module.guideLocal(question, before, currentDay, ctx);
  if(state !== activeState) {wait.remove();return;}
  let applied = false, missed = [];
  if (r.changed) {
    if (r.swap) {
      const {dayIdx:di,itemIdx:ii}=r.swap;
      const old=trip.days[di]?.items[ii];
      if(old) {
        let changed=trip;
        if(r.swap.replacementId) changed=swapItem(trip,state.input,state.opts,di,ii,r.swap.replacementId);
        else if(r.swap.cat) {
          const used=new Set(trip.days.flatMap(d=>d.items.map(i=>i.id)));
          const alternatives=PLACES.filter(p=>p.cat===r.swap.cat && !used.has(p.id) && !(state.opts.exclude||[]).includes(p.id) && p.region===old.place.region)
            .sort((a,b)=>distKm(a,old.place)-distKm(b,old.place));
          for(const p of alternatives) {changed=swapItem(trip,state.input,state.opts,di,ii,p.id);if(changed!==trip)break;}
        } else changed=swapItem(trip,state.input,state.opts,di,ii);
        if(changed.days[di]?.items[ii] && changed.days[di].items[ii].id!==old.id) {
          state.opts.exclude=[...new Set([...(state.opts.exclude||[]),old.id])];trip=changed;dayIdx=di;applied=true;render();persist();applyRoad(di);
        }
      }
    } else if (Number.isInteger(r.targetDay) && r.add?.length) {
      const changed = addPlacesToDay(trip, state.input, state.opts, r.targetDay, r.add);
      applied = changed !== trip;
      if (applied) { trip=changed; dayIdx=r.targetDay; render(); persist(); applyRoad(dayIdx); }
      missed = r.add.filter(id=>!trip.days[r.targetDay]?.items.some(i=>i.id===id));
    } else {
      const o=state.opts,uniq=a=>[...new Set(a)];
      o.exclude=uniq([...(o.exclude||[]),...(r.remove||[])]).filter(id=>!(r.add||[]).includes(id));
      o.must=uniq([...(o.must||[]),...(r.add||[])]);
      if(r.prefer)o.prefer=r.prefer;if(r.avoid)o.avoid=r.avoid;
      if(r.indoor==="on")o.indoor=true;else if(r.indoor==="off"){o.indoor=false;o.rainDays=[];}
      if(r.lessWalk==="on")o.lessWalk=true;else if(r.lessWalk==="off")o.lessWalk=false;
      if(r.pace&&r.pace!=="keep")o.pace=r.pace;
      rebuild();
      applied=JSON.stringify(before.days.map(d=>d.items.map(i=>[i.id,i.start,i.end])))!==JSON.stringify(trip.days.map(d=>d.items.map(i=>[i.id,i.start,i.end])));
      const placed=new Set(trip.days.flatMap(d=>d.items.map(i=>i.id)));
      missed=(r.add||[]).filter(id=>!placed.has(id));
    }
  }
  // 생각하는 모습: 무엇을 확인하는지 보여 준 뒤 답을 한 글자씩 쓴다
  for (const step of [t("질문을 이해하는 중…"), t("일정과 운영시간을 확인하는 중…")]) { wait.textContent = step; await sleep(reduceMotion() ? 80 : 450); }
  wait.classList.remove("pending");
  guideHistory.push({q:question,a:r.answer,local,trip:before,dayIdx:currentDay,ctx,result:r,applied,missed,node:wait,translations:{[requestLang]:r.answer}});
  await renderGuideHistory();
  await typeOut(wait);
}
async function typeOut(node) {
  const full = node.textContent;
  if (reduceMotion() || full.length < 2) return;
  node.classList.add("typing");
  const step = Math.max(1, Math.round(full.length / 90)); // 길어도 2초 안팎
  let shown = full;
  for (let i = 0; i <= full.length; i += step) {
    if (node.textContent !== shown) break; // 그사이 화면 언어가 바뀌어 다른 글이 들어옴
    shown = full.slice(0, i);
    node.textContent = shown;
    $("#guideLog").scrollTop = $("#guideLog").scrollHeight;
    await sleep(18);
  }
  if (node.textContent === shown) node.textContent = full;
  node.classList.remove("typing");
}
$("#askForm").addEventListener("submit", (e) => {
  track("guide_ask");
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
// 말 해석기(가이드 지식 자료 포함 약 70KB)는 첫 화면이 뜨자마자 뒤에서 받아 둔다. 말하거나 쓰는 동안 다 받아져 "만들기"를 누르면 바로 시작
let voiceMod = null;
const voiceParser = () => (voiceMod ??= import("./voice-parse.js"));
setTimeout(() => voiceParser().catch(() => { voiceMod = null; }), 0);
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
$("#aiStart").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#aiStartInput").value.trim(); if (!text) return;
  const btn = $("#aiStart button[type=submit]"); btn.disabled = true; btn.textContent = "…";
  const { parseSpoken } = await voiceParser();
  const r = parseSpoken(text, todayStr());
  btn.disabled = false; btn.textContent = t("만들기");
  // 말한 조건을 폼에 옮기고(폼은 "직접 골라서 만들기"에 접혀 있다), 폼에 없는 조건(인원·속도)은 일정 만들 때 넘긴다
  fillForm(r.input);
  document.querySelectorAll('.chips[data-name="access"] button').forEach((b) => b.classList.toggle("on", r.access.includes(b.dataset.v)));
  if (r.start) setStart({ name: r.start.name, nameEn: r.start.nameEn, lat: r.start.lat, lng: r.start.lng });
  if (r.startTime) { store.set("startTime", r.startTime); $("#startTime").value = r.startTime; }
  pendingVoice = { people: r.people, pace: r.pace, lessWalk: r.lessWalk, heard: r.heard, said: r.said };
  track("voice_plan");
  $("#form").requestSubmit();
});

/* ---------- 말하기 (음성 인식) ----------
   - 웹(크롬·삼성 인터넷·사파리): 브라우저 음성 인식(SpeechRecognition). 말하는 동안 글자가 입력칸에 보이고, 말이 끝나면 바로 일정을 만든다
   - 안드로이드 앱: 웹뷰에는 음성 인식이 없어서 앱의 기본 음성 인식(OhneulApp.startVoice)을 부르고 window.__voiceResult로 받는다
   - 둘 다 없거나 인터넷이 없으면 마이크를 숨기고 글로 쓰게 한다 */
let pendingVoice = null;
const VOICE_LANG = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" };
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const nativeVoice = () => !!(window.OhneulApp && window.OhneulApp.startVoice && (!window.OhneulApp.hasVoice || window.OhneulApp.hasVoice()));
const canVoice = () => navigator.onLine !== false && (nativeVoice() || !!SR);
let listening = null; // { button, input, done }
function listen(button, input, done) {
  if (listening) { stopListening(); return; }
  if (!canVoice()) return toast(t("이 기기에서는 음성 인식을 쓸 수 없어요 · 글로 써 주세요"));
  listening = { button, input, done };
  button.setAttribute("aria-pressed", "true");
  if (button === $("#micBtn")) $("#voiceHint").textContent = t("듣고 있어요… 말이 끝나면 일정을 만들어요");
  if (nativeVoice()) { window.OhneulApp.startVoice(VOICE_LANG[getLang()] || "ko-KR"); return; }
  const rec = new SR();
  rec.lang = VOICE_LANG[getLang()] || "ko-KR";
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = "";
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
    }
    input.value = (finalText + interim).trim();
  };
  rec.onerror = (ev) => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") toast(t("마이크 권한을 허용해 주세요")); else if (ev.error === "network") toast(t("음성 인식은 인터넷이 필요해요")); };
  rec.onend = () => voiceDone(input.value.trim());
  listening.rec = rec;
  try { rec.start(); } catch { voiceDone(""); }
}
function stopListening() { try { listening?.rec?.stop(); } catch { /* 이미 끝남 */ } if (listening && !listening.rec) voiceDone(""); }
function voiceDone(text) {
  const l = listening; listening = null;
  if (!l) return;
  l.button.setAttribute("aria-pressed", "false");
  if (l.button === $("#micBtn")) $("#voiceHint").textContent = t("마이크를 누르고 여행을 말해 보세요");
  if (text) { l.input.value = text; l.done(); }
}
// 안드로이드 앱이 부른다: 인식한 글(취소·실패면 빈 값)
window.__voiceResult = (text) => voiceDone(String(text || "").trim());
function setupMics() {
  const ok = canVoice();
  for (const id of ["micBtn", "askMic"]) { const b = $("#" + id); if (b) b.hidden = !ok; }
  if (!ok) $("#voiceHint").textContent = t("가고 싶은 여행을 글로 써 주세요");
}
$("#micBtn").addEventListener("click", () => listen($("#micBtn"), $("#aiStartInput"), () => $("#aiStart").requestSubmit()));
$("#askMic")?.addEventListener("click", () => listen($("#askMic"), $("#askInput"), () => $("#askForm").requestSubmit()));
window.addEventListener("online", setupMics);
window.addEventListener("offline", setupMics);
setupMics();

// 알아들은 조건: 결과 화면 위에 칩으로 보여 주고, 누르면 그 조건을 고칠 수 있게 폼을 연다
const WHO_KO = { solo: "혼자", couple: "연인·친구", family: "아이와", parents: "부모님과", pet: "반려동물과" };
const MOVE_KO = { car: "자동차", taxi: "택시", transit: "대중교통·도보" };
const LIKE_KO = { sea: "바다", cafe: "카페", food: "맛집", culture: "역사·문화", nature: "자연·산책" };
const DAYS_KO = { 1: "당일", 2: "1박 2일", 3: "2박 3일", 4: "3박 4일", 5: "4박 5일" };
function heardLabel(h) {
  const inp = state.input;
  switch (h.key) {
    case "region": return (inp.route || [inp.region]).map((r) => regionLabel(r, REGIONS[r].label)).join(" → ");
    case "date": return h.ko ? dateLabel(inp.date) : t("날짜 못 들음 · {d}", { d: dateLabel(inp.date) });
    case "days": return t(DAYS_KO[inp.days]);
    case "who": return t(WHO_KO[inp.who]);
    case "people": { const [a, k] = h.ko.split(":").map(Number); return k ? t("어른 {a} · 아이 {k}", { a, k }) : t("어른 {a}", { a }); }
    case "move": return t(MOVE_KO[inp.move]);
    case "likes": return inp.likes.map((l) => t(LIKE_KO[l])).join(" · ");
    case "access": return t(h.ko === "wheelchair" ? "♿ 휠체어" : "👶 유모차");
    case "start": return t("{name}에서 출발", { name: isForeign() ? (ORIGINS.find((o) => o.name === h.ko)?.nameEn || h.ko) : h.ko });
    case "time": return t("{t} 출발", { t: h.ko });
    case "pace": return t(h.ko === "relaxed" ? "여유롭게" : "더 알차게");
    case "walk": return t("덜 걷고 싶어요");
    default: return h.ko;
  }
}
function renderHeard() {
  const box = $("#heard"); if (!box) return;
  if (!state.heard) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<p class="said">🎤 “${esc(state.said || "")}”</p>
    <div class="chips">${state.heard.map((h) => `<button type="button" class="${h.key === "date" && !h.ko ? "miss" : ""}" data-heard="${h.key}">${esc(heardLabel(h))}</button>`).join("")}</div>
    <div class="acts"><button class="ghost small" type="button" id="speakAgain">${t("다시 말하기")}</button><button class="ghost small" type="button" data-heard="edit">${t("직접 고치기")}</button></div>`;
}
document.addEventListener("click", (e) => {
  const h = e.target.closest("[data-heard]");
  if (h) { fillForm(state.input); $("#manual").open = true; show("setup"); setTimeout(() => $("#manual").scrollIntoView({ behavior: "smooth", block: "start" }), 60); return; }
  if (e.target.id === "speakAgain") { show("setup"); $("#aiStartInput").value = ""; if (canVoice()) listen($("#micBtn"), $("#aiStartInput"), () => $("#aiStart").requestSubmit()); }
});

/* ---------- 공유 / 캘린더 ---------- */
$("#shareBtn").addEventListener("click", async () => {
  track("share");
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: t("강원 여행 일정"), url });
    else { await navigator.clipboard.writeText(url); toast(t("링크를 복사했어요")); }
  } catch {}
});

// 캘린더 파일 규칙: 쉼표·세미콜론·역슬래시는 앞에 역슬래시
const icsText = (t) => String(t).replace(/[\\;,]/g, (c) => "\\" + c);
/* ---------- 캘린더 저장 ----------
   - 안드로이드 앱: 앱이 휴대폰 캘린더에 바로 넣는다 (window.OhneulApp, MainActivity.java)
   - 브라우저: .ics 파일을 받는다 (열면 캘린더 앱이 "추가"를 띄운다. 아이폰은 다운로드에서 열기)
   파일 이름은 영문: 크롬은 한글 파일 이름을 버리고 "download"(확장자 없음)로 저장해 캘린더 파일로 열리지 않았다
   시각은 UTC로 적는다: 한국 시간대(TZID) 정의를 모르는 캘린더도 시간이 어긋나지 않게 */
const kstMs = (ds, min) => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d, 0, min) - 9 * 3600e3; };
function calendarEvents() {
  return trip.days.flatMap((d) => d.items.map((it, i) => ({
    uid: `${d.date}-${i}-${it.id}@ohneul-gangwon`,
    title: placeName(it.place),
    location: it.place.name,
    description: t("강원 여행 일정"),
    start: kstMs(d.date, it.start), end: kstMs(d.date, it.end),
    lat: it.place.lat, lng: it.place.lng,
  })));
}
function buildICS(events) {
  const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  // 한 줄은 75바이트까지 (RFC 5545). 한글은 3바이트라 이름이 길면 줄을 접는다
  const fold = (line) => {
    const out = []; let cur = "", bytes = 0;
    for (const ch of line) {
      const b = new TextEncoder().encode(ch).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join("\r\n ");
  };
  const now = utc(Date.now());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ohneul-gangwon//KO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${now}`, `DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`,
    `SUMMARY:${icsText(e.title)}`, `LOCATION:${icsText(e.location)}`, `DESCRIPTION:${icsText(e.description)}`, `GEO:${e.lat};${e.lng}`, "END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
window.__calendarDone = (res) => {
  const [kind, added, total] = String(res).split(":");
  if (kind === "ok") toast(Number(added) ? t("캘린더에 일정 {n}개를 넣었어요", { n: added }) : Number(total) ? t("이미 캘린더에 있는 일정이에요") : t("캘린더에 넣지 못했어요"));
  else toast({ denied: t("캘린더 권한을 허용해 주세요"), nocal: t("일정을 넣을 캘린더가 없어요") }[kind] || t("캘린더에 넣지 못했어요"));
};
$("#icsBtn").addEventListener("click", () => {
  track("calendar");
  const events = calendarEvents();
  if (window.OhneulApp?.addToCalendar) { window.OhneulApp.addToCalendar(JSON.stringify(events)); return; }
  const ics = buildICS(events);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  a.download = `gangwon-trip_${state.input.date}.ics`;
  document.body.append(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 4000);
  toast(t("캘린더 파일을 받았어요. 파일을 열면 캘린더에 추가돼요"));
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


// 오프라인 표시
function updateOnline() { document.body.classList.toggle("offline", !navigator.onLine); }
addEventListener("online", updateOnline); addEventListener("offline", updateOnline); updateOnline();

/* ---------- 언어 전환 (한국어 / EN / 日本語 / 中文) ---------- */
async function switchLang(l) {
  setLang(l);
  track("lang", l);
  await loadLang((u) => fetchT(u, {}, 4000));
  applyStatic();
  heroCaption();
  renderStartRow();
  renderRouteRow();
  if (trip && !$("#result").hidden) render();
  renderPast();
  $("#mapInteract").textContent = t(mapInteractive ? "지도 이동 끄기" : "지도 이동 켜기");
  await renderGuideHistory();
}
document.querySelector(".lang").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lang]");
  if (b && b.dataset.lang !== getLang()) switchLang(b.dataset.lang);
});
// 첫 화면 고정 문구는 index.html 끝의 static-i18n이 이미 그 언어로 바꿔 두었다. 일본어·중국어는 표를 받기 전에 다시 바꾸면 한국어로 돌아가므로 건너뛴다
if (getLang() === "ko" || getLang() === "en") applyStatic();
await loadLang((u) => fetchT(u, {}, 4000)); // 외국어 화면이면 그 언어 자료(일본어·중국어 문구, 장소 이름)를 받은 뒤
if (getLang() === "ja" || getLang() === "zh") applyStatic();

function openSnapshot(saved, extra = {}) {
  restoredFromLink = true;
  state = { input: saved.input, opts: { rainDays: [], exclude: [], prefer: [], avoid: [], ...saved.opts }, ...extra };
  registerCustom(state.opts);
  trip = planTrip(state.input, state.opts);
  dayIdx = 0;
  show("result"); render();
  trip.days.forEach((_, i) => applyRoad(i));
  loadWeather();
}
(function boot() {
  const fromHash = location.hash.length > 1 ? decodeState(location.hash.slice(1)) : null;
  const saved = fromHash || null;
  if (saved && saved.input && PLACES.length) {
    openSnapshot(saved);
  } else {
    const last = store.get("lastTrip");
    if (last?.input) fillForm({ ...last.input, date: last.input.date < $("#date").min ? tomorrow() : last.input.date });
  }
})();

renderPast();
renderSaved();
renderStartRow();

// 서버 없이 파일만 올린 주소(GitHub Pages 등)에서는 가게 등록이 안 되므로 링크를 숨긴다
// 예약·후기·가게 등록은 앱 서버(server.mjs)가 있어야 동작한다. GitHub Pages·안드로이드 앱처럼 서버가 없으면 그 버튼들을 숨긴다
// (needs-server 클래스: 기본은 숨김, 서버가 응답하면 body.has-server로 보인다)
fetchT("api/shops?region=gangneung", {}, 3000)
  .then((r) => { if (r.ok) document.body.classList.add("has-server"); })
  .catch(() => {});

// 오프라인용 파일 받기(지도 엔진 1MB 포함)는 첫 화면과 첫 일정이 다 뜬 뒤에 한다
if ("serviceWorker" in navigator) {
  const reg = () => setTimeout(() => navigator.serviceWorker.register("sw.js").catch(() => {}), 4000);
  if (document.readyState === "complete") reg(); else addEventListener("load", reg, { once: true });
}
// 첫 화면을 그린 뒤 한가할 때 무료 간단 모드를 미리 받아 둔다 (질문할 때 바로 답하게)


// Directory links use the same validated planner IDs and current itinerary.
const directoryPlace = new URLSearchParams(location.search).get('addPlace');
if(directoryPlace && PLACES.some(p=>p.id===directoryPlace)) {
  const p=PLACES.find(p=>p.id===directoryPlace);
  if(!state || !trip) {
    const last=store.get('lastTrip');
    if(last?.input) {state={input:{...last.input,date:last.input.date<tomorrow()?tomorrow():last.input.date},opts:{rainDays:[],exclude:[],...last.opts}};registerCustom(state.opts);trip=planTrip(state.input,state.opts);show('result');render();}
    else {fillForm({region:p.region,date:tomorrow(),days:2,who:'couple',likes:[p.cat],move:'car'});$('#form').requestSubmit();}
  }
  history.replaceState(null,'',location.pathname+location.hash);
  askGuide(`${p.name} 넣어줘`);
}

// 탐색 목록의 관광공사 장소 넣기 (앱이 검토하지 않은 곳): 가장 가까운 날에 넣고, 못 넣으면 이유를 알려 준다
const directoryAdd = new URLSearchParams(location.search).get("addDir");
if (directoryAdd) {
  history.replaceState(null, "", location.pathname + location.hash);
  fetchT("directory.json", {}, 8000).then((r) => r.json()).then((d) => {
    const raw = d.places.find((x) => String(x.id) === directoryAdd);
    // 앱이 이미 검토한 같은 장소(이름 같고 1.5km 안)가 있으면 그것을 쓴다
    const same = raw && PLACES.find((x) => !x.unverified && x.name.replace(/\s/g, "") === raw.name.replace(/\s/g, "") && distKm(x, raw) < 1.5);
    const p = same || toPlannerPlace(raw);
    if (!p) return toast(t("이 장소는 일정에 넣을 수 없어요 (숙박이거나 앱 지역에서 너무 멀어요)"));
    if (!state || !trip) {
      fillForm({ region: p.region, date: tomorrow(), days: 2, who: "couple", likes: [p.cat === "food" ? "food" : p.cat], move: "car" });
      $("#form").requestSubmit();
    }
    if (p.unverified) state.opts.custom = [...(state.opts.custom || []).filter((x) => x.id !== p.id), p];
    registerCustom(state.opts);
    // 그 장소와 가장 가까운 날부터 넣어 본다
    const order = trip.days.map((dd, i) => [i, Math.min(...dd.items.map((it) => distKm(it.place, p)), 999)]).sort((a, b) => a[1] - b[1]).map(([i]) => i);
    for (const di of order) {
      const changed = addPlacesToDay(trip, state.input, state.opts, di, [p.id]);
      if (changed !== trip) { trip = changed; dayIdx = di; state.opts.keep = trip.days.map((dd) => dd.items.map((it) => it.id)); render(); persist(); applyRoad(di); track("add_place"); return toast(t("{name}을(를) {n}일차에 넣었어요", { name: p.name, n: di + 1 })); }
    }
    toast(t("{name}은(는) 이번 일정의 권역·영업시간에 맞지 않아 넣지 못했어요", { name: p.name }));
  }).catch(() => toast(t("탐색 목록을 불러오지 못했어요")));
}
