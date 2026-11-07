// 음식점·카페 확대 초안: 시군별로 관광공사 음식점(contentTypeId 39) 중 사진이 있고 영업시간·쉬는날을 읽을 수 있는 곳을 모아
// reports/new-food-draft.json, reports/new-food.md를 만든다. 사람이 이 중에서 골라 scripts/new-places-review.json에 규칙을 적는다.
// 실행: TOUR_API_KEY=Decoding키 node scripts/draft-food.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { tour } from "./tour-api.mjs";
import { parseKtoHours, parseKtoClosed } from "../public/directory-place.js";

if (!process.env.TOUR_API_KEY) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }
const opts = { cache: true };
const clean = (s) => String(s || "").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// 음식점이 적은 시군 (관광공사 법정동 시군구 코드)
const SIGUN = { 720: "홍천", 730: "횡성", 750: "영월", 760: "평창", 770: "정선", 780: "철원", 790: "화천", 800: "양구", 810: "인제", 820: "고성", 830: "양양", 190: "태백", 230: "삼척", 170: "동해" };
const LOCAL = /막국수|닭갈비|한우|곤드레|황태|메밀|송어|산채|두부|순두부|곰치|물회|시래기|감자|옹심이|어죽|매운탕|더덕|올챙이|콧등치기|닭백숙|오삼|떡갈비|찐빵|커피|카페/;

const out = [];
for (const [code, sigun] of Object.entries(SIGUN)) {
  const rows = await tour("KorService2", "areaBasedList2", { lDongRegnCd: "51", lDongSignguCd: code, contentTypeId: "39", numOfRows: "60", arrange: "Q" }, opts).catch(() => []);
  let n = 0;
  for (const r of rows.filter((x) => x.firstimage && Number(x.mapx) > 0)) {
    if (n >= 12) break;
    const [d] = await tour("KorService2", "detailIntro2", { contentId: String(r.contentid), contentTypeId: "39" }, opts).catch(() => [{}]);
    const hours = parseKtoHours(clean(d?.opentimefood));
    if (!hours || hours.hours[0] === "00:00") continue;
    const menu = clean(`${d?.firstmenu || ""} ${d?.treatmenu || ""}`);
    const cafe = /카페|커피|베이커리|빵/.test(`${r.title} ${menu}`) || r.lclsSystm3 === "FD050100";
    n++;
    out.push({
      sigun, contentid: String(r.contentid), title: r.title, addr: r.addr1, lat: Number(Number(r.mapy).toFixed(4)), lng: Number(Number(r.mapx).toFixed(4)),
      photo: r.firstimage, cat3: r.lclsSystm3 || "", cafe, local: LOCAL.test(`${r.title} ${menu}`), menu: menu.slice(0, 80),
      opentime: clean(d?.opentimefood), restdate: clean(d?.restdatefood), hours: hours.hours, closed: parseKtoClosed(clean(d?.restdatefood)),
    });
  }
  process.stdout.write(`${sigun} ${n} `);
}
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/new-food-draft.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
await writeFile(new URL("../reports/new-food.md", import.meta.url), [
  "# 음식점·카페 후보 (한국관광공사 음식점 정보)", "", "생성: node scripts/draft-food.mjs. 사진이 있고 영업시간을 읽을 수 있는 곳만. 사람이 골라 new-places-review.json에 넣는다.", "",
  "| 시군 | 이름 | 카페 | 향토 | 메뉴 | 영업시간 | 쉬는날 |", "|---|---|---|---|---|---|---|",
  ...out.map((x) => `| ${x.sigun} | ${esc(x.title)} | ${x.cafe ? "○" : ""} | ${x.local ? "○" : ""} | ${esc(x.menu)} | ${esc(x.opentime).slice(0, 60)} | ${esc(x.restdate).slice(0, 40)} |`), "",
].join("\n"));
console.log(`\n후보 ${out.length}곳 → reports/new-food.md`);
