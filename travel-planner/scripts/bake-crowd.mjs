// 관광지 혼잡 예측: 한국관광공사 관광지 집중률 방문자 추이 예측(TatsCnctrRateService/tatsCnctrRatedList)에서
// 강원 18개 시군 관광지의 앞으로 30일 날짜별 집중률(0~100)을 받아 앱 장소와 이름으로 맞춘다.
// 자료는 하루 단위다 (시간대별 값이 없다) → 일정 엔진은 그날 유난히 붐비는 곳을 뒤로 미루고, 카드에 "붐빔 예상"을 띄운다.
// 출력: public/crowd.json ({builtAt, source, places: {장소 id: {name, rates: {YYYY-MM-DD: 집중률}}}}), reports/crowd.md
// 실행: TOUR_API_KEY=공공데이터포털키 node scripts/bake-crowd.mjs  (같은 키, "관광지 집중률 방문자 추이 예측 정보" 활용신청 필요)
import { writeFile, mkdir } from "node:fs/promises";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY(공공데이터포털 인증키)가 필요합니다"); process.exit(1); }
const SIGUNGU = { 51110: "춘천시", 51130: "원주시", 51150: "강릉시", 51170: "동해시", 51190: "태백시", 51210: "속초시", 51230: "삼척시", 51720: "홍천군", 51730: "횡성군", 51750: "영월군", 51760: "평창군", 51770: "정선군", 51780: "철원군", 51790: "화천군", 51800: "양구군", 51810: "인제군", 51820: "고성군", 51830: "양양군" };
// 앱 권역 → 시군 (같은 이름의 다른 시군 관광지와 섞이지 않게)
const REGION_SG = { gangneung: ["강릉시", "동해시", "삼척시"], seorak: ["속초시", "양양군", "고성군", "인제군"], chuncheon: ["춘천시", "화천군", "철원군", "홍천군", "양구군"], pyeongchang: ["평창군", "정선군", "영월군", "태백시"], wonju: ["원주시", "횡성군"] };
// 이름 규칙으로 안 맞지만 같은 곳임을 사람이 확인한 짝 (앱 id → 관광공사 관광지명)
const MANUAL = { "high1-ski": "하이원리조트", "yongpyong-ski": "모나용평", "phoenix-ski": "휘닉스 평창", "alpensia-ski": "알펜시아 리조트", woljeongsa: "오대산 월정사 전나무숲길", sogeumsan: "원주 소금산 출렁다리",
  "wj-gukhyeongsa": "국형사계곡", "pc-seonjaryeong": "선자령", songjeong: "송정해변(송정해수욕장)", taebaeksan: "태백산 국립공원", pungsuwon: "횡성 풍수원천주교회(풍수원성당)", "hanbando-island": "한반도섬전망대" };

async function page(sg, pageNo) {
  const u = new URL("https://apis.data.go.kr/B551011/TatsCnctrRateService/tatsCnctrRatedList");
  u.search = new URLSearchParams({ serviceKey: key, MobileOS: "ETC", MobileApp: "ohneul", _type: "json", numOfRows: "2000", pageNo: String(pageNo), areaCd: "51", signguCd: sg });
  for (let i = 0; i < 4; i++) {
    const res = await fetch(u, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!res) { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); continue; }
    const j = await res.json().catch(() => null);
    const code = j?.response?.header?.resultCode;
    if (code !== "0000" && code !== "00") throw new Error(`집중률 ${sg}: HTTP ${res.status}, 결과 코드 ${String(code || j?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode || "?").replace(/[^\w]/g, "")}`);
    const body = j.response.body;
    return { items: [].concat(body.items?.item || []), total: Number(body.totalCount) || 0 };
  }
  throw new Error(`집중률 ${sg}: 연결 실패`);
}

const rows = [];
for (const sg of Object.keys(SIGUNGU)) {
  let p = 1, got = 0, total = Infinity;
  while (got < total) { const r = await page(sg, p++); rows.push(...r.items); got += r.items.length; total = r.total; if (!r.items.length) break; }
}
if (!rows.length) throw new Error("집중률 자료를 하나도 받지 못했습니다. 기존 파일을 유지합니다.");

const SGN = Object.values(SIGUNGU).map((s) => s.slice(0, 2));
const norm = (s) => String(s || "").replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(new RegExp(`^(${SGN.join("|")})(시|군)?\\s*`), "").replace(/[\s·・\-]/g, "").toLowerCase();
const spots = new Map(); // `${시군}|${이름}` → {name, sg, rates}
for (const x of rows) {
  const k = `${x.signguNm}|${x.tAtsNm}`;
  const s = spots.get(k) || { name: x.tAtsNm, sg: x.signguNm, key: norm(x.tAtsNm), rates: {} };
  const d = String(x.baseYmd);
  s.rates[`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`] = Math.round(Number(x.cnctrRate) * 10) / 10;
  spots.set(k, s);
}
const { PLACES } = await import("../public/data.js");
const places = {}, missed = [], fuzzyRows = [];
for (const p of PLACES.filter((x) => !x.petOnly && !x.multi && x.cat !== "food" && x.cat !== "cafe")) {
  const pool = [...spots.values()].filter((s) => REGION_SG[p.region]?.includes(s.sg));
  const keys = [p.name, ...(p.alias || []), p.wiki].filter(Boolean).map(norm);
  let s = MANUAL[p.id] ? [...spots.values()].find((x) => x.name === MANUAL[p.id]) : pool.find((x) => keys.includes(x.key));
  // 이름이 정확히 같지 않으면 한쪽이 다른 쪽을 품는 경우(예: "경포대" ↔ "강릉 경포대 누각")만, 3글자 이상이고 후보가 하나뿐일 때 맞춘다
  let fuzzy = false;
  if (!s && !MANUAL[p.id]) {
    const hits = pool.filter((x) => x.key.length >= 3 && keys.some((k) => k.length >= 3 && (x.key.includes(k) || k.includes(x.key))));
    if (hits.length === 1) { s = hits[0]; fuzzy = true; }
  }
  if (s) { places[p.id] = { name: s.name, rates: s.rates }; if (fuzzy) fuzzyRows.push(`- ${p.id} (${p.name}) ↔ ${s.name}`); }
  else missed.push(p.name);
}
const out = { builtAt: new Date().toISOString(), source: "한국관광공사 관광지 집중률 방문자 추이 예측 정보", places };
await writeFile(new URL("../public/crowd.json", import.meta.url), JSON.stringify(out) + "\n");
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
const ids = Object.keys(places);
await writeFile(new URL("../reports/crowd.md", import.meta.url), [
  "# 관광지 혼잡 예측 (한국관광공사 집중률)", "",
  `생성: node scripts/bake-crowd.mjs. 강원 관광지 ${spots.size}곳 · 앱 장소와 맞춘 곳 ${ids.length}곳 · 못 맞춘 관광지형 장소 ${missed.length}곳.`, "",
  "집중률 70 이상이면서 그날 강원 평균보다 20 이상 높으면 '붐빔 예상'(일정 엔진이 그날 뒤로 미룸), 70 이상이면 '붐비는 날'로 카드에 표시한다.", "",
  "## 맞춘 곳", "", ...ids.map((id) => `- ${id}: ${places[id].name}`), "",
  "## 이름 일부로 맞춘 곳 (확인용)", "", ...fuzzyRows, "",
  "## 집중률 자료에 없는 장소", "", missed.join(", "), "",
].join("\n"));
console.log(`관광지 ${spots.size}곳 중 앱 장소 ${ids.length}곳 → public/crowd.json, reports/crowd.md`);
