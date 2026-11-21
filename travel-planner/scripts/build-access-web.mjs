// 공식 조사(관광공사 무장애 API)가 없는 관광지의 무장애 안내를 공식 누리집·공공기관 자료에서 찾아 옮겨 적은 것(scripts/access-web-raw.json)을
// 검사해 앱이 읽는 public/access-web.json으로 만든다. 사람이(또는 조사 도우미가) 원문을 그대로 옮긴 것만 쓴다.
//  - 허용 출처: 공공기관(.go.kr, .or.kr 공공기관), 한국관광공사, 국립공원공단, 숲나들e, 해당 시설의 공식 누리집(목록은 raw의 official에 적는다)
//  - 블로그·기사·위키·리뷰 사이트는 버린다. 인용문은 한국어 원문 그대로(160자 이하), 항목 이름은 정해진 것만
// 실행: node scripts/build-access-web.mjs  → public/access-web.json, reports/access-web.md
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PLACES } from "../public/data.js";
import { statusOf } from "../public/access-steps.js";

export const KEYS = ["대중교통", "주차", "접근로", "출입구", "엘리베이터", "화장실", "휠체어", "유모차", "수유실", "기타"];
const BLOCK = /(blog\.|tistory|cafe\.naver|cafe\.daum|brunch\.co|namu\.wiki|wikipedia|youtube|instagram|facebook|tripadvisor|news|press|ilbo|\.kr\/news|post\.naver|m\.blog|velog|medium\.com)/i;
const PUBLIC = /(\.go\.kr|visitkorea\.or\.kr|knps\.or\.kr|foresttrip\.go\.kr|\.or\.kr|gwto\.or\.kr|\.gangwon\.kr)(\/|$|:)/i;
export function checkItem(it, officialHosts = []) {
  if (!it || !KEYS.includes(it.k)) return "항목 이름";
  if (typeof it.quote !== "string" || it.quote.trim().length < 4 || it.quote.length > 400 || !/[가-힣]/.test(it.quote)) return "인용문";
  let host; try { const u = new URL(it.url); if (u.protocol !== "https:" && u.protocol !== "http:") return "주소"; host = u.hostname; } catch { return "주소"; }
  if (BLOCK.test(it.url)) return "허용하지 않는 출처";
  if (!PUBLIC.test(host + "/") && !officialHosts.some((h) => host === h || host.endsWith("." + h))) return "공식 출처 아님";
  return null;
}

if (process.argv[1]?.endsWith("build-access-web.mjs")) {
  const raw = JSON.parse(await readFile(new URL("./access-web-raw.json", import.meta.url), "utf8"));
  const byId = new Map(PLACES.map((p) => [p.id, p]));
  const out = {}, lines = [], dropped = [];
  for (const [id, items] of Object.entries(raw.places || {})) {
    const p = byId.get(id);
    if (!p) { dropped.push(`${id}: 앱에 없는 장소`); continue; }
    const keep = [];
    for (const it of items || []) {
      const why = checkItem(it, raw.official?.[id] || []);
      if (why) { dropped.push(`${p.name}: ${why} — ${String(it?.url || "").slice(0, 80)}`); continue; }
      const text = it.quote.trim().replace(/\s+/g, " ");
      if (!keep.some((x) => x.k === it.k && x.text === text)) keep.push({ k: it.k, text, url: it.url, src: String(it.src || "").slice(0, 40), ...(it.date ? { date: String(it.date).slice(0, 7) } : {}) });
    }
    if (keep.length) { out[id] = keep; lines.push(`### ${p.name}${p.access ? " (공식 조사도 있음)" : ""}`, "", ...keep.map((x) => `- **${x.k}** [${statusOf(x.text)}] ${x.text} — [${x.src || "출처"}](${x.url})${x.date ? ` (${x.date})` : ""}`), ""); }
  }
  await writeFile(new URL("../public/access-web.json", import.meta.url), JSON.stringify({ checkedAt: raw.checkedAt, note: "공식 누리집·공공기관 자료에서 옮겨 적은 무장애 안내 (원문 인용)", places: out }).replace(/\],"/g, '],\n"') + "\n");
  await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
  const all = Object.keys(raw.places || {}).length;
  await writeFile(new URL("../reports/access-web.md", import.meta.url), ["# 공식 누리집에서 찾은 무장애 안내 (웹 조사)", "", `조사일 ${raw.checkedAt} · 조사한 장소 ${all}곳 중 안내를 찾은 곳 ${Object.keys(out).length}곳 · 항목 ${Object.values(out).flat().length}개`, "", "관광공사 무장애 조사가 없는 관광지를 공식 누리집·공공기관 자료에서 찾아 **원문 그대로** 옮겼다. 찾지 못한 곳은 적지 않았다(= 모름). 블로그·기사·위키는 쓰지 않았다.", "", ...lines, `## 버린 것 (${dropped.length})`, "", ...dropped.map((d) => `- ${d}`), ""].join("\n"));
  console.log(`웹 조사 ${Object.keys(out).length}/${all}곳, 항목 ${Object.values(out).flat().length}개, 버림 ${dropped.length} → public/access-web.json, reports/access-web.md`);
}
