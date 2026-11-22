// 건물별 장애인 편의시설: 한국사회보장정보원 "장애인편의시설 현황"(공공데이터포털 B554287)에서 강원 시설을 받아
// 앱 장소와 이름·위치가 모두 맞는 것만 골라, 그 건물에 설치된 것으로 조사된 편의시설 목록(evalInfo)을 원문 그대로 저장한다.
//  - 목록에 있는 것만 "있음"이라고 한다. 목록에 없다고 "없음"이라고 하지 않는다(조사 항목이 건물마다 다르다).
//  - 이름이 같아도 500m 넘게 떨어져 있으면 다른 곳으로 보고 버린다.
// 출력: public/facilities.json ({builtAt, source, places: {id: {name, addr, type, year, km, items: [..]}}}), reports/facilities.md
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-facilities.mjs   (같은 공공데이터포털 인증키, "장애인편의시설 현황" 활용신청 필요)
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const BASE = "https://apis.data.go.kr/B554287/DisabledPersonConvenientFacility";
const ROWS = 1000, MAX_KM = 0.5, MAX_DETAIL = 500;
const dec = (s) => String(s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();

/** 응답 XML → { total, rows: [{태그: 값}] }. 줄 묶음 태그는 servList */
export function parseList(xml) {
  const rows = [...String(xml).matchAll(/<servList>([\s\S]*?)<\/servList>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)].map((x) => [x[1], dec(x[2])])));
  const total = Number((String(xml).match(/<totalCount>(\d+)<\/totalCount>/) || [])[1]) || 0;
  return { total, rows };
}
/** 시설 한 줄 → 앱에서 쓰는 모양. 좌표가 강원 밖이면 null */
export function toFacility(r) {
  const lat = Number(r.faclLat), lng = Number(r.faclLng);
  if (!(lat > 36.9 && lat < 38.7 && lng > 127 && lng < 129.5)) return null;
  const name = String(r.faclNm || "").trim(); if (!name || !r.wfcltId) return null;
  return { id: r.wfcltId, name, lat, lng, addr: String(r.lcMnad || "").replace(/^강원(특별자치도|도)?\s*/, "").trim(), type: String(r.faclTyCd || "").trim(), year: String(r.estbDate || "").slice(0, 4), closed: /폐업|휴업/.test(r.salStaNm || "") };
}
export const core = (s) => String(s || "").replace(/\s*\([^)]*\)/g, "").replace(/[\s·・,.\-_'"]/g, "").replace(/^(강릉|동해|삼척|속초|양양|고성|인제|춘천|철원|화천|홍천|양구|평창|정선|영월|태백|원주|횡성)(시|군)?(?=.{3})/, "");
const km = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * 6371; };
/** 장소마다 이름이 서로 들어 있고(3글자 이상) 500m 안에 있는 시설 중 가장 가까운 것 */
export function matchFacilities(places, facs, maxKm = MAX_KM) {
  const out = {};
  for (const p of places) {
    const names = [...new Set([p.name, ...(p.alias || [])].map(core).filter((x) => x.length >= 3))];
    let best = null;
    for (const f of facs) {
      if (f.closed || Math.abs(f.lat - p.lat) > 0.01) continue;
      const d = km(p, f); if (d > maxKm) continue;
      const fn = core(f.name); if (fn.length < 3) continue;
      if (!names.some((n) => fn.includes(n) || n.includes(fn))) continue;
      if (!best || d < best.km) best = { f, km: d };
    }
    if (best) out[p.id] = best;
  }
  return out;
}
/** evalInfo("주출입구 접근로,승강기,...") → 낱말 목록 (원문 그대로, 중복 제거) */
export const evalItems = (s) => [...new Set(String(s || "").split(/[,\n]/).map((x) => x.trim()).filter((x) => x && x.length <= 30))].slice(0, 30);

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const key = process.env.TOUR_API_KEY;
  if (!key) { console.error("TOUR_API_KEY(공공데이터포털 인증키)가 필요합니다"); process.exit(1); }
  const serviceKey = (() => { const k = String(key).trim(); try { return /%[0-9a-f]{2}/i.test(k) ? decodeURIComponent(k) : k; } catch { return k; } })();
  const safe = (s) => String(s).split(serviceKey).join("***").split(encodeURIComponent(serviceKey)).join("***");
  async function call(op, params) {
    const u = `${BASE}/${op}?${new URLSearchParams({ serviceKey, ...params })}`;
    let last = "";
    for (let i = 0; i < 3; i++) {
      const res = await fetch(u, { signal: AbortSignal.timeout(60000) }).catch((e) => { last = e.message; return null; });
      const text = res ? await res.text().catch(() => "") : "";
      if (res?.ok && /<totalCount>|<servList>/.test(text)) return text;
      if (text) last = `HTTP ${res.status} ${text.replace(/\s+/g, " ").slice(0, 300)}`;
      if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE ACCESS DENIED|LIMITED_NUMBER/i.test(text)) break;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
    throw new Error(safe(`장애인편의시설 API(${op}) 응답을 받지 못했습니다: ${last} — 활용신청 승인 직후에는 한두 시간 뒤에 열리기도 합니다`));
  }
  async function listAll(extra) {
    const first = parseList(await call("getDisConvFaclList", { numOfRows: String(ROWS), pageNo: "1", ...extra }));
    let rows = first.rows;
    for (let n = 2; n <= Math.ceil(first.total / ROWS); n++) { rows = rows.concat(parseList(await call("getDisConvFaclList", { numOfRows: String(ROWS), pageNo: String(n), ...extra })).rows); process.stdout.write("."); }
    return { total: first.total, rows };
  }
  let got = { total: 0, rows: [] };
  for (const siDoNm of ["강원특별자치도", "강원도", "강원"]) {
    const g = await listAll({ siDoNm }).catch((e) => { console.log(e.message); return null; });
    console.log(`\nsiDoNm=${siDoNm}: ${g ? `${g.total}건 (받은 줄 ${g.rows.length})` : "실패"}`);
    if (g && g.rows.length > got.rows.length && g.total < 60000) got = g;
    if (got.rows.length > 500) break;
  }
  if (got.rows.length) console.log("첫 줄 항목:", Object.keys(got.rows[0]).join(", "));
  const byId = new Map(got.rows.map(toFacility).filter(Boolean).map((f) => [f.id, f]));
  const facs = [...byId.values()];
  console.log(`강원 좌표가 있는 시설 ${facs.length}곳`);
  if (facs.length < 300) throw new Error(`강원 시설이 ${facs.length}곳뿐이라 이상합니다 — 저장하지 않습니다`);
  const { PLACES } = await import("../public/data.js");
  const places = PLACES.filter((p) => p.cat !== "festival");
  const m = matchFacilities(places, facs);
  const out = {}, lines = [];
  let n = 0;
  for (const [id, { f, km: d }] of Object.entries(m)) {
    if (n++ >= MAX_DETAIL) break;
    const xml = await call("getFacInfoOpenApiJpEvalInfoList", { wfcltId: f.id }).catch((e) => { console.log(e.message); return ""; });
    const items = evalItems(parseList(xml).rows.map((r) => r.evalInfo).join(","));
    if (!items.length) continue;
    out[id] = { name: f.name, addr: f.addr, ...(f.type ? { type: f.type } : {}), ...(f.year ? { year: f.year } : {}), m: Math.round(d * 1000), items };
    const p = places.find((x) => x.id === id);
    lines.push(`- **${p.name}** ← ${f.name} (${f.addr}, ${Math.round(d * 1000)}m): ${items.join(" · ")}`);
  }
  console.log(`앱 장소와 맞은 시설 ${Object.keys(m).length}곳, 편의시설 목록이 있는 곳 ${Object.keys(out).length}곳`);
  await writeFile(new URL("../public/facilities.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), source: "한국사회보장정보원 장애인편의시설 현황 (공공데이터포털)", places: out }).replace(/\},"/g, '},\n"') + "\n");
  await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
  await writeFile(new URL("../reports/facilities.md", import.meta.url), ["# 건물별 장애인 편의시설 (한국사회보장정보원 장애인편의시설 현황)", "", `생성: node scripts/bake-facilities.mjs. 강원 시설 ${facs.length}곳 중 앱 장소와 이름·위치(500m)가 모두 맞는 ${Object.keys(m).length}곳, 편의시설 목록이 있는 ${Object.keys(out).length}곳.`, "", "목록에 있는 것은 그 건물에 설치된 것으로 조사된 편의시설이다. 목록에 없다고 없는 것은 아니다.", "", ...lines, ""].join("\n"));
}
