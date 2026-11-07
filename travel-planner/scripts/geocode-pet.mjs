// 반려동물 동반 시설 목록 중 관광공사에서 위치를 못 찾은 식당·카페·관광지의 주소를 좌표로 바꾼다 (브이월드 주소 검색, 무료).
// 브이월드는 해외 IP(클라우드 환경)에서 막혀 있어 한국 안의 컴퓨터에서 실행한다:
//   VWORLD_KEY=브이월드키 node scripts/geocode-pet.mjs
// 출력: data/pet-coords.json ({목록 번호: {lat, lng, how}}) — 이 파일을 커밋하면 bake-pet.mjs가 반려동물 동행 장소로 쓴다
// 주소 검색(도로명 → 지번)으로 먼저 찾고, 없으면 장소 이름 검색. 결과가 그 시군 주소인 것만 쓴다.
import { readFile, writeFile } from "node:fs/promises";

const KEY = process.env.VWORLD_KEY;
if (!KEY) { console.error("VWORLD_KEY가 필요합니다 (브이월드 오픈API 인증키)"); process.exit(1); }
const extra = process.env.VWORLD_DOMAIN ? { domain: process.env.VWORLD_DOMAIN } : {};
const splitCsv = (line) => { const out = []; let cur = "", q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
const rows = (await readFile(new URL("../data/pet-friendly-2025-11-07.csv", import.meta.url), "utf8")).trim().split(/\r?\n/).slice(1)
  .map((l) => splitCsv(l).map((v) => v.replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim()))
  .map(([no, name, sigun, addr, kind]) => ({ no, name, sigun, addr: addr.replace(/\s+/g, " "), kind }))
  .filter((r) => ["식음료", "관광지", "체험"].includes(r.kind));
const pet = JSON.parse(await readFile(new URL("../public/pet.json", import.meta.url), "utf8"));
const done = new Set(Object.values(pet.places)); // 이미 앱 장소나 관광공사와 맞춘 곳은 건너뛴다
const out = JSON.parse(await readFile(new URL("../data/pet-coords.json", import.meta.url), "utf8").catch(() => "{}"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function vw(path, params) {
  const u = new URL(`https://api.vworld.kr/req/${path}`);
  u.search = new URLSearchParams({ ...params, format: "json", errorformat: "json", key: KEY, ...extra });
  const r = await fetch(u, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const res = (await r.json())?.response;
  // 키가 틀렸거나 등록 도메인이 다르면 ERROR가 온다 (결과 없음은 NOT_FOUND) → 바로 멈춘다
  if (res?.status === "ERROR") throw Object.assign(new Error(`${res.error?.code || ""} ${res.error?.text || ""}`.trim()), { fatal: true });
  return res;
}
async function byAddress(addr) {
  // 괄호·층수 등 덧붙인 말은 뺀다 ("…로 307, 16층" → "…로 307")
  const a = addr.replace(/\([^)]*\)/g, " ").replace(/,.*$/, "").replace(/\s+/g, " ").trim();
  for (const type of ["road", "parcel"]) {
    const res = await vw("address", { service: "address", request: "getcoord", version: "2.0", crs: "epsg:4326", refine: "true", simple: "false", type, address: a });
    if (res?.status === "OK" && res.result?.point) return { lat: +res.result.point.y, lng: +res.result.point.x, how: `주소(${type === "road" ? "도로명" : "지번"})` };
    await sleep(200);
  }
  return null;
}
async function byName(r) {
  const res = await vw("search", { service: "search", request: "search", version: "2.0", crs: "EPSG:4326", size: "5", page: "1", query: `${r.sigun} ${r.name}`, type: "place" });
  const hit = (res?.result?.items || []).find((d) => `${d.address?.road || ""} ${d.address?.parcel || ""}`.includes(r.sigun));
  return hit ? { lat: +hit.point.y, lng: +hit.point.x, how: "이름 검색" } : null;
}

if (/[가-힣]/.test(KEY) || KEY.length < 20) { console.error(`VWORLD_KEY 값이 실제 키가 아닌 것 같습니다 ("${KEY.slice(0, 6)}…"). 브이월드에서 받은 인증키(영문·숫자·하이픈)를 넣으세요: $env:VWORLD_KEY="발급받은키"`); process.exit(1); }
try {
  const t = await byAddress("강원특별자치도 강릉시 창해로14번길 20-1");
  if (!t) throw new Error("시험 주소를 찾지 못했습니다");
} catch (e) {
  console.error(e.fatal ? `브이월드가 키를 받아 주지 않았습니다 (${e.message}). 키 값과, 키를 발급받을 때 등록한 서비스 URL(VWORLD_DOMAIN)을 확인하세요.` : `브이월드에 연결하지 못했습니다 (${e.message}). 한국 안의 컴퓨터에서 실행하세요.`);
  process.exit(1);
}
let found = 0, miss = 0;
for (const r of rows) {
  if (done.has(r.name) || out[r.no]) continue;
  const stop = (e) => { if (e.fatal) { console.error(`\n브이월드 오류로 멈춥니다: ${e.message}`); process.exit(1); } return null; };
  const g = (await byAddress(r.addr).catch(stop)) || (await byName(r).catch(stop));
  if (g && g.lat > 37 && g.lat < 38.7 && g.lng > 127 && g.lng < 129.5) { out[r.no] = { ...g, name: r.name }; found++; process.stdout.write("."); }
  else { miss++; process.stdout.write("x"); }
  await sleep(250);
}
await writeFile(new URL("../data/pet-coords.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`\n좌표 찾음 ${found}곳 · 못 찾음 ${miss}곳 → data/pet-coords.json (커밋한 뒤 node scripts/bake-pet.mjs)`);
