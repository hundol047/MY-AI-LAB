// 일정 생성 엔진: 검증된 장소 데이터 + 영업시간/휴무/이동시간 제약을 모두 지키는 일정만 만든다.
import { PLACES, AREAS, BASE } from "./data.js";

const LUNCH = [toMin("11:30"), toMin("13:40")];
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

// 직선거리 × 도로 보정계수로 실제 이동시간 추정
export function travel(a, b, move) {
  const road = distanceKm(a, b) * 1.35;
  if (road < 0.05) return { min: 0, mode: "same", km: 0 };
  if (road <= 1.2) return { min: round5(road / 4.2 * 60), mode: "walk", km: road };
  if (move === "car") return { min: round5(road / 35 * 60 + 8), mode: "car", km: road };
  return { min: round5(road / 18 * 60 + 15), mode: "bus", km: road };
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

function isOpenDay(p, dateStr) {
  return !p.closed.includes(weekdayOf(dateStr));
}

// 사용자 조건에 따른 장소 점수
function baseScore(p, input, opts, rain) {
  let s = p.pop;
  const likes = input.likes || [];
  if (likes.includes(p.cat)) s += 3;
  if ((opts.prefer || []).includes(p.cat)) s += 2.5;
  if ((opts.avoid || []).includes(p.cat)) s -= 6;

  if (input.who === "family") { if (p.tags.includes("kids")) s += 1.5; if (p.walk === 3) s -= 3; }
  if (input.who === "parents") { if (p.tags.includes("senior")) s += 1.5; if (p.walk >= 2) s -= 1; if (p.walk === 3) s -= 4; }
  if (input.who === "couple" && (p.cat === "cafe" || p.tags.includes("night"))) s += 0.5;

  if (opts.lessWalk) { if (p.walk === 3) s -= 5; else if (p.walk === 2) s -= 1; }
  if (rain || opts.indoor) {
    if (p.indoor) s += 3;
    else if (p.cat === "sea" || p.cat === "nature") s -= 4;
    else s -= 2;
  }
  return s;
}

function dayWindow(dayIdx, totalDays) {
  const start = totalDays > 1 && dayIdx === 0 ? toMin("11:00") : toMin("10:00");
  const end = totalDays > 1 && dayIdx === totalDays - 1 ? toMin("18:00") : toMin("20:30");
  return { start, end };
}

// 하루의 중심 지역 선택: 아직 안 간 곳 중 점수 높은 장소가 몰린 지역
function pickAnchor(input, opts, rain, used, usedAreas, dateStr) {
  let best = null;
  for (const [key, area] of Object.entries(AREAS)) {
    const scores = PLACES
      .filter((p) => p.area === key && !used.has(p.id) && isOpenDay(p, dateStr) && p.cat !== "food")
      .map((p) => baseScore(p, input, opts, rain))
      .sort((a, b) => b - a)
      .slice(0, 4);
    let total = scores.reduce((a, b) => a + b, 0);
    if (usedAreas.includes(key)) total -= 6;
    const far = distanceKm(BASE, area);
    total -= input.move === "car" ? far * 0.1 : far * 0.35;
    if (!best || total > best.total) best = { key, total };
  }
  return best.key;
}

function slotKind(t, hasLunch, hasDinner, end) {
  if (!hasLunch && t >= LUNCH[0] - 20 && t <= LUNCH[1]) return "lunch";
  if (!hasDinner && end >= DINNER[1] && t >= DINNER[0] - 20 && t <= DINNER[1]) return "dinner";
  return "visit";
}

function tryPlace(p, from, t, input, opts, end) {
  const tr = travel(from, p, input.move);
  const arrive = t + tr.min;
  const open = toMin(p.hours[0]), close = toMin(p.hours[1]);
  const start = Math.max(arrive, open);
  const wait = start - arrive;
  const stay = Math.round(p.stay * (opts.pace === "relaxed" ? 1.15 : opts.pace === "packed" ? 0.9 : 1));
  const finish = start + stay;
  if (wait > MAX_WAIT || finish > close || finish > end + 15) return null;
  return { tr, start, finish, wait };
}

// 하루 일정 생성. keep: 이미 확정된 앞부분 장소 id 목록
export function planDay(input, opts, dayIdx, used, usedAreas, keep = [], exclude = new Set(), keepOnly = false) {
  const dateStr = addDays(input.date, dayIdx);
  const rain = !!(opts.rainDays || [])[dayIdx];
  const { start: dayStart, end } = dayWindow(dayIdx, input.days);
  const pace = opts.pace || "normal";
  const limit = PACE_LIMIT[pace];

  const anchorKey = keep.length
    ? PLACES.find((p) => p.id === keep[0]).area
    : pickAnchor(input, opts, rain, used, usedAreas, dateStr);
  const anchor = AREAS[anchorKey];

  const items = [];
  let from = BASE, t = dayStart, hasLunch = false, hasDinner = false, nightDone = false, visits = 0, cafes = 0, seas = 0;
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
    if (hasDinner && kind === "visit") nightDone = true;
  };

  // 확정된 장소 먼저 배치 (시간 재계산)
  for (const id of keep) {
    const p = PLACES.find((x) => x.id === id);
    const r = tryPlace(p, from, t, input, opts, end);
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
      if (hasDinner && !nightDone && t < end - 40) nightOnly = true;
      else break;
    }
    let best = null;
    for (const p of PLACES) {
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
      const r = tryPlace(p, from, t, input, opts, end);
      if (!r) continue;
      let v = baseScore(p, input, opts, rain);
      v -= r.tr.min * (input.move === "car" ? 0.08 : 0.12);
      v -= r.wait * 0.05;
      if (kind !== "visit") v -= r.tr.min * 0.15; // 식사는 가까운 곳 우선
      const fromAnchor = distanceKm(anchor, p);
      const radius = input.move === "car" ? 7 : 4;
      if (fromAnchor > radius) v -= (fromAnchor - radius) * (input.move === "car" ? 0.5 : 1);
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

  return { date: dateStr, weekday: weekdayOf(dateStr), rain, area: anchorKey, areaName: anchor.name, items };
}

export function planTrip(input, opts = {}) {
  const used = new Set();
  const usedAreas = [];
  const days = [];
  for (let d = 0; d < input.days; d++) {
    const keep = (opts.keep || [])[d] || [];
    const day = planDay(input, opts, d, used, usedAreas, keep, new Set(opts.exclude || []), keep.length > 0);
    usedAreas.push(day.area);
    days.push(day);
  }
  return finalize(days);
}

// 특정 장소만 교체: 그 앞은 유지, 다른 날은 그대로, 뒤쪽만 다시 계산
export function swapItem(trip, input, opts, dayIdx, itemIdx) {
  const day = trip.days[dayIdx];
  const keep = day.items.slice(0, itemIdx).map((i) => i.id);
  const used = new Set();
  trip.days.forEach((d, i) => { if (i !== dayIdx) d.items.forEach((it) => used.add(it.id)); });
  const exclude = new Set([...(opts.exclude || []), day.items[itemIdx].id]);
  const usedAreas = trip.days.filter((_, i) => i !== dayIdx).map((d) => d.area);
  const newDay = planDay(input, opts, dayIdx, used, usedAreas, keep, exclude);
  const days = trip.days.slice();
  days[dayIdx] = newDay;
  return finalize(days);
}

function finalize(days) {
  let places = 0, moveMin = 0, walkKm = 0;
  for (const d of days) {
    for (const it of d.items) {
      places++; moveMin += it.travelMin;
      if (it.travelMode === "walk") walkKm += it.km;
      walkKm += it.place.walk * 0.4;
    }
  }
  return { days, totals: { places, moveMin, walkKm: Math.round(walkKm * 10) / 10, conflicts: verify(days) } };
}

// 영업시간·휴무 충돌 검사 (항상 0이어야 함)
export function verify(days) {
  let bad = 0;
  for (const d of days) {
    for (const it of d.items) {
      const p = it.place;
      if (p.closed.includes(d.weekday)) bad++;
      if (it.start < toMin(p.hours[0]) || it.end > toMin(p.hours[1])) bad++;
    }
  }
  return bad;
}

// 자연어 요청 → 조건 (AI 서버가 없을 때 쓰는 규칙 기반 해석)
export function parseRequestLocally(text) {
  const t = text.replace(/\s/g, "");
  const out = { prefer: [], avoid: [] };
  const has = (...w) => w.some((x) => t.includes(x));
  if (has("비", "우천", "실내", "추워", "더워", "바람")) out.indoor = true;
  if (has("덜걷", "걷기싫", "걷기힘", "다리", "힘들", "지쳐", "지쳤", "피곤", "무릎", "유모차", "어르신")) out.lessWalk = true;
  if (has("여유", "천천히", "느긋")) out.pace = "relaxed";
  if (has("알차", "많이", "빡빡", "더많")) out.pace = "packed";
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
