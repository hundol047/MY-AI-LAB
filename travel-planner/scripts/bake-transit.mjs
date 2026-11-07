// 서울 쪽 출발역·터미널 ↔ 강원 5개 권역 기준점의 열차·고속버스·시외버스 시간표 (국토교통부 TAGO)
// 출력: public/transit.json, reports/transit.md
// - 열차(TrainInfo): 다음 화요일(평일)·토요일(주말) 시간표. 몇 주 앞까지 조회된다
// - 고속·시외버스(ExpBusInfo, SuburbsBusInfo): 내일 시간표만 조회된다(일주일 뒤 날짜는 비어 있음) → "기준일"로 표시
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-transit.mjs   (같은 공공데이터포털 인증키를 쓴다)
import { writeFile, mkdir } from "node:fs/promises";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY(공공데이터포털 인증키)가 필요합니다"); process.exit(1); }
async function call(path, params) {
  const q = new URLSearchParams({ serviceKey: key, _type: "json", numOfRows: "300", pageNo: "1", ...params });
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://apis.data.go.kr/1613000/${path}?${q}`, { signal: AbortSignal.timeout(40000) }).catch(() => null);
    if (!res) { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); continue; }
    const j = await res.json().catch(() => null);
    const code = j?.response?.header?.resultCode;
    if (code !== "00") throw new Error(`${path}: HTTP ${res.status}, 결과 코드 ${String(code || j?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode || "?").replace(/[^\w]/g, "")}`);
    let it = j.response.body?.items?.item || [];
    return Array.isArray(it) ? it : [it];
  }
  throw new Error(`${path}: 연결 실패`);
}
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5);
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const nextDow = (dow) => { for (let i = 2; i < 10; i++) if (kst(i).getUTCDay() === dow) return ymd(kst(i)); };
const hhmm = (v) => { const s = String(v); return `${s.slice(8, 10)}:${s.slice(10, 12)}`; };

// 권역 기준점(앱 data.js REGIONS.base)과 같은 곳의 역·터미널 이름
const HUBS = {
  gangneung: { train: "강릉", express: "강릉", intercity: "강릉" },
  seorak: { express: "속초", intercity: "속초" },
  chuncheon: { train: "춘천", express: "춘천", intercity: "춘천" },
  pyeongchang: { train: "진부", intercity: "진부" },
  wonju: { train: "원주", express: "원주", intercity: "원주" },
};
// 출발지 (앱 origins.js 이름과 같게): 서울 쪽 역·터미널, 부산·대구 기차역, 공항·부산·대전 버스터미널
const ORIGINS = {
  train: { 서울역: "서울", 청량리역: "청량리", 상봉역: "상봉", 부전역: "부전", 동대구역: "동대구" },
  express: { 동서울종합터미널: ["NAEK030", "NAEK031", "NAEK032", "NAEK035"], 서울고속버스터미널: ["NAEK010", "NAEK020", "NAEK021"] },
  intercity: { 동서울종합터미널: "동서울", 서울고속버스터미널: "서울고속버스터미널(경부)", 상봉역: "상봉", 인천국제공항: "인천공항2터미널", 김포국제공항: "김포공항", 부산동부터미널: "부산동부", 대전복합터미널: "대전복합" },
};

const routes = [], log = [];
const add = (r) => { if (r.trips.length) routes.push(r); log.push(`${r.mode} ${r.dir === "in" ? `${r.from} → ${r.toName}` : `${r.toName} → ${r.from}`} ${r.days}: ${r.trips.length}편`); };

// 열차
const stations = new Map();
for (const city of ["11", "21", "22", "32"]) for (const s of await call("TrainInfo/GetCtyAcctoTrainSttnList", { cityCode: city })) stations.set(s.nodename, s.nodeid);
const trainDays = { weekday: nextDow(2), weekend: nextDow(6) };
for (const [region, hub] of Object.entries(HUBS)) {
  if (!hub.train) continue;
  for (const [origin, st] of Object.entries(ORIGINS.train)) for (const [days, date] of Object.entries(trainDays)) for (const dir of ["in", "out"]) {
    const [dep, arr] = dir === "in" ? [stations.get(st), stations.get(hub.train)] : [stations.get(hub.train), stations.get(st)];
    if (!dep || !arr) continue;
    const items = await call("TrainInfo/GetStrtpntAlocFndTrainInfo", { depPlaceId: dep, arrPlaceId: arr, depPlandTime: date });
    add({ mode: "train", dir, from: origin, region, toName: `${hub.train}역`, days, date, trips: items.map((x) => ({ dep: hhmm(x.depplandtime), arr: hhmm(x.arrplandtime), grade: x.traingradename, fare: Number(x.adultcharge) || null })).sort((a, b) => a.dep.localeCompare(b.dep)) });
  }
}
// 버스 (내일 기준)
const busDate = ymd(kst(1));
const exTerm = async (nm) => (await call("ExpBusInfo/GetExpBusTrminlList", { terminalNm: nm })).filter((t) => t.terminalNm === nm).map((t) => t.terminalId);
const icTerm = async (nm) => (await call("SuburbsBusInfo/GetSuberbsBusTrminlList", { terminalNm: nm })).filter((t) => t.terminalNm === nm).map((t) => t.terminalId);
const busTrips = (items) => items.map((x) => ({ dep: hhmm(x.depPlandTime), arr: hhmm(x.arrPlandTime), grade: x.gradeNm, fare: Number(x.charge) || null }));
for (const [region, hub] of Object.entries(HUBS)) {
  if (hub.express) {
    const arrIds = await exTerm(hub.express);
    for (const [origin, depIds] of Object.entries(ORIGINS.express)) for (const dir of ["in", "out"]) {
      const trips = [];
      for (const a of arrIds) for (const d of depIds) {
        const [x, y] = dir === "in" ? [d, a] : [a, d];
        trips.push(...busTrips(await call("ExpBusInfo/GetStrtpntAlocFndExpbusInfo", { depTerminalId: x, arrTerminalId: y, depPlandTime: busDate }).catch(() => [])));
      }
      add({ mode: "express", dir, from: origin, region, toName: `${hub.express} 고속버스터미널`, days: "all", date: busDate, trips: dedupe(trips) });
    }
  }
  if (hub.intercity) {
    const arrIds = await icTerm(hub.intercity);
    for (const [origin, nm] of Object.entries(ORIGINS.intercity)) {
      const depIds = await icTerm(nm);
      for (const dir of ["in", "out"]) {
        const trips = [];
        for (const a of arrIds) for (const d of depIds) {
          const [x, y] = dir === "in" ? [d, a] : [a, d];
          trips.push(...busTrips(await call("SuburbsBusInfo/GetStrtpntAlocFndSuberbsBusInfo", { depTerminalId: x, arrTerminalId: y, depPlandTime: busDate }).catch(() => [])));
        }
        add({ mode: "intercity", dir, from: origin, region, toName: `${hub.intercity} 시외버스터미널`, days: "all", date: busDate, trips: dedupe(trips) });
      }
    }
  }
}
function dedupe(trips) { const seen = new Set(); return trips.filter((t) => { const k = `${t.dep}-${t.arr}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.dep.localeCompare(b.dep)); }

if (!routes.length) throw new Error("시간표를 하나도 받지 못했습니다. 기존 파일을 유지합니다.");
const out = { builtAt: new Date().toISOString(), source: "국토교통부 TAGO 열차·고속버스·시외버스 정보", trainDays, busDate, routes };
await writeFile(new URL("../public/transit.json", import.meta.url), JSON.stringify(out) + "\n");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/transit.md", import.meta.url), ["# 오가는 길 시간표 (국토교통부 TAGO)", "", `생성: node scripts/bake-transit.mjs. 열차 기준일 평일 ${trainDays.weekday}·주말 ${trainDays.weekend}, 버스 기준일 ${busDate}.`, "", ...log.map((l) => `- ${l}`), ""].join("\n"));
console.log(`노선 ${routes.length}개 → public/transit.json, reports/transit.md`);
