// 장소 확대 초안: scripts/new-places.json의 후보를 한국관광공사 정보에서 찾아
// 좌표·주소·이용시간·쉬는날·소개 첫 문장을 reports/new-places-draft.json, reports/new-places.md로 만든다.
// 사람이 이 초안을 보고 data.js에 넣는다 (운영시간은 자동으로 일정에 들어가지 않는다).
// 실행: TOUR_API_KEY=Decoding키 node scripts/draft-places.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { candidates, tour, firstSentence } from "./tour-api.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };
const { areas: NEW_AREAS, places } = JSON.parse(await readFile(new URL("./new-places.json", import.meta.url), "utf8"));
const { AREAS } = await import("../public/data.js");
const area = (k) => NEW_AREAS[k] || AREAS[k];
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const FIELDS = { 12: ["usetime", "restdate"], 14: ["usetimeculture", "restdateculture"], 28: ["usetimeleports", "restdateleports"], 38: ["opentime", "restdateshopping"], 39: ["opentimefood", "restdatefood"], 15: ["playtime", ""] };

const out = [];
for (const c of places) {
  const a = area(c.area);
  // 검색어(q)로 못 찾으면 qs의 다른 이름으로 차례로 찾는다. 이름이 맞고 그 시군 주소인 것만
  let inTown = [], list = [];
  if (c.title) {
    // 사람이 관광공사 원래 제목을 정해 둔 곳 (이름 규칙으로는 안 맞지만 같은 곳임을 확인함)
    const rows = await tour("KorService2", "searchKeyword2", { keyword: c.title.replace(/\s*[[(].*$/, ""), numOfRows: "30", lDongRegnCd: "51" }, opts).catch(() => []);
    inTown = rows.filter((x) => x.title === c.title).map((x) => ({ ...x, ok: true, why: "사람이 정한 관광공사 제목", km: 0 }));
  }
  for (const q of inTown.length ? [] : [c.q, ...(c.qs || [])]) {
    list = await candidates("KorService2", { id: c.id, name: q, lat: a.lat, lng: a.lng }, opts).catch((e) => { console.error(c.id, e.message); return []; });
    inTown = list.filter((x) => String(x.addr1 || "").includes(c.sigun) && x.km < 45 && String(x.contenttypeid) !== "32");
    if (inTown.some((x) => x.ok)) break;
  }
  const m = inTown.find((x) => x.ok) || inTown[0];
  if (!m) { out.push({ ...c, found: false, others: list.slice(0, 3).map((x) => `${x.title} (${x.addr1})`) }); process.stdout.write("x"); continue; }
  const [intro] = FIELDS[m.contenttypeid] ? await tour("KorService2", "detailIntro2", { contentId: String(m.contentid), contentTypeId: String(m.contenttypeid) }, opts).catch(() => [{}]) : [{}];
  const [common] = await tour("KorService2", "detailCommon2", { contentId: String(m.contentid) }, opts).catch(() => [{}]);
  const [tf, rf] = FIELDS[m.contenttypeid] || [];
  out.push({
    ...c, found: true, match: m.ok ? m.why : `확인 필요: ${m.why}`, title: m.title, contentid: m.contentid, type: m.contenttypeid,
    addr: m.addr1, lat: Number(Number(m.mapy).toFixed(4)), lng: Number(Number(m.mapx).toFixed(4)), photo: m.firstimage || "",
    usetime: clean(intro?.[tf]), restdate: clean(intro?.[rf]), parking: clean(intro?.parking || intro?.parkingculture || intro?.parkingleports),
    overview: firstSentence(clean(common?.overview || "")) || clean(common?.overview || "").slice(0, 120),
  });
  process.stdout.write(".");
}
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/new-places-draft.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
await writeFile(new URL("../reports/new-places.md", import.meta.url), [
  "# 장소 확대 초안 (한국관광공사 정보)", "",
  "생성: node scripts/draft-places.mjs. 이용시간·쉬는날 원문을 보고 사람이 data.js의 hours·closed·seasons로 옮긴다.", "",
  `- 후보 ${out.length}곳 · 찾음 ${out.filter((x) => x.found).length}곳 · 못 찾음 ${out.filter((x) => !x.found).length}곳`, "",
  "| id | 시군 | 관광공사 제목 | 대조 | 이용시간 | 쉬는날 |", "|---|---|---|---|---|---|",
  ...out.map((x) => x.found ? `| ${x.id} | ${x.sigun} | ${esc(x.title)} | ${esc(x.match)} | ${esc(x.usetime).slice(0, 120)} | ${esc(x.restdate).slice(0, 60)} |` : `| ${x.id} | ${x.sigun} | (없음) | ${esc((x.others || []).join(" / ")).slice(0, 120)} | | |`),
  "",
].join("\n"));
console.log(`\n찾음 ${out.filter((x) => x.found).length}/${out.length} → reports/new-places.md`);
