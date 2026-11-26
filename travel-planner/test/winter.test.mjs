// 겨울 일정 (12~2월, 출시 직후 가장 먼저 쓰일 날짜): 연중 휴무 기간·정기 휴무일에 가지 않고,
// 해 진 뒤에 걷는 야외 장소(숲길·절 등, 야경 장소 제외)가 잡히지 않는다
import assert from "node:assert/strict";
import { planTrip, addDays, toMin } from "../public/planner.js";
import { sunTimes } from "../public/sun.js";

const inRange = (d, [a, b]) => { const md = d.slice(5); return a <= b ? md >= a && md <= b : md >= a || md <= b; };
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
let plans = 0, visits = 0;
for (let day = 0; day < 90; day += 6) {
  const date = addDays("2026-12-01", day);
  for (const region of ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"]) for (const access of [[], ["walker"]]) {
    const trip = planTrip({ region, date, days: 2, who: "parents", likes: ["nature", "sea", "history"], move: "car", access }, { access });
    plans++;
    for (const d of trip.days) for (const it of d.items) {
      const p = it.place; if (!p || p.cat === "festival") continue;
      assert.ok(!(p.closedYearly || []).some((r) => inRange(d.date, r)), `${d.date} ${p.id} 연중 휴무 기간`);
      const wd = new Date(d.date + "T00:00:00").getDay();
      assert.ok(!(p.closed || []).some((c) => c === wd || c === DOW[wd]), `${d.date} ${p.id} 정기 휴무일`);
      if (it.kind !== "visit" || p.indoor || p.tags.includes("night") || (p.walk || 0) < 2) continue;
      visits++;
      const st = sunTimes(d.date, p.lat, p.lng);
      assert.ok(it.end <= toMin(st.set) + 15, `${d.date} ${p.id} 해 진 뒤(${st.set}) ${Math.floor(it.end / 60)}:${String(it.end % 60).padStart(2, "0")}까지 야외`);
    }
  }
}
console.log(`ok - 겨울 일정 ${plans}개: 휴무 0 · 해 진 뒤 야외 걷기 0 (야외 걷는 방문 ${visits}번)`);
