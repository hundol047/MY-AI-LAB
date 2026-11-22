// 공식 화장실 위치: 행정안전부 전국공중화장실표준데이터(공공데이터포털 tn_pubr_public_toilet_api)에서
// 강원 공중화장실을 받아, 앱 장소 1km 안에 있는 것만 좌표·장애인 화장실 여부·개방시간과 함께 저장한다.
// 장소 3D 화면(view3d.js)이 "공식" 화장실로 표시한다. 장애인용 변기 수가 1개 이상일 때만 "장애인 화장실"이라고 한다.
// 출력: public/toilets.json ({builtAt, source, items: [{name, lat, lng, acc, open, ref}]}), reports/toilets.md
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-toilets.mjs   (같은 공공데이터포털 인증키, "전국공중화장실표준데이터" 활용신청 필요)
//  - 프록시를 거치는 곳에서는 NODE_USE_ENV_PROXY=1 을 함께 준다
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const NEAR_KM = 1, ROWS = 1000;
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };

// 표준데이터 한 줄 → 앱에서 쓰는 모양. 좌표가 없거나 강원 밖이면 null.
// 항목 이름은 표준데이터 개정 때 바뀐 적이 있어, 장애인용 변기 수는 이름에 Handicap·Dspsn이 들어간 칸을 모두 더한다.
export function toToilet(x) {
  const lat = num(x.latitude), lng = num(x.longitude);
  if (!(lat > 36.9 && lat < 38.7 && lng > 127 && lng < 129.5)) return null;
  if (!/강원/.test(`${x.insttNm || ""} ${x.rdnmadr || ""} ${x.lnmadr || ""} ${x.institutionNm || ""}`)) return null;
  const name = String(x.toiletNm || x.toiletName || "").trim();
  if (!name) return null;
  const accKeys = Object.keys(x).filter((k) => /handicap|dspsn/i.test(k));
  const acc = accKeys.reduce((s, k) => s + num(x[k]), 0);
  return {
    name, lat: +lat.toFixed(6), lng: +lng.toFixed(6),
    // 칸 자체가 없으면(모름) acc를 넣지 않는다: "장애인 화장실 없음"과 "모름"을 섞지 않는다
    ...(accKeys.length ? { acc: acc > 0 } : {}),
    ...(x.openTime || x.openTimeDetail ? { open: String(x.openTimeDetail || x.openTime).trim().slice(0, 40) } : {}),
    ...(x.referenceDate ? { ref: String(x.referenceDate).slice(0, 10) } : {}),
  };
}
const km = (a, b) => { const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; return 2 * 6371 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2)); };
export function nearPlaces(toilets, places, maxKm = NEAR_KM) {
  return toilets.filter((t) => places.some((p) => Math.abs(p.lat - t.lat) < 0.02 && km(p, t) <= maxKm));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const key = process.env.TOUR_API_KEY;
  if (!key) { console.error("TOUR_API_KEY(공공데이터포털 인증키)가 필요합니다"); process.exit(1); }
  const serviceKey = (() => { const k = String(key).trim(); try { return /%[0-9a-f]{2}/i.test(k) ? decodeURIComponent(k) : k; } catch { return k; } })();
  const { PLACES } = await import("../public/data.js");
  async function page(n) {
    const u = `https://api.data.go.kr/openapi/tn_pubr_public_toilet_api?${new URLSearchParams({ serviceKey, pageNo: String(n), numOfRows: String(ROWS), type: "json" })}`;
    for (let i = 0; i < 3; i++) {
      const res = await fetch(u, { signal: AbortSignal.timeout(60000) }).catch(() => null);
      const j = res?.ok ? await res.json().catch(() => null) : null;
      const b = j?.response?.body || j?.body;
      const code = (j?.response?.header || j?.header)?.resultCode;
      if (b && (!code || code === "00")) return { total: Number(b.totalCount) || 0, items: [].concat(b.items?.item || b.items || []) };
      if (code && code !== "00") throw new Error(`공중화장실 API 오류 코드 ${String(code).replace(/[^\w-]/g, "")} (공공데이터포털에서 "전국공중화장실표준데이터" 활용신청·인증키 확인)`);
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
    throw new Error(`공중화장실 API ${n}쪽을 받지 못했습니다`);
  }
  const first = await page(1);
  let rows = first.items;
  for (let n = 2; n <= Math.ceil(first.total / ROWS); n++) { rows = rows.concat((await page(n)).items); process.stdout.write("."); }
  const all = rows.map(toToilet).filter(Boolean);
  console.log(`\n전국 ${rows.length}곳 중 강원 ${all.length}곳`);
  if (all.length < 300) throw new Error(`강원 공중화장실이 ${all.length}곳뿐이라 이상합니다 — 저장하지 않습니다`);
  const places = PLACES.filter((p) => p.cat !== "festival");
  const items = nearPlaces(all, places).sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  await writeFile(new URL("../public/toilets.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), source: "행정안전부 전국공중화장실표준데이터 (공공데이터포털)", radiusKm: NEAR_KM, items }).replace(/\},\{/g, "},\n{") + "\n");
  await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
  const none = places.filter((p) => !items.some((t) => km(p, t) <= 0.5));
  await writeFile(new URL("../reports/toilets.md", import.meta.url), ["# 장소 근처 공중화장실 (전국공중화장실표준데이터)", "", `생성: node scripts/bake-toilets.mjs. 강원 ${all.length}곳 중 앱 장소 ${NEAR_KM}km 안 ${items.length}곳 (장애인 화장실 ${items.filter((t) => t.acc).length}곳, 장애인용 칸 정보 없음 ${items.filter((t) => t.acc === undefined).length}곳).`, "", `## 500m 안에 공식 화장실 자료가 없는 장소 (${none.length}곳)`, "", ...none.map((p) => `- ${p.name}`), ""].join("\n"));
  console.log(`장소 근처 공식 화장실 ${items.length}곳 → public/toilets.json, reports/toilets.md`);
}
