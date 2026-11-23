// 장소 3D 화면에 겹쳐 그리는 "걷기 정보"의 계산 부분 (화면 없이 시험할 수 있게 따로 둔다).
// 원칙: 확인된 것과 확인되지 않은 것을 섞지 않는다.
//  - 공식: 행정안전부 공중화장실 자료(toilets.json), 한국관광공사 무장애 조사
//  - 미확인: 오픈스트리트맵(자원봉사자가 그린 지도)의 계단·산책로·화장실 — 빠진 곳이 있을 수 있다
//  - 어림: 지형 고도 자료(약 30m 간격)로 계산한 산책로 경사 — 짧은 턱·급경사는 보이지 않는다
//  - 내가 확인: 현장에서 직접 남긴 표시 (이 기기에만 저장)
const RAD = Math.PI / 180;
export function distM(a, b) {
  const dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// 경사 등급. 장애인등편의법의 경사로 기준(1/12 = 8.3%, 권장 1/18 = 5.6%)을 따른다
// 0 완만(혼자 휠체어로 갈 만함) · 1 조금 가파름(밀어 줄 사람 필요) · 2 가파름(휠체어·보행기 어려움)
export const GRADE_EASY = 1 / 18, GRADE_MAX = 1 / 12;
export const gradeClass = (g) => (g <= GRADE_EASY ? 0 : g <= GRADE_MAX ? 1 : 2);

// 선을 step(m) 간격의 점으로 다시 나눈다 (끝점 포함)
export function resample(line, step = 20) {
  const out = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], d = distM(a, b);
    if (!(d > 0)) continue;
    let at = step - carry;
    while (at < d) { const k = at / d; out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); at += step; }
    carry = d - (at - step);
  }
  const last = line[line.length - 1];
  if (distM(out[out.length - 1], last) > 1) out.push(last);
  return out;
}

/**
 * 산책로 한 줄을 경사 등급별 조각으로 나눈다.
 * line: [[lng, lat], …], elevAt(lng, lat) → 높이(m) 또는 null(자료 없음)
 * 고도 자료가 30m 간격이라 20m마다 점을 찍고 앞뒤 한 칸씩(약 40m)의 높이 차로 경사를 구한다.
 * 돌려주는 값: [{ coords, g, pct }] — g는 0·1·2, 높이를 못 읽은 구간은 -1(모름). pct는 그 조각에서 가장 가파른 곳의 경사(%)
 */
export function slopeSegments(line, elevAt, step = 20) {
  if (!Array.isArray(line) || line.length < 2) return [];
  const pts = resample(line, step);
  if (pts.length < 2) return [];
  const z = pts.map((p) => elevAt(p[0], p[1]));
  const cls = [], grade = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = Math.max(0, i - 1), b = Math.min(pts.length - 1, i + 2);
    let run = 0; for (let k = a; k < b; k++) run += distM(pts[k], pts[k + 1]);
    const known = !(z[a] == null || z[b] == null || Number.isNaN(z[a]) || Number.isNaN(z[b]) || run < 5);
    grade.push(known ? Math.abs(z[b] - z[a]) / run : null);
    cls.push(known ? gradeClass(grade[i]) : -1);
  }
  // 같은 등급이 이어지면 한 조각으로
  const out = [];
  for (let i = 0; i < cls.length; i++) {
    const lastSeg = out[out.length - 1];
    const pct = grade[i] == null ? null : Math.round(grade[i] * 1000) / 10;
    if (lastSeg && lastSeg.g === cls[i]) { lastSeg.coords.push(pts[i + 1]); if (pct != null) lastSeg.pct = Math.max(lastSeg.pct ?? 0, pct); }
    else out.push({ g: cls[i], pct, coords: [pts[i], pts[i + 1]] });
  }
  return out;
}

// 지도 조각 경계에서 잘려 여러 번 나오는 같은 계단·화장실을 하나로 (minM 안이면 같은 것)
export function dedupe(points, minM = 15) {
  const out = [];
  for (const p of points) if (!out.some((q) => distM(q.at, p.at) < minM)) out.push(p);
  return out;
}
export function lineMid(coords) {
  const flat = Array.isArray(coords[0][0]) ? coords.flat() : coords;
  return flat[Math.floor(flat.length / 2)];
}
export function lineLengthM(coords) {
  let s = 0; for (let i = 1; i < coords.length; i++) s += distM(coords[i - 1], coords[i]);
  return s;
}

// 내가 현장에서 남긴 표시 (이 기기에만)
export const PIN_KINDS = {
  steps: { icon: "⚠️", ko: "계단·턱 있어요" },
  ramp: { icon: "✅", ko: "경사로·평지로 다닐 만해요" },
  toilet: { icon: "🚻", ko: "화장실 있어요" },
  atoilet: { icon: "♿", ko: "장애인 화장실 있어요" },
};
const PIN_KEY = "v3d:pins";
export function loadPins(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage.getItem(PIN_KEY) || "[]"); return Array.isArray(v) ? v.filter((p) => PIN_KINDS[p.kind] && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : []; } catch { return []; }
}
export function savePins(pins, storage = globalThis.localStorage) {
  try { storage.setItem(PIN_KEY, JSON.stringify(pins.slice(-300))); } catch { /* 저장 공간 없음 */ }
}

// 공식 화장실 자료(toilets.json)에서 한 점 둘레(m) 안의 화장실
export function toiletsNear(data, at, maxM = 700) {
  return (data?.items || []).filter((x) => distM([x.lng, x.lat], at) <= maxM);
}

// 주변 걷는 길 요약: 등급별 길이 비율(%). 높이를 아는 길만 100%로 보고, 모르는 길은 따로 센다
// segs: [{ g, coords }] → { known(m), unknown(m), share: [완만%, 조금 가파름%, 가파름%] 또는 null, steepest(%) }
export function walkSummary(segs) {
  const m = [0, 0, 0]; let unknown = 0, steepest = 0;
  for (const sg of segs) {
    const len = lineLengthM(sg.coords);
    if (sg.g >= 0) { m[sg.g] += len; if (sg.pct > steepest) steepest = sg.pct; } else unknown += len;
  }
  const known = m[0] + m[1] + m[2];
  if (!(known > 0)) return { known: 0, unknown, share: null, steepest: 0 };
  const share = m.map((x) => Math.round((x / known) * 100));
  share[share.indexOf(Math.max(...share))] += 100 - (share[0] + share[1] + share[2]); // 반올림 오차는 가장 큰 칸에
  return { known, unknown, share, steepest };
}
// 경사 %를 "1/12" 꼴로 (경사로 기준과 견줘 보기 쉽게)
export const ratioLabel = (pct) => (pct >= 0.5 ? `1/${Math.max(1, Math.round(100 / pct))}` : "0");

// 계단 3D 모형: 지도 자료(오픈스트리트맵)의 계단 선을 따라 땅에 붙은 낮은 계단 턱 블록을 놓는다.
//  - 블록은 지형 위에 서므로 오르막 자체는 지형이 나타낸다. 블록 높이는 30~50cm로 계단 턱 모양만(높이를 또 쌓으면 땅 위로 솟은 벽이 된다)
//  - 오르는 방향: 지형 고도로 두 끝의 높이 차를 읽을 수 있으면(0.5m 넘게) 높은 쪽으로 턱이 높아지게, rise(높이 차)를 알린다
//  - 못 읽으면 heightKnown=false (높이 차 모름)
// 반환: { features: GeoJSON Polygon[] (properties: h 블록 높이, base, odd), heightKnown, rise, lengthM }
export function stairBlocks(line, { elevAt = () => null, tread = 0.9, width = 1.8, maxBlocks = 120 } = {}) {
  if (!Array.isArray(line) || line.length < 2) return { features: [], heightKnown: false, rise: 0, lengthM: 0 };
  const len = lineLengthM(line);
  if (!(len > 0.5)) return { features: [], heightKnown: false, rise: 0, lengthM: len };
  const za = elevAt(line[0][0], line[0][1]), zb = elevAt(line.at(-1)[0], line.at(-1)[1]);
  const known = za != null && zb != null && Math.abs(zb - za) > 0.5;
  const pts = (known && za > zb) ? resample([...line].reverse(), Math.max(tread, len / maxBlocks)) : resample(line, Math.max(tread, len / maxBlocks));
  if (pts.at(-1) !== (known && za > zb ? line[0] : line.at(-1))) pts.push(known && za > zb ? line[0] : line.at(-1));
  const n = pts.length - 1;
  const total = known ? Math.min(Math.abs(zb - za), len * 0.9) : 0;
  const half = width / 2, features = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[i + 1], lat = (a[1] + b[1]) / 2;
    const mx = 1 / (111320 * Math.cos(lat * RAD)), my = 1 / 110540;
    const dx = (b[0] - a[0]) / mx, dy = (b[1] - a[1]) / my, d = Math.hypot(dx, dy);
    if (!(d > 0)) continue;
    const px = (-dy / d) * half * mx, py = (dx / d) * half * my; // 계단 폭 방향(선에 수직)
    const ring = [[a[0] + px, a[1] + py], [b[0] + px, b[1] + py], [b[0] - px, b[1] - py], [a[0] - px, a[1] - py], [a[0] + px, a[1] + py]];
    features.push({ type: "Feature", properties: { h: +(0.3 + 0.1 * (i % 3)).toFixed(2), base: 0, odd: i % 2 }, geometry: { type: "Polygon", coordinates: [ring] } });
  }
  return { features, heightKnown: known, rise: +total.toFixed(1), lengthM: Math.round(len) };
}
