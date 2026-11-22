// 내려받은 공공데이터 파일(data/public-files/)을 앱 자료로 만든다. 인증키·인터넷이 필요 없다.
//  ① 무장애나눔길 (한국산림복지진흥원 전국 무장애나눔길 목록 + 공간정보 GPX): 강원의 길 → public/bf-trails.json (선 좌표 포함)
//  ② 열린관광지 (한국관광공사 열린관광지 목록 2022-08-04): 앱 장소와 대조 → public/open-sites.json
//  ③ 공중화장실 (행정안전부 공중화장실 파일, 좌표 없음):
//     - 주소가 관광공사 탐색 목록의 시설 주소와 같은 화장실은 그 시설 좌표로 → public/toilets.json (3D 지도에 '공식'으로 표시, 앱 장소 1km 안만)
//     - 화장실 이름에 앱 장소 이름이 들어 있고 같은 시군이면 그 장소의 화장실로 → public/toilets-named.json (지도에는 못 찍고 목록으로)
// 근거: reports/public-files.md.   실행: node scripts/bake-public-files.mjs
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { PLACES } from "../public/data.js";
import { judge, core, km } from "./tour-api.mjs";

const F = (n) => new URL(`../data/public-files/${n}`, import.meta.url);
export function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...body] = rows; return body.filter((r) => r.length === h.length).map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), r[i].trim()])));
}
const SG = ["춘천", "원주", "강릉", "동해", "태백", "속초", "삼척", "홍천", "횡성", "영월", "평창", "정선", "철원", "화천", "양구", "인제", "고성", "양양"];
export const sigunOf = (addr) => { const m = String(addr).match(/강원(?:특별자치도|도)?\s*([가-힣]+?)(?:시|군)(?:\s|$)/) || String(addr).match(/^\s*([가-힣]+?)(?:시|군)\s/); return m && SG.includes(m[1]) ? m[1] : null; };
// 선을 줄인다: 앞 점에서 4m 넘게 떨어진 점만 (GPX가 수십 cm 간격이라)
const thin = (pts, minM = 4) => { const out = [pts[0]]; for (const p of pts) { const a = out[out.length - 1]; if (km({ lat: a[1], lng: a[0] }, { lat: p[1], lng: p[0] }) * 1000 >= minM) out.push(p); } if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]); return out; };

if (process.argv[1]?.endsWith("bake-public-files.mjs")) {
  const sigun = JSON.parse(await readFile(new URL("../public/pet.json", import.meta.url), "utf8")).sigun || {};
  const places = PLACES.filter((p) => !p.petOnly && p.cat !== "festival");
  const report = ["# 내려받은 공공데이터 파일로 만든 자료", ""];

  // ① 무장애나눔길
  const list = parseCSV(await readFile(F("bf-trails.csv"), "utf8")).filter((r) => /강원/.test(r["관리기관"] + r["주소"]) || /^(평창|양구|인제|홍천|고성|양양|정선|원주|춘천)/.test(r["주소"]));
  const gpx = {};
  for (const f of await readdir(F("bf-trails/"))) {
    const t = await readFile(F(`bf-trails/${f}`), "utf8");
    const segs = [...t.matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)].map((m) => [...m[1].matchAll(/<trkpt lat="([\d.]+)" lon="([\d.]+)"/g)].map((x) => [+(+x[2]).toFixed(6), +(+x[1]).toFixed(6)])).filter((s) => s.length > 1).map((s) => thin(s));
    gpx[f.replace(/^강원_|\.gpx$/g, "").replace(/_/g, " ")] = segs;
  }
  const trails = [], usedGpx = new Set();
  for (const r of list) {
    const lat = +r["위도(도)"], lng = +r["경도(도)"], name = r["사업명"].replace(/\s*조성(사업)?$/, "").replace(/\s+/g, " ").trim();
    // 선 자료: 이름의 고유한 낱말이 같고, 목록 좌표에서 3km 안에 있는 GPX
    const key = Object.keys(gpx).find((k) => { const w = k.replace(/무장애\s*나눔길/, "").replace(/평창군|홍천군|강원도/g, "").trim().split(" ")[0]; const p0 = gpx[k][0]?.[0]; return w && name.includes(w) && p0 && km({ lat, lng }, { lat: p0[1], lng: p0[0] }) < 3; });
    if (key) usedGpx.add(key);
    const dup = trails.find((t) => t.line && key && t.gpx === key);
    if (dup) { dup.len = Math.max(dup.len, +r["조성길이(m)"]); dup.years.push(+r["조성연도"]); continue; } // 같은 길을 해를 나눠 조성한 것
    trails.push({ name, years: [+r["조성연도"]], org: r["관리기관"].trim(), addr: r["주소"], sigun: sigunOf(r["주소"]) || sigunOf("강원 " + r["주소"]), lat, lng, len: +r["조성길이(m)"], ...(key ? { gpx: key, line: gpx[key] } : {}) });
  }
  await writeFile(new URL("../public/bf-trails.json", import.meta.url), JSON.stringify({ source: "한국산림복지진흥원 전국 무장애나눔길 목록(2025-12-31)·공간정보(2026-09-01)", trails: trails.map(({ gpx: _g, ...t }) => t) }).replace(/\},\{"name"/g, '},\n{"name"') + "\n");
  report.push(`## 무장애나눔길 (강원 ${trails.length}곳, 선 자료 있는 곳 ${trails.filter((t) => t.line).length}곳)`, "", ...trails.map((t) => `- ${t.name} · ${t.sigun || "?"} · ${t.len}m · ${t.years.join("·")}년 · ${t.line ? `선 ${t.line.flat().length}점` : "선 자료 없음(위치만)"}`), "", `쓰지 않은 선 자료: ${Object.keys(gpx).filter((k) => !usedGpx.has(k)).join(", ") || "없음"}`, "");

  // ② 열린관광지
  const open = parseCSV(await readFile(F("open-tourism-gangwon.csv"), "utf8")), openOut = {}, openMiss = [];
  for (const r of open) {
    const title = r["관광지명"].replace(/\?/g, "·"), sg = sigunOf(r["주소"]);
    const cands = places.filter((p) => (!sigun[p.id] || !sg || sigun[p.id] === sg)).map((p) => ({ p, j: judge(p, title.replace(/^(춘천|횡성|속초|강릉|동해|정선)\s+/, ""), "12") })).filter((x) => x.j.ok).sort((a, b) => b.j.score - a.j.score);
    if (cands[0]) openOut[cands[0].p.id] = { title, tel: r["연락처"], year: 2022 };
    else openMiss.push(title);
  }
  await writeFile(new URL("../public/open-sites.json", import.meta.url), JSON.stringify({ source: "한국관광공사 열린관광지 목록 (2022-08-04)", places: openOut }) + "\n");
  report.push(`## 열린관광지 (강원 ${open.length}곳 중 앱 장소와 맞은 곳 ${Object.keys(openOut).length}곳)`, "", ...Object.entries(openOut).map(([id, v]) => `- ${places.find((p) => p.id === id).name} ← ${v.title}`), "", `앱에 없는 열린관광지: ${openMiss.join(", ")}`, "");

  // ③ 공중화장실
  const rows = parseCSV(await readFile(F("public-toilets-gangwon.csv"), "utf8"));
  const n = (v) => Number(v) || 0;
  const info = (r) => { const m = n(r["남성용-장애인용대변기수"]), w = n(r["여성용-장애인용대변기수"]); return { name: r["화장실명"], acc: m + w > 0, ...(m + w > 0 ? { accM: m, accW: w } : {}), ...(r["개방시간상세"] || r["개방시간"] ? { open: [r["개방시간"], r["개방시간상세"]].filter(Boolean).join(" ").slice(0, 40) } : {}), ...(r["기저귀교환대유무"] === "Y" ? { diaper: true } : {}), ref: (r["데이터기준일자"] || "").slice(0, 10) }; };
  const dir = JSON.parse(await readFile(new URL("../public/directory.json", import.meta.url), "utf8")).places.filter((p) => p.address && p.lat);
  const na = (a) => String(a || "").replace(/\s+|\(.*?\)|강원특별자치도|강원도|^강원/g, "");
  const byAddr = new Map(dir.map((p) => [na(p.address), p]));
  const located = [];
  for (const r of rows) {
    const d = byAddr.get(na(r["소재지도로명주소"])) || byAddr.get(na(r["소재지지번주소"]));
    if (d && places.some((p) => Math.abs(p.lat - d.lat) < 0.02 && km(p, d) <= 1)) located.push({ ...info(r), lat: +d.lat.toFixed(6), lng: +d.lng.toFixed(6), at: d.name });
  }
  const seen = new Set(); const items = located.filter((x) => { const k = x.name + x.lat; if (seen.has(k)) return false; seen.add(k); return true; });
  await writeFile(new URL("../public/toilets.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), source: "행정안전부 공중화장실 파일 (좌표는 주소가 같은 관광공사 등록 시설의 좌표)", items }).replace(/\},\{/g, "},\n{") + "\n");
  const named = {}, namedLines = [];
  for (const p of places) {
    const names = [...new Set([p.name, ...(p.alias || [])].map((x) => core(x.replace(/\s*\([^)]*\)/g, ""))).filter((x) => x.length >= 3))];
    // 이름만 비슷한 다른 시설(주유소·운동장·행정복지센터·역 등)은 뺀다. 음식점·카페는 이름이 일반 낱말과 겹치기 쉬워 대조하지 않는다
    if (["food", "cafe"].includes(p.cat) && !(p.multi && /(시장|항)$/.test(p.name))) continue;
    const OTHER = /(주유소|충전소|행정복지센터|주민센터|운동장|테니스장|축구장|풋살장|구장|가든|정류장|펜션|모텔|마트|편의점|교회|학교|보건|파출소|역$|역\))/;
    // 이름은 겹치지만 다른 곳으로 확인한 것 (도로 이름, 이웃한 다른 시설)
    const WRONG = /(민둥산로|청령 포레스트|청령포원)/;
    const dup = new Set();
    const hit = rows.filter((r) => sigunOf(r["소재지도로명주소"] || r["소재지지번주소"]) === sigun[p.id] && names.some((nm) => core(r["화장실명"]).includes(nm)) && (!OTHER.test(r["화장실명"]) || OTHER.test(p.name)) && !WRONG.test(r["화장실명"]))
      .filter((r) => { const k = core(r["화장실명"]) + na(r["소재지도로명주소"] || r["소재지지번주소"]); if (dup.has(k)) return false; dup.add(k); return true; });
    if (!hit.length) continue;
    named[p.id] = hit.slice(0, 6).map((r) => ({ ...info(r), addr: (r["소재지도로명주소"] || r["소재지지번주소"]).replace(/^강원(특별자치도|도)?\s*/, "") }));
    namedLines.push(`- ${p.name}: ${hit.map((r) => `${r["화장실명"]}${info(r).acc ? "(장애인용 있음)" : ""}`).join(" / ")}`);
  }
  await writeFile(new URL("../public/toilets-named.json", import.meta.url), JSON.stringify({ source: "행정안전부 공중화장실 파일", places: named }).replace(/\],"/g, '],\n"') + "\n");
  report.push(`## 공중화장실 (강원 ${rows.length}곳, 장애인용 변기 있는 곳 ${rows.filter((r) => info(r).acc).length}곳)`, "", `- 파일에 좌표가 없다. 주소가 관광공사 등록 시설과 같은 것 중 앱 장소 1km 안 ${items.length}곳만 지도에 표시(toilets.json).`, `- 이름에 앱 장소 이름이 들어 있는 화장실: ${Object.keys(named).length}곳의 장소(toilets-named.json)`, "", ...namedLines, "");
  await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
  await writeFile(new URL("../reports/public-files.md", import.meta.url), report.join("\n"));
  console.log(`무장애나눔길 ${trails.length}(선 ${trails.filter((t) => t.line).length}) · 열린관광지 ${Object.keys(openOut).length}/${open.length} · 화장실 지도 ${items.length} · 이름 대조 ${Object.keys(named).length}곳`);
}
