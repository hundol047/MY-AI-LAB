// 무장애 정보 조사: 관광공사 무장애 API 대조(bake-access.mjs)에서 빠진 장소를 한국관광공사 열린관광 누리집 '모두의 여행'
// (access.visitkorea.or.kr)에서 이름으로 찾아, 상세 화면의 "무장애 편의정보"(지체장애·고령자·영유아가족)를 원문 그대로 옮긴다.
// 같은 곳 판정은 사진·영문 대조와 같은 규칙(scripts/tour-api.mjs의 judge: 이름 대응) + 같은 시군 + 좌표 2km 안.
// 출력: scripts/access-web-raw.json (조사 원본) → node scripts/build-access-web.mjs 가 검사해 public/access-web.json으로 만든다.
// 실행: node scripts/research-access-web.mjs [--all]   (--all: 이미 관광공사 조사가 있는 곳도 다시 조사. 인증키 필요 없음. 0.4초 간격으로 천천히)
import { writeFile, readFile } from "node:fs/promises";
import { PLACES } from "../public/data.js";
import { judge, km, nameVariants } from "./tour-api.mjs";

const BASE = "https://access.visitkorea.or.kr";
const SRC = "한국관광공사 열린관광 모두의 여행";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
// 누리집 항목 이름 → 앱 항목 이름
const KEY = [[/주차/, "주차"], [/접근로/, "접근로"], [/출입(통로|구)|출입문/, "출입구"], [/엘리베이터|승강기/, "엘리베이터"], [/화장실/, "화장실"], [/휠체어/, "휠체어"], [/유모차/, "유모차"], [/수유실/, "수유실"], [/대중교통|저상버스/, "대중교통"]];
const keyOf = (label) => (KEY.find(([re]) => re.test(label)) || [null, "기타"])[1];

async function post(path, data) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }, body: new URLSearchParams(data), signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (r?.ok) return r.json().catch(() => null);
    await sleep(1500 * (i + 1));
  }
  return null;
}
async function page(cotId) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${BASE}/common/goDetail.do?cotId=${cotId}`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (r?.ok) return { html: await r.text(), url: r.url };
    await sleep(1500 * (i + 1));
  }
  return null;
}
// 상세 화면에서 무장애 편의정보(pc용 한 벌만)와 좌표·수정일을 읽는다
export function parseDetail(html) {
  const lat = Number((html.match(/locationX\s*=\s*'([\d.]+)'/) || [])[1]), lng = Number((html.match(/locationY\s*=\s*'([\d.]+)'/) || [])[1]);
  const date = ((html.match(/수정일\s*:\s*(\d{4})\.(\d{2})/) || []).slice(1, 3).join("-")) || "";
  const sec = (html.match(/<div class="barrierfree_info[\s\S]*?<div class="pc">([\s\S]*?)<\/div>\s*<!--\s*\/\/\s*pc|<div class="barrierfree_info[\s\S]*?<div class="pc">([\s\S]*?)<div class="mo/) || []);
  const body = sec[1] || sec[2] || "";
  const items = [];
  // 구역(지체장애·시각장애·청각장애·영유아가족·고령자)별로 나눠 이동과 관계있는 구역만
  for (const part of body.split(/<div id="area[A-Z]\d*"/).slice(1)) {
    const who = clean((part.match(/<h4[^>]*>([\s\S]*?)<\/h4>/) || [])[1]);
    if (!/지체장애|고령자|영유아/.test(who)) continue;
    for (const m of part.matchAll(/<li>\s*<em>([\s\S]*?)<\/em>\s*<span>([\s\S]*?)<\/span>\s*<\/li>/g)) {
      const label = clean(m[1]), text = clean(m[2]);
      if (!label || !text) continue;
      items.push({ who, label, text });
    }
  }
  return { lat, lng, date, items };
}

if (process.argv[1]?.endsWith("research-access-web.mjs")) {
  const all = process.argv.includes("--all");
  const sigun = JSON.parse(await readFile(new URL("../public/pet.json", import.meta.url), "utf8")).sigun || {};
  const targets = PLACES.filter((p) => !p.petOnly && p.cat !== "festival" && !p.multi && (all || !p.access));
  const places = {}, log = [];
  let found = 0, n = 0;
  for (const p of targets) {
    n++;
    const type = ["food", "cafe"].includes(p.cat) ? "food" : "ms";
    // 검색어: 이름, '·'로 나뉜 조각, 다른 이름, 앞의 지역명을 뺀 이름 ("화천 꺼먹다리" → "꺼먹다리"). 판정은 아래 judge가 다시 한다
    const base = p.name.replace(/\s*\([^)]*\)/g, "").trim();
    const queries = [...new Set([base, ...base.split(/[·,]/).map((x) => x.trim()), ...(p.alias || []), base.replace(/^(강릉|동해|삼척|속초|양양|고성|인제|춘천|철원|화천|홍천|양구|평창|정선|영월|태백|원주|횡성|설악산|오대산|치악산)\s+/, "")].filter((x) => x.length >= 2))].slice(0, 5);
    let pick = null;
    for (const q of queries) {
      const j = await post("/search/ajax/search_area_detail.do", { searchValue: q, areaCode: "", sigugunCode: "", type, knd: "1", page: "1", rowCnt: "30" });
      await sleep(400);
      for (const c of j?.list || []) {
        const d = c.databaseMasterVO || {};
        if (!/강원/.test(d.areaNm || "")) continue;
        if (sigun[p.id] && d.sigugunNm && !String(d.sigugunNm).startsWith(sigun[p.id])) continue;
        const r = judge(p, c.title, String(c.contentType));
        if (r.ok && (!pick || r.score > pick.score)) pick = { ...r, cotId: c.cotId, title: c.title, sigugun: d.sigugunNm };
      }
      if (pick) break;
    }
    if (!pick) { places[p.id] = []; continue; }
    const pg = await page(pick.cotId); await sleep(400);
    if (!pg) { places[p.id] = []; log.push(`${p.name}: 상세 화면을 받지 못함`); continue; }
    const d = parseDetail(pg.html);
    const dist = Number.isFinite(d.lat) && Number.isFinite(d.lng) && d.lat > 30 ? km(p, { lat: d.lat, lng: d.lng }) : null;
    if (dist == null || dist > Math.max(2, p.trailKm || 0)) { places[p.id] = []; log.push(`${p.name}: "${pick.title}" 좌표가 ${dist == null ? "없음" : dist.toFixed(1) + "km"} → 버림`); continue; }
    const seen = new Set();
    places[p.id] = d.items.map((it) => ({ k: keyOf(it.label), quote: (keyOf(it.label) === "기타" ? `${it.label}: ` : "") + it.text, url: pg.url.replace(/^\/\//, "https://"), src: SRC, date: d.date, title: pick.title }))
      .filter((x) => { const k = x.k + "|" + x.quote; if (seen.has(k)) return false; seen.add(k); return true; });
    if (places[p.id].length) { found++; log.push(`${p.name} ← "${pick.title}"(${pick.sigugun}, ${dist.toFixed(2)}km, ${pick.why}): ${places[p.id].length}개`); }
    if (n % 20 === 0) process.stdout.write(`${n}/${targets.length} `);
  }
  // --all 없이 돌리면 이전 조사(다른 장소)는 유지
  const prev = await readFile(new URL("./access-web-raw.json", import.meta.url), "utf8").then(JSON.parse).catch(() => ({ places: {} }));
  await writeFile(new URL("./access-web-raw.json", import.meta.url), JSON.stringify({ checkedAt: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), source: `${SRC} (${BASE})`, official: prev.official || {}, places: { ...prev.places, ...places } }, null, 1) + "\n");
  console.log(`\n조사 ${targets.length}곳 중 ${found}곳에서 무장애 편의정보를 찾음`);
  console.log(log.join("\n"));
}
