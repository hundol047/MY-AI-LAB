// 개인정보 없는 사용 집계: "어떤 기능이 몇 번 쓰였나"만 날짜별로 센다.
// IP·기기·위치·입력 내용은 저장하지 않는다. 정해진 이벤트 이름만 받는다. 앱 서버(server.mjs)가 있을 때만 동작한다.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";

export const EVENTS = ["plan", "plan_region", "plan_days", "plan_move", "plan_who", "swap", "reorder", "add_place", "guide_ask", "share", "calendar", "lang", "start_custom", "trip_today", "warning_shown", "costs_open"];
const VALUE = /^[a-z0-9_-]{1,24}$/; // 값은 고정된 선택지 이름만 (예: region=gangneung)

export function createUsageStats(file) {
  let data = null, saving = null;
  const load = async () => (data ??= await readFile(file, "utf8").then(JSON.parse).catch(() => ({})));
  const save = () => (saving ??= new Promise((r) => setTimeout(r, 2000)).then(async () => {
    saving = null;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file + ".tmp", JSON.stringify(data));
    await rename(file + ".tmp", file);
  }));
  return {
    async record(event, value) {
      if (!EVENTS.includes(event)) throw Object.assign(new Error("알 수 없는 이벤트"), { status: 400 });
      const v = value == null || value === "" ? "" : String(value);
      if (v && !VALUE.test(v)) throw Object.assign(new Error("값 형식 오류"), { status: 400 });
      const d = await load();
      const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
      const k = v ? `${event}:${v}` : event;
      (d[day] ??= {})[k] = (d[day][k] || 0) + 1;
      // 180일 넘은 날짜는 지운다
      for (const old of Object.keys(d)) if (old < new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10)) delete d[old];
      save();
    },
    async summary(days = 30) {
      const d = await load();
      const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      const total = {};
      for (const [day, row] of Object.entries(d)) if (day >= from) for (const [k, n] of Object.entries(row)) total[k] = (total[k] || 0) + n;
      return { days, total };
    },
  };
}
