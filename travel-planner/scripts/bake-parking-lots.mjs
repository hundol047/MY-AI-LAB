// 장소 근처 주차장: 행정안전부 전국주차장정보표준데이터(공공데이터포털 tn_pubr_prkplce_info_api)에서
// 강원 주차장을 받아 앱 장소마다 걸어서 갈 만한(직선 500m 안) 주차장을 가까운 순으로 2곳 붙인다.
// 관광공사 주차 원문(parking.json)이 없는 곳도 차로 갈 때 세울 곳을 알 수 있게 한다.
// 출력: public/parking-lots.json ({builtAt, source, places: {장소 id: [{name, m, kind, fee, spaces, hours}]}}), reports/parking-lots.md
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-parking-lots.mjs   (같은 공공데이터포털 인증키, "전국주차장정보표준데이터" 활용신청 필요)
//  - 이 세션처럼 프록시를 거치는 곳에서는 NODE_USE_ENV_PROXY=1 을 함께 준다
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { km } from "./tour-api.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY(공공데이터포털 인증키)가 필요합니다"); process.exit(1); }
const serviceKey = (() => { const k = String(key).trim(); try { return /%[0-9a-f]{2}/i.test(k) ? decodeURIComponent(k) : k; } catch { return k; } })();
const { PLACES } = await import("../public/data.js");
const MAX_M = 500, PER_PLACE = 2, ROWS = 1000;

async function page(n) {
  const u = `https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api?${new URLSearchParams({ serviceKey, pageNo: String(n), numOfRows: String(ROWS), type: "json" })}`;
  for (let i = 0; i < 3; i++) {
    const res = await fetch(u, { signal: AbortSignal.timeout(60000) }).catch(() => null);
    const j = res?.ok ? await res.json().catch(() => null) : null;
    const b = j?.response?.body || j?.body;
    const code = (j?.response?.header || j?.header)?.resultCode;
    if (b && (!code || code === "00")) return { total: Number(b.totalCount) || 0, items: [].concat(b.items?.item || b.items || []) };
    if (code && code !== "00") throw new Error(`주차장 API 오류 코드 ${String(code).replace(/[^\w-]/g, "")} (활용신청·인증키 확인)`);
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`주차장 API ${n}쪽을 받지 못했습니다`);
}

const first = await page(1);
let rows = first.items;
for (let n = 2; n <= Math.ceil(first.total / ROWS); n++) { rows = rows.concat((await page(n)).items); process.stdout.write("."); }
const lots = rows
  .filter((x) => /강원/.test(`${x.insttNm} ${x.rdnmadr} ${x.lnmadr}`))
  .map((x) => ({ name: String(x.prkplceNm || "").trim(), lat: Number(x.latitude), lng: Number(x.longitude), kind: x.prkplceSe || "", type: x.prkplceType || "",
    fee: /무료/.test(x.parkingchrgeInfo) ? "free" : /유료/.test(x.parkingchrgeInfo) ? "paid" : /혼합/.test(x.parkingchrgeInfo) ? "mixed" : null,
    spaces: Number(x.prkcmprt) || null, open: x.weekdayOperOpenHhmm, close: x.weekdayOperColseHhmm, addr: x.rdnmadr || x.lnmadr || "" }))
  .filter((x) => x.name && x.lat > 36.9 && x.lat < 38.7 && x.lng > 127 && x.lng < 129.5); // 좌표가 없거나 강원 밖인 것 제외
console.log(`\n전국 ${rows.length}곳 중 강원 ${lots.length}곳`);
if (lots.length < 500) throw new Error(`강원 주차장이 ${lots.length}곳뿐이라 이상합니다 — 저장하지 않습니다`);

const out = {}, lines = [];
for (const p of PLACES.filter((x) => !x.petOnly && x.cat !== "festival")) {
  const near = lots.map((l) => ({ l, m: Math.round(km(p, l) * 1000) })).filter((x) => x.m <= MAX_M).sort((a, b) => a.m - b.m)
    .filter((x, i, a) => a.findIndex((y) => y.l.name === x.l.name) === i).slice(0, PER_PLACE);
  if (!near.length) continue;
  out[p.id] = near.map(({ l, m }) => ({ name: l.name, m, kind: l.kind, fee: l.fee, spaces: l.spaces, ...(l.open && l.close && !(l.open === "00:00" && /23:59|24:00/.test(l.close)) ? { hours: `${l.open}–${l.close}` } : {}) }));
  lines.push(`- ${p.name}: ${near.map(({ l, m }) => `${l.name} ${m}m ${l.kind} ${l.fee || ""} ${l.spaces ? l.spaces + "면" : ""}`).join(" / ")}`);
}
await writeFile(new URL("../public/parking-lots.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), source: "행정안전부 전국주차장정보표준데이터 (공공데이터포털)", radius: MAX_M, places: out }) + "\n");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
const all = PLACES.filter((x) => !x.petOnly && x.cat !== "festival").length;
await writeFile(new URL("../reports/parking-lots.md", import.meta.url), ["# 장소 근처 주차장 (전국주차장정보표준데이터)", "", `생성: node scripts/bake-parking-lots.mjs. 강원 주차장 ${lots.length}곳 · 반경 ${MAX_M}m 안에 주차장이 있는 앱 장소 ${Object.keys(out).length}/${all}곳`, "", ...lines, ""].join("\n"));
console.log(`근처 주차장 ${Object.keys(out).length}/${all}곳 → public/parking-lots.json, reports/parking-lots.md`);
