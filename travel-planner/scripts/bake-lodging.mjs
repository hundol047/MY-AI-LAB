// 숙소 지역마다 실제 숙소를 추천한다: 한국관광공사 숙박 정보(areaBasedList2, contentTypeId 32)를 받아
// public/lodging-places.json({숙소지역id: {종류: [숙소…]}})과 reports/lodging.md를 만든다.
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-lodging.mjs
// - 종류는 관광공사 분류(lclsSystm3)로 나눈다: 호텔 AC01, 콘도·리조트 AC02, 펜션 AC0301, 한옥 AC0302, 민박 AC0303, 모텔 AC04, 게스트하우스 AC06
// - "전망 좋은 호텔"은 관광공사 소개글에 바다·호수 전망이 적힌 호텔을 앞에 두고, 그때만 view: true (전망을 지어내지 않는다)
// - 숙소 지역 중심 3km 안(없으면 6km), 사진 있는 곳을 먼저, 가까운 순으로 3곳
import { writeFile, mkdir } from "node:fs/promises";
import { LODGING } from "../public/data.js";
import { tour, km, https } from "./tour-api.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };

let all = [];
for (let page = 1; page <= 40; page++) {
  const items = await tour("KorService2", "areaBasedList2", { lDongRegnCd: "51", contentTypeId: "32", numOfRows: "100", pageNo: String(page), arrange: "C" }, opts);
  all = all.concat(items);
  if (items.length < 100) break;
}
all = all.filter((x) => Number(x.mapy) > 0 && Number(x.mapx) > 0);

const kindOf = (x) => {
  const c = String(x.lclsSystm3 || "");
  if (c.startsWith("AC01")) return "hotel";
  if (c.startsWith("AC02")) return "resort";
  if (c.startsWith("AC0301")) return "pension";
  if (c.startsWith("AC0302") || x.cat3 === "B02011600" || /한옥|고택/.test(x.title)) return "hanok";
  if (c.startsWith("AC0303") || c.startsWith("AC06")) return "guesthouse";
  if (c.startsWith("AC04")) return "motel";
  return null;
};
// 앱의 숙소 종류 → 관광공사 분류
const WANT = { ocean: ["hotel", "resort"], business: ["hotel", "motel"], resort: ["resort"], pension: ["pension"], hanok: ["hanok"], guesthouse: ["guesthouse"] };
const VIEW = /(오션\s*뷰|바다\s*(전망|조망|뷰)|바다가\s*(한눈에\s*)?(보|펼쳐)|바다를\s*(조망|바라|감상)|동해\s*바다를?\s*(조망|바라|감상)|수평선|호수\s*(전망|조망|뷰)|레이크\s*뷰|경포호를?\s*(조망|바라)|객실에서\s*(바다|호수))/;

const overviewCache = new Map();
async function overview(id) {
  if (!overviewCache.has(id)) {
    const [d] = await tour("KorService2", "detailCommon2", { contentId: String(id) }, opts).catch(() => [{}]);
    overviewCache.set(id, String(d?.overview || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  }
  return overviewCache.get(id);
}

const out = {}, report = [];
for (const l of LODGING) {
  out[l.id] = {};
  for (const type of l.types) {
    const kinds = WANT[type] || [];
    let pool = [];
    for (const radius of [3, 6]) {
      pool = all.filter((x) => kinds.includes(kindOf(x))).map((x) => ({ x, d: km(l, { lat: Number(x.mapy), lng: Number(x.mapx) }) })).filter((c) => c.d <= radius);
      if (pool.length >= 2) break;
    }
    if (!pool.length) { report.push({ l, type, list: [] }); continue; }
    pool.sort((a, b) => a.d - b.d);
    if (type === "ocean") {
      // 가까운 호텔 10곳의 소개글에서 전망 언급을 찾는다
      for (const c of pool.slice(0, 10)) c.view = VIEW.test(await overview(c.x.contentid));
    }
    pool.sort((a, b) => (type === "ocean" ? (b.view ? 1 : 0) - (a.view ? 1 : 0) : 0) || (b.x.firstimage ? 1 : 0) - (a.x.firstimage ? 1 : 0) || a.d - b.d);
    const list = pool.slice(0, 3).map(({ x, d, view }) => ({
      id: String(x.contentid), name: x.title.trim(), lat: Number(Number(x.mapy).toFixed(5)), lng: Number(Number(x.mapx).toFixed(5)),
      km: Number(d.toFixed(1)), photo: x.firstimage ? https(x.firstimage) : "", addr: x.addr1 || "", ...(view ? { view: true } : {}),
    }));
    out[l.id][type] = list;
    report.push({ l, type, list });
  }
}
await writeFile(new URL("../public/lodging-places.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");

const esc = (s) => String(s).replace(/\|/g, "\\|");
const md = [
  "# 숙소 추천 리포트 (한국관광공사 숙박 정보)", "",
  `생성: node scripts/bake-lodging.mjs. 강원 숙박 ${all.length}곳에서 숙소 지역 중심 3km(없으면 6km) 안, 사진 있는 곳 먼저, 가까운 순. "바다·호수 전망"은 관광공사 소개글에 적힌 경우만.`, "",
  "| 숙소 지역 | 종류 | 추천 | ",
  "|---|---|---|",
  ...report.map(({ l, type, list }) => `| ${l.name} | ${type} | ${list.length ? list.map((h) => `${esc(h.name)} (${h.km}km${h.view ? ", 전망 언급" : ""}${h.photo ? "" : ", 사진 없음"})`).join(" · ") : "근처에 없음"} |`), "",
];
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/lodging.md", import.meta.url), md.join("\n"));
const n = report.filter((r) => r.list.length).length;
console.log(`숙소 지역 ${LODGING.length}곳 · 종류 ${report.length}개 중 ${n}개에 추천 · 전망 언급 ${report.flatMap((r) => r.list).filter((h) => h.view).length}곳 → public/lodging-places.json, reports/lodging.md`);
