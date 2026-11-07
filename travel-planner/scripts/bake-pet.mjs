// 반려동물 동행 데이터 만들기
// 입력: data/pet-friendly-2025-11-07.csv (강원 반려동물 동반 시설 목록, 공공데이터포털 파일을 UTF-8로 바꾼 것: 번호,장소,지역,주소,구분,전화번호)
// 출력:
//   public/pet.json        { places: {앱장소id: 목록 이름}, stays/vets/pharmacies: {시군: [{name, addr, tel}]}, sigun: {앱장소id: 시군} }
//   public/pet-places.js   목록의 관광지·체험·식음료 중 앱에 없는 곳을 관광공사에서 찾아 좌표·영업시간을 붙인 장소 (petOnly: 반려동물 동행일 때만 일정에 씀)
//   reports/pet.md         대조 결과
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-pet.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { candidates, tour, judge, firstSentence } from "./tour-api.mjs";
import { parseKtoHours, parseKtoClosed } from "../public/directory-place.js";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };
const { PLACES, AREAS } = await import("../public/data.js");
const base = PLACES.filter((p) => !p.petOnly);
// 따옴표 안의 쉼표("…로 307, 16층")는 칸 구분이 아니다
const splitCsv = (line) => { const out = []; let cur = "", q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
const rows = (await readFile(new URL("../data/pet-friendly-2025-11-07.csv", import.meta.url), "utf8")).trim().split(/\r?\n/).slice(1)
  // 원자료에 HTML 문자 참조(&#39; 등)가 섞여 있어 글자로 바꾼다
  .map((l) => splitCsv(l).map((v) => v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")))
  .map(([no, name, sigun, addr, kind, tel]) => ({ no, name: name.trim(), sigun, addr: addr.replace(/\s+/g, " ").trim(), kind, tel: (tel || "").trim() }));

// 앱 장소의 시군: 관광공사 탐색 목록에서 가장 가까운 곳의 주소로 정한다
const SG = ["춘천", "원주", "강릉", "동해", "태백", "속초", "삼척", "홍천", "횡성", "영월", "평창", "정선", "철원", "화천", "양구", "인제", "고성", "양양"];
const dir = JSON.parse(await readFile(new URL("../public/directory.json", import.meta.url), "utf8")).places.filter((p) => p.source?.includes("TourAPI") && p.address);
const sigunAt = (pt) => { let b = null, bd = Infinity; for (const q of dir) { const d = (q.lat - pt.lat) ** 2 + (q.lng - pt.lng) ** 2; if (d < bd) { bd = d; b = q; } } return SG.find((s) => b.address.includes(s)) || null; };
const sigun = Object.fromEntries(base.map((p) => [p.id, sigunAt(p)]));

// 1) 앱 장소와 대조: 같은 시군, 식당·카페는 식음료끼리, 나머지는 관광지·체험끼리. 이름 규칙(사진 대조와 같은 규칙)에서
//    "이름 같음"·"앞에 지역명 추가"만 인정한다. 규칙이 놓친 같은 곳은 사람이 확인해 MANUAL에 적는다.
const MANUAL = { "hoengseong-lake": "횡성호수길5코스", "yeongjin-beach": "영진해변", "jeongdongjin": "정동진", "anmok-coffee": "강릉커피거리", "sokcho-market": "속초 관광수산시장", "hanbando": "한반도지형", "daepo": "대포항" };
const places = {}, used = new Set();
for (const p of base) {
  const food = ["food", "cafe"].includes(p.cat);
  const pool = rows.filter((r) => r.sigun === sigun[p.id] && (food ? r.kind === "식음료" : ["관광지", "체험"].includes(r.kind)));
  // MANUAL은 분류가 달라도(예: 앱은 카페거리=카페, 목록은 관광지) 같은 곳으로 본다
  const m = MANUAL[p.id] ? rows.find((r) => r.sigun === sigun[p.id] && r.name === MANUAL[p.id]) : pool.find((r) => { const j = judge(p, r.name); return j.ok && /이름 같음|앞에 지역명/.test(j.why) && j.why !== "앞 이름 같음"; });
  if (m) { places[p.id] = m.name; used.add(m.no); }
}

// 2) 앱에 없는 관광지·체험·식음료: 관광공사에서 같은 시군·같은 이름을 찾아 좌표·영업시간을 붙인다
const CENTER = Object.fromEntries(SG.map((s) => { const pts = base.filter((p) => sigun[p.id] === s); return [s, pts.length ? { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length } : null]; }));
const FIELDS = { 12: ["usetime", "restdate"], 14: ["usetimeculture", "restdateculture"], 28: ["usetimeleports", "restdateleports"], 38: ["opentime", "restdateshopping"], 39: ["opentimefood", "restdatefood"] };
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const extra = [], report = [];
const coords = JSON.parse(await readFile(new URL("../data/pet-coords.json", import.meta.url), "utf8").catch(() => "{}"));
let n = 0;
for (const r of rows.filter((x) => !used.has(x.no) && ["관광지", "체험", "식음료"].includes(x.kind))) {
  const c = CENTER[r.sigun];
  if (!c) { report.push({ r, why: "시군 기준점 없음" }); continue; }
  const list = await candidates("KorService2", { id: `pet-${r.no}`, name: r.name, lat: c.lat, lng: c.lng }, opts).catch(() => []);
  const m = list.find((x) => x.ok && /이름 같음|앞에 지역명/.test(x.why) && x.why !== "앞 이름 같음" && String(x.addr1 || "").includes(r.sigun) && String(x.contenttypeid) !== "32" && FIELDS[x.contenttypeid]);
  if (!m) {
    // 관광공사에 없지만 주소로 좌표를 찾아 둔 곳(data/pet-coords.json, scripts/geocode-pet.mjs): 영업시간을 모르므로 가정값으로 넣고 카드에 밝힌다
    const g = coords[r.no];
    if (!g) { report.push({ r, why: "관광공사에서 같은 곳을 못 찾음" }); continue; }
    const near = base.find((p) => Math.hypot((p.lat - g.lat) * 111, (p.lng - g.lng) * 88) < 0.3);
    if (near) { places[near.id] ??= r.name; report.push({ r, why: `앱 장소 ${near.name}와 같은 곳(300m 안)으로 표시` }); continue; }
    let area = null, best = Infinity;
    for (const [k, a] of Object.entries(AREAS)) { const d = (a.lat - g.lat) ** 2 + (a.lng - g.lng) ** 2; if (d < best) { best = d; area = k; } }
    const food = r.kind === "식음료", cafe = food && /카페|커피|베이커리|빵|브루|로스터|디저트/i.test(r.name);
    // 목록에 같은 시설이 이름만 바꿔 두 번 있는 경우(예: "아름들 반려견쉼터"·"반려견쉼터 아름들"): 같은 좌표·같은 종류면 하나만 둔다
    const twin = extra.find((x) => x.lat === Number(g.lat.toFixed(4)) && x.lng === Number(g.lng.toFixed(4)) && x.cat === (food ? (cafe ? "cafe" : "food") : "nature"));
    if (twin) { places[`pet-${r.no}`] = r.name; report.push({ r, why: `목록에 같은 곳이 두 번 있음 (${twin.name})` }); continue; }
    const hours = cafe ? ["10:00", "19:00"] : food ? ["11:00", "20:00"] : ["09:00", "18:00"];
    extra.push({ region: AREAS[area].region, id: `pet-${r.no}`, name: r.name, cat: food ? (cafe ? "cafe" : "food") : "nature", area, lat: Number(g.lat.toFixed(4)), lng: Number(g.lng.toFixed(4)),
      hours, closed: [], stay: cafe ? 50 : 60, indoor: food, walk: 1, pop: 1, tags: [], petOnly: true, hoursGuessed: true,
      desc: (cafe ? "반려동물 동반 카페" : food ? "반려동물 동반 식당" : "반려동물 동반 가능") + ` · ${r.sigun}`, hoursText: "", addr: r.addr, ...(r.tel ? { tel: r.tel } : {}), wiki: r.name });
    places[`pet-${r.no}`] = r.name;
    report.push({ r, why: `관광공사에 없어 주소 좌표(${g.how})로 넣음 · 영업시간 가정 ${hours.join("–")}` });
    continue;
  }
  const [intro] = await tour("KorService2", "detailIntro2", { contentId: String(m.contentid), contentTypeId: String(m.contenttypeid) }, opts).catch(() => [{}]);
  const [tf, rf] = FIELDS[m.contenttypeid];
  const text = clean(intro?.[tf]), rest = clean(intro?.[rf]);
  const h = parseKtoHours(text);
  if (!h) { report.push({ r, why: `영업시간을 읽지 못함 (${text.slice(0, 40)})` }); continue; }
  // 쉬는날에 계절 휴무("동절기", "11월~3월")가 있으면 요일 규칙으로 옮길 수 없어 넣지 않는다
  if (/동절기|하절기|\d+\s*월\s*[~∼\-]|\d+월\s*(중순|초|말)/.test(rest)) { report.push({ r, why: `계절 휴무를 규칙으로 옮기지 못함 (${rest.slice(0, 40)})` }); continue; }
  if (extra.some((x) => x.kto === String(m.contentid))) { report.push({ r, why: "목록에 같은 곳이 두 번 있음" }); continue; }
  const lat = Number(Number(m.mapy).toFixed(4)), lng = Number(Number(m.mapx).toFixed(4));
  // 앱에 이미 있는 장소와 300m 안이면 같은 곳으로 보고 그 장소를 동반 가능으로 표시한다
  const near = base.find((p) => Math.hypot((p.lat - lat) * 111, (p.lng - lng) * 88) < 0.3);
  if (near) { places[near.id] ??= r.name; report.push({ r, why: `앱 장소 ${near.name}와 같은 곳(300m 안)으로 표시` }); continue; }
  // "상시 개방"은 밤에 일정을 넣지 않도록 낮 시간으로
  if (h.hours[0] === "00:00" && h.hours[1] === "23:59") h.hours = ["06:00", "21:00"];
  let area = null, best = Infinity;
  for (const [k, a] of Object.entries(AREAS)) { const d = (a.lat - lat) ** 2 + (a.lng - lng) ** 2; if (d < best) { best = d; area = k; } }
  const isFood = String(m.contenttypeid) === "39";
  const cafe = isFood && /카페|커피|베이커리|빵|브루|로스터/i.test(`${r.name} ${m.title}`);
  extra.push({
    region: AREAS[area].region, id: `pet-${r.no}`, name: r.name, cat: isFood ? (cafe ? "cafe" : "food") : String(m.contenttypeid) === "14" ? "culture" : "nature",
    area, lat, lng, hours: h.hours, ...(h.lastEntry ? { lastEntry: h.lastEntry } : {}), closed: parseKtoClosed(rest),
    stay: isFood ? (cafe ? 50 : 60) : 60, indoor: isFood || String(m.contenttypeid) === "14", walk: 1, pop: 1, tags: [], petOnly: true,
    desc: (cafe ? "반려동물 동반 카페" : isFood ? "반려동물 동반 식당" : "반려동물 동반 가능") + ` · ${r.sigun}`, hoursText: [text, rest].filter(Boolean).join(" · "), kto: String(m.contentid), ...(r.tel ? { tel: r.tel } : {}), wiki: r.name,
  });
  places[`pet-${r.no}`] = r.name;
  if (++n % 20 === 0) process.stdout.write(".");
}

// 3) 숙박·동물병원·약국: 시군별 목록 (좌표가 없어 지도는 이름 검색으로 연다)
const group = (kind) => { const o = {}; for (const r of rows.filter((x) => x.kind === kind)) (o[r.sigun] ??= []).push({ name: r.name, addr: r.addr, tel: r.tel }); return o; };
const out = { source: "강원 반려동물 동반 시설 목록 (공공데이터포털, 2025-11-07 파일)", places, stays: group("숙박"), vets: group("동물병원"), pharmacies: group("약국"), sigun: { ...sigun, ...Object.fromEntries(extra.map((p) => [p.id, rows.find((r) => `pet-${r.no}` === p.id).sigun])) } };
await writeFile(new URL("../public/pet.json", import.meta.url), JSON.stringify(out) + "\n");
await writeFile(new URL("../public/pet-places.js", import.meta.url), `// 반려동물 동행 데이터 (scripts/bake-pet.mjs가 만듦 — 직접 고치지 않는다)
// PET_OK: 강원 반려동물 동반 시설 목록에 있는 앱 장소. PET_PLACES: 목록의 시설을 관광공사에서 찾아 좌표·영업시간(관광공사 원문)을 붙인 장소 (반려동물 동행일 때만 일정에 씀)
export const PET_OK = ${JSON.stringify(Object.keys(places).filter((id) => !id.startsWith("pet-")))};
export const PET_PLACES = [\n${extra.map((p) => "  " + JSON.stringify(p) + ",\n").join("")}];\n`);
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/pet.md", import.meta.url), [
  "# 반려동물 동행 대조 리포트", "", `생성: node scripts/bake-pet.mjs. 원자료: ${out.source}`, "",
  `- 목록 ${rows.length}곳 (숙박 ${rows.filter((r) => r.kind === "숙박").length} · 식음료 ${rows.filter((r) => r.kind === "식음료").length} · 관광지 ${rows.filter((r) => r.kind === "관광지").length} · 체험 ${rows.filter((r) => r.kind === "체험").length} · 동물병원 ${rows.filter((r) => r.kind === "동물병원").length} · 약국 ${rows.filter((r) => r.kind === "약국").length})`,
  `- 앱 장소와 같은 곳 ${Object.keys(places).filter((k) => !k.startsWith("pet-")).length}곳 · 관광공사에서 찾아 반려동물 동행 전용으로 더한 곳 ${extra.length}곳 · 못 넣은 곳 ${report.length}곳`, "",
  "## 앱 장소와 같은 곳", "", "| 앱 id | 목록 이름 |", "|---|---|", ...Object.entries(places).filter(([id]) => !id.startsWith("pet-")).map(([id, n]) => `| ${id} | ${esc(n)} |`), "",
  "## 반려동물 동행 전용으로 더한 곳", "", "| id | 이름 | 분류 | 영업시간(관광공사) |", "|---|---|---|---|", ...extra.map((p) => `| ${p.id} | ${esc(p.name)} | ${p.cat} | ${esc(p.hoursText).slice(0, 70)} |`), "",
  "## 못 넣은 곳", "", "| 번호 | 이름 | 시군 | 이유 |", "|---|---|---|---|", ...report.map(({ r, why }) => `| ${r.no} | ${esc(r.name)} | ${r.sigun} | ${esc(why)} |`), "",
].join("\n"));
console.log(`\n앱 장소 일치 ${Object.keys(places).filter((k) => !k.startsWith("pet-")).length} · 더한 곳 ${extra.length} · 못 넣음 ${report.length} → public/pet.json, public/pet-places.js, reports/pet.md`);
