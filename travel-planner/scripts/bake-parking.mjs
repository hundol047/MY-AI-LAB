// 주차 정보: 한국관광공사 소개정보(detailIntro2)의 주차·주차요금 원문을 앱 장소에 붙인다 (자동차·택시 일정 카드에 표시)
// 장소 번호(contentid)는 p.kto, 없으면 국문 검색 결과(캐시)에서 이름·거리로 맞춘 것만 쓴다
// 출력: public/parking.json ({builtAt, places: {장소 id: {ok: true|false|null, fee: "free"|"paid"|null, text}}}), reports/parking.md
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-parking.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { candidates, tour, maxKmFor } from "./tour-api.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };
const { PLACES } = await import("../public/data.js");
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// 관광지 12, 문화시설 14, 레포츠 28, 쇼핑 38, 음식점 39
const FIELDS = { 12: ["parking"], 14: ["parkingculture", "parkingfee"], 28: ["parkingleports", "parkingfeeleports"], 38: ["parkingshopping"], 39: ["parkingfood"] };
export function readParking(text, feeText = "") {
  const t = `${text} ${feeText}`;
  if (!t.trim()) return null;
  // "불가능"에도 "가능"이 들어 있으므로 부정 표현을 먼저 지우고 긍정 표현을 찾는다
  const rest = text.replace(/불가능|불가|없음|주차장\s*없[음다]?|주차\s*안\s*됨/g, "");
  const no = /불가|없음|주차장\s*없|주차\s*안\s*됨/.test(text) && !/가능|있음/.test(rest);
  const ok = no ? false : /가능|있음|주차장|대\b|\d+\s*대|무료|유료/.test(t) ? true : null;
  const fee = /무료/.test(t) && !/유료/.test(t) ? "free" : /유료|\d[\d,]*\s*원/.test(t) ? "paid" : null;
  return { ok, fee, text: [text, feeText].filter(Boolean).join(" · ").slice(0, 80) };
}
const out = {}, rows = [];
for (const p of PLACES.filter((x) => !x.multi && !x.petOnly && x.cat !== "festival")) {
  let id = p.kto, type = null;
  if (!id) {
    const list = await candidates("KorService2", p, opts).catch(() => []);
    const m = list.find((c) => c.ok && c.km <= maxKmFor(p));
    if (m) { id = m.contentid; type = m.contenttypeid; }
  }
  if (!id) { rows.push(`- ${p.name}: 관광공사 항목 없음`); continue; }
  if (!type) {
    const [c] = await tour("KorService2", "detailCommon2", { contentId: String(id) }, opts).catch(() => [null]);
    type = c?.contenttypeid;
  }
  if (!FIELDS[type]) { rows.push(`- ${p.name}: 주차 항목이 없는 종류(${type})`); continue; }
  const [intro] = await tour("KorService2", "detailIntro2", { contentId: String(id), contentTypeId: String(type) }, opts).catch(() => [null]);
  if (!intro) { rows.push(`- ${p.name}: 소개정보를 받지 못함`); continue; }
  const [pk, fee] = FIELDS[type].map((f) => clean(intro[f]));
  const r = readParking(pk, fee);
  if (!r) { rows.push(`- ${p.name}: 주차 원문 비어 있음`); continue; }
  out[p.id] = r;
  process.stdout.write(".");
}
await writeFile(new URL("../public/parking.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), source: "한국관광공사 국문 관광정보 소개정보(주차)", places: out }) + "\n");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
const n = Object.values(out);
await writeFile(new URL("../reports/parking.md", import.meta.url), ["# 주차 정보 (한국관광공사 소개정보)", "", `생성: node scripts/bake-parking.mjs. 붙인 곳 ${n.length}곳 (가능 ${n.filter((x) => x.ok).length} · 불가 ${n.filter((x) => x.ok === false).length} · 무료 ${n.filter((x) => x.fee === "free").length} · 유료 ${n.filter((x) => x.fee === "paid").length})`, "", ...Object.entries(out).map(([id, v]) => `- ${id}: ${v.ok === true ? "가능" : v.ok === false ? "불가" : "?"} ${v.fee || ""} — ${v.text}`), "", "## 못 붙인 곳", "", ...rows, ""].join("\n"));
console.log(`\n주차 정보 ${n.length}곳 → public/parking.json, reports/parking.md`);
