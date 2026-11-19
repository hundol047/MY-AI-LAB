// 무장애 숙소·식당: 한국관광공사 무장애 여행 정보(KorWithService2)에 등록된 강원 숙박(32)·음식점(39)을 받아
// 휠체어·걷기 불편한 분이 쓸 만한 정보(접근로·출입구·엘리베이터·화장실·객실·주차·휠체어)가 원문에 있는 곳만 남긴다.
// 출력: public/access-spots.json ({stays: [...], food: [...]}), reports/access-spots.md
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-access-spots.mjs
// - 원문이 없는 항목은 지어내지 않는다. "있음"으로 읽히는 항목만 flags에 넣고, 원문(text)은 그대로 보여 준다.
// - 하루 호출 한도를 넘기면(429 등) 지난번 값을 그대로 둔다.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { tour, https } from "./tour-api.mjs";
import { textOf, flagsOf } from "./access-flags.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { key, cache: true };
const OUT = new URL("../public/access-spots.json", import.meta.url);
const PREV = await readFile(OUT, "utf8").then(JSON.parse).catch(() => ({ stays: [], food: [] }));
const prevById = new Map([...PREV.stays, ...PREV.food].map((x) => [x.id, x]));

// 휠체어 이동에 직접 관계있는 항목 (대중교통·유모차·유아 의자만 있으면 넣지 않는다)
const USEFUL = ["접근로", "출입구", "휠체어", "엘리베이터", "화장실", "객실", "주차"];
let failed = 0;
const rows = [];
async function bake(typeId) {
  const list = await tour("KorWithService2", "areaBasedList2", { lDongRegnCd: "51", contentTypeId: typeId, numOfRows: "1000", pageNo: "1" }, opts);
  const out = [];
  for (const it of list) {
    const lat = Number(it.mapy), lng = Number(it.mapx);
    if (!(lat > 0 && lng > 0)) continue;
    const res = await tour("KorWithService2", "detailWithTour2", { contentId: String(it.contentid) }, opts).catch(() => null);
    if (!res) { failed++; const old = prevById.get(String(it.contentid)); if (old) out.push(old); continue; }
    const text = textOf(res[0]);
    if (!USEFUL.some((k) => text[k])) { rows.push({ it, why: "휠체어 관련 원문 없음" }); continue; }
    const f = flagsOf(text);
    const flags = Object.keys(f).filter((k) => f[k] && !["stroller", "nursing"].includes(k));
    out.push({
      id: String(it.contentid), name: it.title.trim(), lat: +lat.toFixed(6), lng: +lng.toFixed(6),
      addr: it.addr1 || "", tel: (it.tel || "").replace(/<[^>]+>/g, "").trim(), photo: https(it.firstimage) || "",
      flags, text: Object.fromEntries(USEFUL.filter((k) => text[k]).map((k) => [k, text[k]])),
    });
    rows.push({ it, flags });
    process.stdout.write(".");
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
const stays = await bake("32");
const food = await bake("39");
await writeFile(OUT, JSON.stringify({ stays, food }));
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
const count = (arr, k) => arr.filter((x) => x.flags.includes(k)).length;
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/access-spots.md", import.meta.url), [
  "# 무장애 숙소·식당 리포트 (한국관광공사 무장애 여행 정보)", "",
  "생성: node scripts/bake-access-spots.mjs. 휠체어 이동에 관계있는 원문(접근로·출입구·휠체어·엘리베이터·화장실·객실·주차)이 있는 곳만 넣는다.", "",
  `- 숙소 ${stays.length}곳 (경사로·턱 없음 ${count(stays, "ramp")} · 엘리베이터 ${count(stays, "elevator")} · 장애인 객실 ${count(stays, "room")} · 장애인 화장실 ${count(stays, "toilet")})`,
  `- 식당 ${food.length}곳 (경사로·턱 없음 ${count(food, "ramp")} · 장애인 화장실 ${count(food, "toilet")} · 장애인 주차 ${count(food, "parking")})`,
  failed ? `- API 실패 ${failed}건 (지난 값 유지)` : "", "",
  "| 종류 | 이름 | 주소 | 확인된 항목 |", "|---|---|---|---|",
  ...[...stays.map((x) => ["숙소", x]), ...food.map((x) => ["식당", x])].map(([k, x]) => `| ${k} | ${esc(x.name)} | ${esc(x.addr)} | ${x.flags.join(", ")} |`), "",
].join("\n"));
console.log(`\n무장애 숙소 ${stays.length}곳 · 식당 ${food.length}곳${failed ? ` (API 실패 ${failed}건)` : ""} → public/access-spots.json, reports/access-spots.md`);
