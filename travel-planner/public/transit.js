// 오가는 길: 서울 쪽 출발역·터미널 ↔ 강원 권역 기준점의 실제 시간표(transit.json, 국토교통부 TAGO)에서 편을 고른다
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const isWeekend = (dateStr) => { const d = new Date(dateStr + "T00:00:00Z").getUTCDay(); return d === 0 || d === 6; };
const MODE_ORDER = { train: 0, express: 1, intercity: 2 };

function tripsFor(transit, { dir, from, region, dateStr }) {
  const days = isWeekend(dateStr) ? "weekend" : "weekday";
  const out = [];
  for (const r of transit?.routes || []) {
    if (r.dir !== dir || r.from !== from || r.region !== region) continue;
    if (r.mode === "train" && r.days !== days) continue;
    for (const t of r.trips) out.push({ ...t, mode: r.mode, from: r.from, hub: r.toName, refDate: r.date, depMin: toMin(t.dep), arrMin: toMin(t.arr) });
  }
  return out.filter((t) => t.arrMin > t.depMin); // 자정을 넘기는 편은 뺀다
}

// 가는 편: earliest(분) 이후 출발하는 편 중 가장 일찍 도착하는 편 (같으면 기차 → 고속 → 시외, 그다음 늦게 출발하는 편)
export function bestArrival(transit, from, region, dateStr, earliest) {
  const list = tripsFor(transit, { dir: "in", from, region, dateStr }).filter((t) => t.depMin >= earliest);
  list.sort((a, b) => a.arrMin - b.arrMin || MODE_ORDER[a.mode] - MODE_ORDER[b.mode] || b.depMin - a.depMin);
  return list[0] || null;
}
// 그 출발지에서 갈 수 있는 편이 하나라도 있는지
export const hasRoute = (transit, from, region) => (transit?.routes || []).some((r) => r.dir === "in" && r.from === from && r.region === region && r.trips.length);

// 돌아오는 편: after(분) 이후 출발 편 중 앞의 몇 편과 그날 막차
export function returnTrips(transit, from, region, dateStr, after, n = 3) {
  const list = tripsFor(transit, { dir: "out", from, region, dateStr }).filter((t) => t.depMin >= after).sort((a, b) => a.depMin - b.depMin || MODE_ORDER[a.mode] - MODE_ORDER[b.mode]);
  const pick = list.slice(0, n);
  const last = list.at(-1);
  if (last && !pick.includes(last)) pick.push({ ...last, last: true });
  else if (last) last.last = true;
  return pick;
}
