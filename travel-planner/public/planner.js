// 일정 생성 엔진: 검증된 장소 데이터 + 영업시간/휴무/이동시간 제약을 모두 지키는 일정만 만든다.
import { PLACES, AREAS, REGIONS, FESTIVALS, LODGING, LODGING_TYPES, BENEFITS } from "./data.js";

const LUNCH = [toMin("11:30"), toMin("14:20")];
const DINNER = [toMin("17:30"), toMin("19:30")];
const PACE_LIMIT = { relaxed: 3, normal: 4, packed: 6 };
const MAX_WAIT = 30;

export function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function fmt(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// 차로 다니는 이동수단 (자동차·택시): 같은 도로 시간, 동선 반경
export const drives = (move) => move === "car" || move === "taxi";

// 직선거리 × 도로 보정계수로 실제 이동시간 추정
// 자동차는 주차·출발 준비 8분, 택시는 부르고 기다리는 4분을 더한다
export function travel(a, b, move) {
  const road = distanceKm(a, b) * 1.35;
  if (road < 0.05) return { min: 0, mode: "same", km: 0 };
  if (road <= 1.2) return { min: round5(road / 4.2 * 60), mode: "walk", km: road };
  // 시내 구간은 느리고, 먼 거리는 국도·고속도로 속도
  // 먼 거리(60km 넘음, 예: 서울에서 출발): 자동차는 고속도로 85km/h, 그 밖(택시·대중교통)은 KTX·고속버스 80km/h + 타고 내리는 40분
  if (road > 60) {
    if (move === "car") return { min: round5(15 / 30 * 60 + (road - 15) / 85 * 60 + 8), mode: "car", km: road };
    return { min: round5(road / 80 * 60 + 40), mode: "bus", km: road };
  }
  if (drives(move)) {
    const city = Math.min(road, 15), open = Math.max(0, road - 15);
    return { min: round5(city / 30 * 60 + open / 70 * 60 + (move === "taxi" ? 4 : 8)), mode: move, km: road };
  }
  const city = Math.min(road, 10), open = Math.max(0, road - 10);
  return { min: round5(city / 18 * 60 + open / 45 * 60 + (open ? 25 : 15)), mode: "bus", km: road };
}
const round5 = (m) => Math.max(5, Math.round(m / 5) * 5);

export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// 정기 휴무 + 매월 특정일 + n번째 요일 + 기간 휴장
function closedOn(p, dateStr) {
  const wd = weekdayOf(dateStr);
  const day = Number(dateStr.split("-")[2]);
  if ((p.closed || []).includes(wd)) return true;
  if ((p.closedMonthDays || []).includes(day)) return true;
  if ((p.closedNth || []).some(([w, n]) => w === wd && Math.ceil(day / 7) === n)) return true;
  if ((p.closedRanges || []).some(([a, b]) => dateStr >= a && dateStr <= b)) return true;
  const md = dateStr.slice(5); // 해마다 같은 기간 휴장 ["MM-DD", "MM-DD"]
  if ((p.closedYearly || []).some(([a, b]) => md >= a && md <= b)) return true;
  if (p.start && (dateStr < p.start || dateStr > p.end)) return true; // 축제 기간 밖
  return false;
}
function isOpenDay(p, dateStr) {
  return !closedOn(p, dateStr);
}

const regionOf = (input) => input.region || "gangneung";
// 일정이 길어 권역 안 장소가 모자랄 때 이어서 갈 수 있는 이웃 권역
const NEIGHBORS = {
  gangneung: ["pyeongchang", "seorak"],
  seorak: ["gangneung", "chuncheon"],
  chuncheon: ["wonju", "seorak"],
  pyeongchang: ["gangneung", "wonju"],
  wonju: ["pyeongchang", "chuncheon"],
};
const inScope = (input, region) => region === regionOf(input) || (input.days > 1 && NEIGHBORS[regionOf(input)].includes(region));
export const baseOf = (input) => REGIONS[regionOf(input)].base;

// 그 권역의 장소 + 그날 열리는 확정 축제
function candidates(input, opts = {}) {
  const r = regionOf(input);
  const fests = FESTIVALS.filter((f) => f.start && inScope(input, f.region)).map((f) => ({
    ...f, cat: "festival", closed: [], indoor: false, walk: 2, pop: 3, tags: ["kids", "senior"],
  }));
  // 반려동물 동행: 목록에 있는 곳(pet) + 확인은 안 됐지만 야외인 자연·바다(카드에 "동반 확인 필요")만. 실내·식당·카페·문화시설은 목록에 있을 때만
  // 반려동물 동행 전용 장소(petOnly)는 반려동물 동행일 때만 쓴다
  const okWho = (p) => input.who === "pet" ? p.pet || (!p.indoor && !p.multi && (p.cat === "nature" || p.cat === "sea")) : !p.petOnly;
  // 휠체어·유모차: 오래 걷거나 산길인 곳(walk 3)은 빼고, 휠체어는 무장애 정보 없이 걷기가 있는 곳(walk 2)도 뺀다
  const acc = opts.access || [];
  const okAccess = (p) => !acc.length || p.cat === "festival" || (p.walk < 3 && !(acc.includes("wheelchair") && p.walk === 2 && !p.access?.ramp));
  const ok = (p) => okWho(p) && okAccess(p);
  return [...PLACES.filter((p) => inScope(input, p.region) && ok(p)), ...fests];
}

// 여행 기간과 겹치는 강원 축제 (확정 + 예정)
export function festivalsDuring(input) {
  const first = input.date, last = addDays(input.date, input.days - 1);
  const months = new Set([Number(first.split("-")[1]), Number(last.split("-")[1])]);
  return FESTIVALS.filter((f) => f.start ? !(f.end < first || f.start > last) : f.months.some((m) => months.has(m)))
    .map((f) => ({ ...f, here: f.region === regionOf(input), confirmed: !!f.start }));
}

// 그날의 실제 운영시간 (계절·요일별 차이 반영)
export function hoursFor(p, dateStr) {
  const month = Number(dateStr.split("-")[1]);
  const wd = weekdayOf(dateStr);
  const season = (p.seasons || []).find((s) => s.months.includes(month));
  let [open, close] = season ? season.hours : p.hours;
  if (p.byDay && p.byDay[wd]) [open, close] = p.byDay[wd];
  const lastEntry = season ? season.lastEntry : p.lastEntry;
  return {
    closedToday: closedOn(p, dateStr),
    open: toMin(open), close: toMin(close),
    lastEntry: lastEntry ? toMin(lastEntry) : null,
    breaks: (p.breaks || []).map(([a, b]) => [toMin(a), toMin(b)]),
  };
}

// start~finish 방문이 운영시간 안에 들어가는지
export function fitsHours(h, start, finish) {
  if (h.closedToday) return false;
  if (start < h.open || finish > h.close) return false;
  if (h.lastEntry !== null && start > h.lastEntry) return false;
  return !h.breaks.some(([a, b]) => start < b && finish > a);
}

// 사용자 조건에 따른 장소 점수
function baseScore(p, input, opts, rain) {
  let s = p.pop;
  if (p.cat === "festival") s += 10; // 여행 날짜에 열리는 축제는 최우선
  if (p.region !== regionOf(input)) s -= 5; // 고른 권역 우선
  if ((opts.must || []).includes(p.id)) s += 8; // AI 가이드에게 넣어 달라고 한 곳
  const likes = input.likes || [];
  if (likes.includes(p.cat)) s += 3;
  if ((opts.prefer || []).includes(p.cat)) s += 2.5;
  if ((opts.avoid || []).includes(p.cat)) s -= 6;

  if (input.who === "family") { if (p.tags.includes("kids")) s += 1.5; if (p.walk === 3) s -= 3; }
  if (input.who === "parents") { if (p.tags.includes("senior")) s += 1.5; if (p.walk >= 2) s -= 1; if (p.walk === 3) s -= 4; }
  if (input.who === "couple" && (p.cat === "cafe" || p.tags.includes("night"))) s += 0.5;
  if (input.who === "pet") s += p.pet ? 3 : -2; // 동반 가능이 확인된 곳 우선
  const acc = opts.access || [];
  if (acc.length && p.access) s += (p.access.ramp ? 2 : 0) + (p.access.toilet ? 1 : 0) + (acc.includes("wheelchair") && p.access.wheel ? 1 : 0) + (acc.includes("stroller") && (p.access.stroller || p.access.nursing) ? 1 : 0);
  else if (acc.length && p.cat !== "festival") s -= 1; // 무장애 정보가 없는 곳은 뒤로

  if (opts.lessWalk) { if (p.walk === 3) s -= 5; else if (p.walk === 2) s -= 1; }
  if (rain || opts.indoor) {
    if (p.indoor) s += 3;
    else if (p.cat === "sea" || p.cat === "nature") s -= 4;
    else s -= 2;
  }
  return s;
}

// 당일치기는 귀가를 생각해 19:30까지, 숙박하는 날은 밤 코스까지 21:00, 마지막 날은 18:00까지
function dayWindow(dayIdx, totalDays) {
  const start = toMin("10:00");
  let end = toMin("21:00");
  if (totalDays === 1) end = toMin("19:30");
  else if (dayIdx === totalDays - 1) end = toMin("18:00");
  return { start, end };
}

// 하루의 중심 지역 선택: 아직 안 간 곳 중 점수 높은 장소가 몰린 지역
function pickAnchors(input, opts, rain, used, usedAreas, dateStr, from) {
  const ranked = [];
  const pool = candidates(input, opts);
  const BASE = from || baseOf(input);
  for (const [key, area] of Object.entries(AREAS)) {
    if (!inScope(input, area.region)) continue;
    const scores = pool
      .filter((p) => p.area === key && !used.has(p.id) && isOpenDay(p, dateStr) && p.cat !== "food")
      .map((p) => baseScore(p, input, opts, rain))
      .sort((a, b) => b - a)
      .slice(0, 4);
    if (scores.length < 2) continue; // 볼거리가 거의 없는 지역은 하루 중심으로 삼지 않음
    let total = scores.reduce((a, b) => a + b, 0);
    if (usedAreas.includes(key)) total -= 6;
    if (area.region !== regionOf(input)) total -= 6;
    const far = distanceKm(BASE, area);
    total -= drives(input.move) ? far * 0.2 : far * 0.4;
    ranked.push({ key, total });
  }
  ranked.sort((a, b) => b.total - a.total);
  const keys = ranked.map((r) => r.key);
  return keys.length ? keys : [Object.keys(AREAS).find((k) => AREAS[k].region === regionOf(input))];
}

function slotKind(t, hasLunch, hasDinner, end) {
  if (!hasLunch && t >= LUNCH[0] - 20 && t <= LUNCH[1]) return "lunch";
  if (!hasDinner && end >= DINNER[1] && t >= DINNER[0] - 20 && t <= DINNER[1]) return "dinner";
  return "visit";
}

function stayOf(p, opts) {
  return Math.round(p.stay * (opts.pace === "relaxed" ? 1.15 : opts.pace === "packed" ? 0.9 : 1));
}

function tryPlace(p, from, t, input, opts, end, dateStr, legMin = null) {
  const tr = travel(from, p, input.move);
  if (legMin !== null) tr.min = legMin;
  const arrive = t + tr.min;
  const h = hoursFor(p, dateStr);
  const stay = stayOf(p, opts);
  let start = Math.max(arrive, h.open);
  // 브레이크타임에 걸리면 끝난 뒤로
  for (const [a, b] of h.breaks) if (start < b && start + stay > a) start = Math.max(start, b);
  const wait = start - arrive;
  const finish = start + stay;
  if (wait > MAX_WAIT || finish > end + 15 || !fitsHours(h, start, finish)) return null;
  return { tr, start, finish, wait };
}

// 하루 일정 생성. keep: 이미 확정된 앞부분 장소 id 목록
export function planDay(input, opts, dayIdx, used, usedAreas, keep = [], exclude = new Set(), keepOnly = false, start = null) {
  const dateStr = addDays(input.date, dayIdx);
  const rain = !!(opts.rainDays || [])[dayIdx];
  const pool = candidates(input, opts);
  const byId = (id) => pool.find((p) => p.id === id);
  let anchors;
  if (keep.length && byId(keep[0])) anchors = [byId(keep[0]).area];
  else anchors = pickAnchors(input, opts, rain, used, usedAreas, dateStr, start).slice(0, 4);
  // 중심 지역 후보를 차례로 시도해 일정이 충분히 차는 곳을 고른다
  let best = null;
  for (const key of anchors) {
    const trial = new Set(used);
    const day = buildDay(input, opts, dayIdx, trial, key, keep, exclude, keepOnly, start);
    if (!best || day.items.length > best.day.items.length) best = { day, trial };
    if (day.items.length >= 3) break;
  }
  for (const id of best.trial) used.add(id);
  return best.day;
}

function buildDay(input, opts, dayIdx, used, anchorKey, keep, exclude, keepOnly, start) {
  const dateStr = addDays(input.date, dayIdx);
  const rain = !!(opts.rainDays || [])[dayIdx];
  const win = dayWindow(dayIdx, input.days), end = win.end;
  // 첫날 출발 시각을 정했으면 그 시각에 출발지를 떠난다 (06:00~12:00)
  const t0 = dayIdx === 0 && /^\d{2}:\d{2}$/.test(opts.startTime || "") ? toMin(opts.startTime) : null;
  // 06:00~18:00 (기차·버스 도착 시각으로 정한 경우 오후일 수 있다)
  const dayStart = t0 !== null && t0 >= toMin("06:00") && t0 <= toMin("18:00") ? t0 : win.start;
  const pace = opts.pace || "normal";
  const limit = PACE_LIMIT[pace];
  const pool = candidates(input, opts);
  const BASE = baseOf(input);
  const byId = (id) => pool.find((p) => p.id === id);
  const anchor = AREAS[anchorKey];

  const items = [];
  const startPt = start || BASE;
  let from = startPt, t = dayStart, hasLunch = false, hasDinner = false, nightCount = 0, visits = 0, cafes = 0, seas = 0;
  const groups = new Set();
  const cafeMax = (input.likes || []).includes("cafe") ? 2 : 1;

  const commit = (p, r, kind) => {
    items.push({ id: p.id, place: p, kind, start: r.start, end: r.finish, travelMin: r.tr.min, travelMode: r.tr.mode, km: r.tr.km });
    used.add(p.id);
    from = p; t = r.finish;
    if (kind === "lunch") hasLunch = true;
    else if (kind === "dinner") hasDinner = true;
    else visits++;
    if (p.cat === "cafe") cafes++;
    if (p.cat === "sea") seas++;
    if (p.group) groups.add(p.group);
    if (hasDinner && kind === "visit") nightCount++;
  };

  // 확정된 장소 먼저 배치 (시간 재계산)
  for (const id of keep) {
    const p = byId(id);
    if (!p) break;
    const r = tryPlace(p, from, t, input, opts, end, dateStr);
    if (!r) break;
    const kind = p.cat !== "food" ? "visit" : !hasLunch && r.start < toMin("15:00") ? "lunch" : "dinner";
    commit(p, r, kind);
  }

  for (let guard = 0; guard < (keepOnly ? 0 : 20); guard++) {
    if (t >= end - 20) break;
    const kind = slotKind(t, hasLunch, hasDinner, end);
    let nightOnly = false;
    if (kind === "visit" && visits >= limit) {
      // 방문 한도를 채워도 저녁 식사는 챙긴다
      if (!hasDinner && end >= DINNER[1] && t < DINNER[1]) { t = Math.max(t, DINNER[0] - 20); continue; }
      // 저녁 식사 후 야경 한 곳
      // 숙박하는 날(21시까지)은 밤 코스 2곳, 당일치기는 1곳
      if (hasDinner && nightCount < (end >= toMin("21:00") ? 2 : 1) && t < end - 40) nightOnly = true;
      else break;
    }
    let best = null;
    for (const p of pool) {
      if (used.has(p.id) || exclude.has(p.id) || !isOpenDay(p, dateStr)) continue;
      const isFood = p.cat === "food";
      if (kind === "visit" && isFood) continue;
      if (kind !== "visit" && !isFood) continue;
      if (p.cat === "cafe" && cafes >= cafeMax) continue;
      if (p.group && groups.has(p.group)) continue;
      if ((opts.avoid || []).includes(p.cat) && !isFood) continue;
      if (p.cat === "cafe" && items.length && items[items.length - 1].place.cat === "cafe") continue;
      if (nightOnly && !p.tags.includes("night")) continue;
      if (p.cat === "sea" && seas >= (rain ? 1 : 2)) continue;
      // 점심 시간 직전이면 너무 긴 방문은 점심을 밀어내지 않도록 제한
      if (kind === "visit" && !hasLunch && t < LUNCH[0] && t + 30 + p.stay > LUNCH[1]) continue;
      const r = tryPlace(p, from, t, input, opts, end, dateStr);
      if (!r) continue;
      // 점심을 건너뛰게 만드는 긴 방문은 점심 뒤로
      if (kind === "visit" && !hasLunch && r.start < LUNCH[1] && r.finish > LUNCH[1]) continue;
      let v = baseScore(p, input, opts, rain);
      v -= r.tr.min * (drives(input.move) ? 0.08 : 0.12);
      v -= r.wait * 0.05;
      if (kind !== "visit") v -= r.tr.min * 0.15; // 식사는 가까운 곳 우선
      const fromAnchor = distanceKm(anchor, p);
      const radius = drives(input.move) ? 6 : 4;
      if (fromAnchor > (drives(input.move) ? 30 : 20)) continue; // 하루 동선 밖
      if (fromAnchor > radius) v -= (fromAnchor - radius) * (drives(input.move) ? 1.2 : 1.5);
      if (p.cat === "cafe" && t >= toMin("14:00") && t <= toMin("17:00")) v += 1.5;
      if (p.tags.includes("night") && t >= toMin("18:30")) v += 1.5;
      if (items.length && items[items.length - 1].place.cat === p.cat) v -= 1.5;
      if (!best || v > best.v) best = { p, r, v };
    }
    if (!best) {
      if (nightOnly) break;
      if (kind !== "visit") { // 식사할 곳이 없으면 이번 끼니는 건너뜀
        if (kind === "lunch") hasLunch = true; else hasDinner = true;
        continue;
      }
      break;
    }
    commit(best.p, best.r, kind);
  }

  return { date: dateStr, dayIdx, start: startPt, weekday: weekdayOf(dateStr), rain, area: anchorKey, areaName: anchor.name, items };
}

// 숙소는 여행 내내 한 곳: 짐을 옮기지 않도록 모든 밤을 같은 숙소에서 묵는다
export function planTrip(input, opts = {}) {
  if (input.days < 2) return finalize(planDays(input, opts, null), null);
  const fixed = opts.lodgingId && LODGING.find((l) => l.id === opts.lodgingId);
  // 1차: 출발지 기준으로 일정을 짜서 여행 동선을 파악 → 동선 전체에 가장 알맞은 숙소 선택
  const lodging = fixed ? lodgingInfo(input, fixed) : chooseLodging(input, planDays(input, opts, null));
  // 2차: 둘째 날부터는 그 숙소에서 출발하도록 다시 계산
  return finalize(planDays(input, opts, lodging), lodging);
}

function planDays(input, opts, lodging) {
  const used = new Set();
  const usedAreas = [];
  const days = [];
  const home = lodging && { name: `숙소(${lodging.name})`, lat: lodging.lat, lng: lodging.lng };
  for (let d = 0; d < input.days; d++) {
    const keep = (opts.keep || [])[d] || [];
    // 첫날은 사용자가 정한 출발지(opts.start: {name, lat, lng})에서, 없으면 권역 기준점(역·터미널)에서 출발
    const start = d > 0 ? home : (validStart(opts.start) ? opts.start : null);
    const day = planDay(input, opts, d, used, usedAreas, keep, new Set(opts.exclude || []), keep.length > 0, start);
    usedAreas.push(day.area);
    if (lodging && d < input.days - 1) markReturn(day, lodging);
    days.push(day);
  }
  return days;
}

const validStart = (s) => !!s && Number.isFinite(s.lat) && Number.isFinite(s.lng) && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180 && typeof s.name === "string";

function markReturn(day, lodging) {
  const last = day.items.length ? day.items[day.items.length - 1].place : day.start;
  day.toLodgingKm = Math.round(distanceKm(last, lodging) * 10) / 10;
}

// 특정 장소만 교체: 그 앞은 유지, 다른 날은 그대로, 뒤쪽만 다시 계산
export function swapItem(trip, input, opts, dayIdx, itemIdx, replacementId = null) {
  const day = trip.days[dayIdx];
  const keep = day.items.slice(0, itemIdx).map((i) => i.id);
  if (replacementId) keep.push(replacementId);
  const used = new Set();
  trip.days.forEach((d, i) => { if (i !== dayIdx) d.items.forEach((it) => used.add(it.id)); });
  const exclude = new Set([...(opts.exclude || []), day.items[itemIdx].id]);
  const usedAreas = trip.days.filter((_, i) => i !== dayIdx).map((d) => d.area);
  const newDay = planDay(input, opts, dayIdx, used, usedAreas, keep, exclude, false, day.start);
  if (replacementId && newDay.items[itemIdx]?.id !== replacementId) return trip;
  if (trip.lodging && dayIdx < input.days - 1) markReturn(newDay, trip.lodging); // 숙소는 그대로
  const days = trip.days.slice();
  days[dayIdx] = newDay;
  return finalize(days, trip.lodging);
}

// Explicit additions are transactional and confined to the requested day.
export function addPlacesToDay(trip, input, opts, dayIdx, ids) {
  if (!trip.days[dayIdx] || !ids.length) return trip;
  const wanted = [...new Set(ids)];
  const original = trip.days[dayIdx];
  const others = trip.days.filter((_, i) => i !== dayIdx);
  if (others.some(d => d.items.some(i => wanted.includes(i.id)))) return trip;
  const missing = wanted.filter(id => !original.items.some(i => i.id === id));
  if (!missing.length) return trip;
  let best = null, bestScore = -Infinity;
  for (let at = 0; at <= original.items.length; at++) {
    const keep = [...original.items.slice(0, at).map(i => i.id), ...missing];
    const used = new Set(others.flatMap(d => d.items.map(i => i.id)));
    const day = planDay(input, {...opts, must:[...wanted, ...original.items.map(i=>i.id)]}, dayIdx, used, others.map(d=>d.area), keep, new Set(opts.exclude || []), false, original.start);
    if (!wanted.every(id => day.items.some(i=>i.id===id)) || verify([day])) continue;
    const score = day.items.filter(i => original.items.some(o=>o.id===i.id)).length * 100 - day.items.reduce((n,i)=>n+i.travelMin,0);
    if (score > bestScore) { best=day; bestScore=score; }
  }
  if (!best) return trip;
  if (trip.lodging && dayIdx < input.days - 1) markReturn(best, trip.lodging);
  const days=trip.days.slice(); days[dayIdx]=best;
  return finalize(days, trip.lodging);
}

// 맞춤 숙소: 그날 마지막 장소에서 가깝고, 동행·취향·이동수단에 맞는 숙소 지역과 종류
const WHO_TYPES = {
  solo: ["guesthouse", "business"],
  couple: ["ocean", "pension", "hanok"],
  family: ["resort", "pension"],
  parents: ["hanok", "resort", "ocean"],
  pet: ["pension", "resort"],
};
const TYPE_REASON = {
  guesthouse: "혼자 여행자와 어울리기 좋고 저렴해요",
  business: "역·터미널과 가깝고 깔끔해요",
  ocean: "창밖으로 바다·호수가 보여요",
  pension: "조용하고 바비큐를 즐기기 좋아요",
  resort: "취사·수영장 등 가족 편의시설이 있어요",
  hanok: "조용하고 온돌방이라 편안해요",
};
// 모든 밤의 "그날 마지막 장소 → 숙소 → 다음 날 첫 장소" 거리 합이 가장 작고, 동행·취향에 맞는 숙소 지역
export function chooseLodging(input, days) {
  const wanted = WHO_TYPES[input.who] || WHO_TYPES.solo;
  const legs = [];
  const regions = new Set([regionOf(input)]);
  for (let i = 0; i < days.length; i++) {
    for (const it of days[i].items) regions.add(it.place.region);
    if (i < days.length - 1) {
      const last = days[i].items.at(-1)?.place, next = days[i + 1].items[0]?.place;
      if (last) legs.push(last);
      if (next) legs.push(next);
    }
  }
  if (!legs.length) legs.push(baseOf(input));
  let best = null;
  for (const l of LODGING) {
    if (!regions.has(l.region)) continue;
    const km = legs.reduce((sum, p) => sum + distanceKm(p, l), 0) / legs.length;
    let v = -km * (drives(input.move) ? 0.25 : 0.6);
    const match = wanted.find((t) => l.types.includes(t));
    if (match) v += 6 - wanted.indexOf(match) * 1.5;
    if ((input.likes || []).includes("sea") && l.types.includes("ocean")) v += 2;
    if (input.move === "transit" && l.types.includes("business")) v += 2; // 대중교통이면 역·터미널 근처
    if (l.region === regionOf(input)) v += 3; // 고른 권역 안의 숙소 우선
    if (!best || v > best.v) best = { l, v };
  }
  return lodgingInfo(input, best.l);
}

function lodgingInfo(input, l) {
  const wanted = WHO_TYPES[input.who] || WHO_TYPES.solo;
  const type = wanted.find((t) => l.types.includes(t)) || l.types[0];
  return {
    id: l.id, name: l.name, lat: l.lat, lng: l.lng, desc: l.desc, nights: input.days - 1,
    type, typeLabel: LODGING_TYPES[type], reason: TYPE_REASON[type],
    others: l.types.filter((t) => t !== type).map((t) => LODGING_TYPES[t]),
    query: `${l.name} ${LODGING_TYPES[type]}`,
  };
}

function finalize(days, lodging = null) {
  let places = 0, moveMin = 0, walkKm = 0;
  for (const d of days) {
    for (const it of d.items) {
      places++; moveMin += it.travelMin;
      if (it.travelMode === "walk") walkKm += it.km;
      walkKm += it.place.walk * 0.4;
    }
  }
  return { days, lodging, totals: { places, moveMin, walkKm: Math.round(walkKm * 10) / 10, conflicts: verify(days) } };
}

// 영업시간·휴무·입장마감·브레이크타임 충돌 검사 (항상 0이어야 함)
export function verify(days) {
  let bad = 0;
  for (const d of days) {
    for (const it of d.items) {
      if (!fitsHours(hoursFor(it.place, d.date), it.start, it.end)) bad++;
    }
  }
  return bad;
}

// 실제 도로 이동시간(분)으로 하루 일정 시간을 다시 계산. 운영시간을 지킬 수 없으면 null
export function retimeDay(day, input, opts, legMins) {
  const { end } = dayWindow(day.dayIdx ?? 0, input.days);
  let from = day.start || baseOf(input), t = day.items.length ? day.items[0].start - day.items[0].travelMin : 0;
  const items = [];
  for (let i = 0; i < day.items.length; i++) {
    const it = day.items[i];
    const leg = it.travelMode === "walk" || it.travelMode === "same" ? it.travelMin : legMins[i];
    // 계획보다 앞당기지는 않고, 도로 사정으로 늦어질 때만 뒤로 민다
    const r = tryPlace(it.place, from, Math.max(t, it.start - leg), input, opts, end + 60, day.date, leg);
    if (!r) return null;
    items.push({ ...it, start: r.start, end: r.finish, travelMin: leg, road: drives(it.travelMode) });
    from = it.place; t = r.finish;
  }
  return { ...day, items, road: true };
}

export function summarize(days, lodging = null) {
  return finalize(days, lodging);
}

// 자연어 요청 → 조건 (AI 서버가 없을 때 쓰는 규칙 기반 해석)
// "비"는 낱말이거나, 띄어 쓰지 않아도 "비가·비와·비오면…"처럼 날씨로 쓰일 때 (갈비가·회비가·교통비 같은 낱말 끝은 제외)
export const RAIN = /(?<![가-힣])비(?![빔교슷싸행밀용])|(?<![갈국소경준노회간방여요실교학통박식입차선기무대정연관투설])비(?=가|와|오|올|온|내리|소식|예보|\s*[?？]|$)|우천|장마|소나기|태풍/;
export function parseRequestLocally(text) {
  const t = text.replace(/\s/g, "");
  const out = { prefer: [], avoid: [] };
  const has = (...w) => w.some((x) => t.includes(x));
  // "비"는 낱말일 때만 (닭갈비·비용·비빔밥은 비가 아님)
  if (RAIN.test(text) || has("우천", "실내", "추워", "더워", "바람")) out.indoor = true;
  if (has("덜걷", "걷기싫", "걷기힘", "다리", "힘들", "지쳐", "지쳤", "피곤", "무릎", "유모차", "어르신")) out.lessWalk = true;
  if (has("여유", "천천히", "느긋")) out.pace = "relaxed";
  if (has("알차", "많이", "빡빡", "더많")) out.pace = "packed";
  // "너무 빡빡해", "힘들어"처럼 일정이 벅차다는 말은 여유롭게 (빡빡하게 해 달라는 뜻이 아님)
  if (/너무(빡빡|많|바빠|힘들|촘촘)|빡빡(해|한데|하네|하다|해요)(?!줘)|벅차|힘들어|정신없/.test(t)) out.pace = "relaxed";
  const cats = { sea: ["바다", "해변"], cafe: ["카페", "커피"], food: ["맛집", "먹", "시장", "회"], culture: ["역사", "문화", "박물관", "전시", "미술"], nature: ["자연", "산책", "숲", "호수"] };
  for (const [cat, words] of Object.entries(cats)) {
    for (const w of words) {
      const i = t.indexOf(w);
      if (i < 0) continue;
      const after = t.slice(i + w.length, i + w.length + 6);
      if (/(말고|빼|싫|없이|제외|그만)/.test(after)) out.avoid.push(cat);
      else out.prefer.push(cat);
      break;
    }
  }
  return out;
}

// 이 일정으로 받을 수 있는 혜택
export function benefitsFor(trip, input) {
  const ids = new Set(trip.days.flatMap((d) => d.items.map((i) => i.id)));
  const areas = new Set(trip.days.flatMap((d) => d.items.map((i) => i.place.area)));
  const first = input.date, last = addDays(input.date, input.days - 1);
  const out = [];
  for (const b of BENEFITS) {
    if (b.kind === "place") {
      if (ids.has(b.place)) out.push({ ...b, status: "auto" });
      continue;
    }
    const inPeriod = (!b.start || last >= b.start) && (!b.end || first <= b.end);
    const where = b.areas || b.placeIds
      ? (b.areas || []).some((a) => areas.has(a)) || (b.placeIds || []).some((id) => ids.has(id))
      : b.regions.includes(input.region || "gangneung");
    if (!where) continue;
    if (!inPeriod) { out.push({ ...b, status: "closed" }); continue; }
    out.push({ ...b, status: b.unconfirmed ? "check" : "open" });
  }
  return out;
}

// 당일치기를 1박으로 바꾸면 무엇이 달라지는지
export function overnightCompare(input, opts = {}) {
  if (input.days !== 1) return null;
  const clean = { ...opts }; delete clean.keep; delete clean.lodgingId;
  const day = planTrip(input, clean);
  const two = planTrip({ ...input, days: 2 }, clean);
  const before = new Set(day.days[0].items.map((i) => i.id));
  const all = two.days.flatMap((d) => d.items);
  const added = all.filter((i) => !before.has(i.id));
  const evening = two.days[0].items.filter((i) => i.start >= toMin("18:00"));
  return {
    trip: two,
    added: added.map((i) => i.place),
    evening: evening.map((i) => ({ name: i.place.name, start: i.start, kind: i.kind })),
    endBefore: day.days[0].items.at(-1)?.end ?? null,
    endAfter: two.days[0].items.at(-1)?.end ?? null,
    lodging: two.lodging,
    festivals: festivalsDuring({ ...input, days: 2 }).filter((f) => f.confirmed && f.here && f.start > input.date),
    benefits: benefitsFor(two, { ...input, days: 2 }).filter((b) => b.status !== "closed"),
  };
}

// 다녀온 곳에서 먹은 것 → 집에서 다시 주문할 특산물
export function souvenirsFor(trip) {
  const seen = new Map();
  for (const d of trip.days) for (const i of d.items) {
    const s = i.place.souvenir;
    if (s && !seen.has(s)) seen.set(s, i.place.name);
  }
  return [...seen].map(([item, from]) => ({ item, from }));
}
