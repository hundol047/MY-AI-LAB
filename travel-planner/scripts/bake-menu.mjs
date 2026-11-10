// 식당·카페 메뉴: 한국관광공사 국문 관광정보 소개정보(detailIntro2, 음식점 39)의 대표 메뉴·취급 메뉴·어린이 놀이방·포장·예약 안내를 그대로 붙인다
// 장소 카드에 "대표 메뉴 · …" 한 줄로 보인다 (한국어 화면). 가격은 관광공사 자료에 없으므로 쓰지 않는다
// 장소 번호(contentid)는 p.kto, 없으면 국문 검색 결과(캐시)에서 이름·거리로 맞춘 음식점만 쓴다
// 출력: public/menu.json ({builtAt, source, places: {장소 id: {first, menu, kids, pack, reserve}}}), reports/menu.md
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-menu.mjs
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { candidates, tour, maxKmFor } from "./tour-api.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };
const { PLACES } = await import("../public/data.js");
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/^[\s/,·-]+|[\s/,·-]+$/g, "").trim();
// "없음" "-" "문의" 같은 빈 값은 버린다
const val = (s, max = 60) => { const v = clean(s); return !v || /^(없음|무|불가|-|문의|해당\s*없음|0)$/.test(v) || v.length > max ? "" : v; };
const yes = (s) => /^(1|가능|있음|유)/.test(clean(s));
const prev = JSON.parse(await readFile(new URL("../public/menu.json", import.meta.url), "utf8").catch(() => "{}")).places || {};
const out = {}, rows = [];
let failed = 0;
for (const p of PLACES.filter((x) => (x.cat === "food" || x.cat === "cafe") && !x.multi)) {
  let id = p.kto;
  if (!id) {
    const list = await candidates("KorService2", p, opts).catch(() => null);
    if (!list) { failed++; if (prev[p.id]) out[p.id] = prev[p.id]; rows.push(`- ${p.name}: 검색 실패`); continue; }
    id = list.find((c) => c.ok && c.km <= maxKmFor(p) && String(c.contenttypeid) === "39")?.contentid;
  }
  if (!id) { rows.push(`- ${p.name}: 관광공사 음식점 항목 없음`); continue; }
  const res = await tour("KorService2", "detailIntro2", { contentId: String(id), contentTypeId: "39" }, opts).catch(() => null);
  if (!res) { failed++; if (prev[p.id]) out[p.id] = prev[p.id]; rows.push(`- ${p.name}: 소개정보 조회 실패`); continue; }
  const r = res[0] || {};
  const first = val(r.firstmenu, 40);
  let menu = val(r.treatmenu, 80);
  if (menu && first && menu.replace(/\s/g, "") === first.replace(/\s/g, "")) menu = "";
  const o = {};
  if (first) o.first = first;
  if (menu) o.menu = menu;
  if (yes(r.kidsfacility)) o.kids = true;
  if (yes(r.packing)) o.pack = true;
  const rsv = val(r.reservationfood, 40);
  if (rsv) o.reserve = rsv;
  // 전화번호: 예약·영업 확인용 (번호 모양만)
  const tel = clean(r.infocenterfood).match(/0\d{1,2}-\d{3,4}-\d{4}/)?.[0];
  if (tel) o.tel = tel;
  if (!Object.keys(o).length) { rows.push(`- ${p.name}: 메뉴 정보 없음`); continue; }
  out[p.id] = o;
  process.stdout.write(".");
}
await writeFile(new URL("../public/menu.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), source: "한국관광공사 국문 관광정보 (음식점 소개정보)", places: out }) + "\n");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/menu.md", import.meta.url), ["# 식당·카페 메뉴 (한국관광공사 음식점 소개정보)", "", `생성: node scripts/bake-menu.mjs. 붙인 곳 ${Object.keys(out).length}곳${failed ? ` · API 실패 ${failed}곳` : ""}`, "", "## 못 붙인 곳", "", ...rows, ""].join("\n"));
console.log(`\n메뉴 ${Object.keys(out).length}곳${failed ? ` (API 실패 ${failed}곳)` : ""} → public/menu.json, reports/menu.md`);
