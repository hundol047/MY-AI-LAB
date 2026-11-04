// 외국인용 영문 이름·소개를 한국관광공사 영문 관광정보(EngService2)에서 찾아 public/data-en.json에 저장하고
// 매칭 근거를 reports/english.md에 남긴다.
// 실행: TOUR_API_KEY=Decoding키 node scripts/bake-english.mjs
//  - 영문 제목 "Gangneung Gyeongpo Beach (강릉 경포해수욕장)"의 괄호 속 한국어 원명으로 우리 장소와 대조 (좌표 2km 안 + 이름 대응)
//  - 소개는 detailCommon2의 overview 첫 문장만 그대로 쓴다 (요약·창작 없음). 너무 길면 소개는 비워 두고 한국어 설명을 쓴다.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { PLACES, FESTIVALS } from "../public/data.js";
import { candidates, tour, englishInTitle, firstSentence, maxKmFor } from "./tour-api.mjs";

const MAX_KM = 2, MAX_DESC = 200;
export const REJECT = {}; // 장소 id → 쓰면 안 되는 영문 contentid (사람이 리포트를 보고 판단)

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY가 필요합니다"); process.exit(1); }

const targets = [...PLACES, ...FESTIVALS];
const out = {}, rows = [], missing = [], dropped = [];
for (const p of targets) {
  let list;
  try { list = await candidates("EngService2", p, { key, cache: true }); }
  catch (e) { missing.push({ p, why: e.message }); process.stdout.write("!"); continue; }
  const limit = maxKmFor(p, MAX_KM);
  const m = list.find((c) => c.ok && c.km <= limit && !(REJECT[p.id] || []).includes(String(c.contentid)));
  for (const c of list.filter((c) => c !== m && (c.ok || (c.km < 0.3 && c.koTitle))).slice(0, 3))
    dropped.push({ p, title: c.title, km: c.km, why: c.ok ? (c.km > limit ? `이름 같지만 ${limit}km 밖` : "더 맞는 결과 있음") : c.why });
  if (!m) { missing.push({ p, why: list.length ? "2km 안에 이름이 맞는 영문 결과 없음" : "영문 결과 없음" }); process.stdout.write("x"); continue; }
  const name = englishInTitle(m.title);
  let desc = "";
  try {
    const [d] = await tour("EngService2", "detailCommon2", { contentId: String(m.contentid) }, { key, cache: true });
    desc = firstSentence(d?.overview);
    // 첫 문장이 그곳을 소개하지 않으면(이름의 단어가 하나도 없으면) 쓰지 않는다
    const words = name.split(/[^A-Za-z]+/).filter((w) => w.length >= 4);
    if (desc.length > MAX_DESC || !words.some((w) => desc.toLowerCase().includes(w.toLowerCase()))) desc = "";
  } catch { /* 이름만 */ }
  out[p.id] = desc ? { name, desc } : { name };
  rows.push({ p, m, name, desc });
  process.stdout.write(".");
}
// 관광공사 영문이 없는 이름·소개는 scripts/en-manual.json(앱 번역: 로마자 이름, data.js 한국어 설명을 옮긴 소개)로 채운다.
// nameSrc/descSrc "app"으로 표시해 공식 영문과 구분한다. 관광공사 영문이 있으면 그쪽이 우선.
const manual = JSON.parse(await readFile(new URL("./en-manual.json", import.meta.url), "utf8"));
const filled = [];
for (const p of targets) {
  const m = manual[p.id]; if (!m) continue;
  const e = out[p.id] || {};
  const add = {};
  if (!e.name && m.name) { add.name = m.name; add.nameSrc = "app"; }
  if (!e.desc && m.desc) { add.desc = m.desc; add.descSrc = "app"; }
  if (Object.keys(add).length) { out[p.id] = { ...e, ...add }; filled.push({ p, ...add }); }
}
const ordered = Object.fromEntries(targets.filter((p) => out[p.id]).map((p) => [p.id, out[p.id]]));
await writeFile(new URL("../public/data-en.json", import.meta.url), JSON.stringify(ordered, null, 2) + "\n");

const esc = (s) => String(s).replace(/\|/g, "\\|");
const md = [
  "# 영문 이름·소개 매칭 리포트", "",
  "출처: 한국관광공사 영문 관광정보(EngService2) searchKeyword2·locationBasedList2 제목, detailCommon2 overview 첫 문장. 생성: node scripts/bake-english.mjs", "",
  `규칙: 영문 제목 괄호 속 한국어 원명이 우리 이름과 대응 + 좌표 ${MAX_KM}km 안(탐방로는 길이까지). 소개는 원문 첫 문장 그대로(${MAX_DESC}자 넘으면 생략).`, "",
  `- 대상 ${targets.length}곳 (장소 ${PLACES.length} + 축제 ${FESTIVALS.length})`,
  `- 영문 이름 찾음 ${rows.length}곳 (소개 포함 ${rows.filter((r) => r.desc).length}곳) · 못 찾음 ${missing.length}곳`, "",
  "## 찾은 곳", "", "| id | 우리 이름 | 관광공사 영문 제목 | 거리(km) | 판정 | 소개 |", "|---|---|---|---|---|---|",
  ...rows.map(({ p, m, desc }) => `| ${p.id} | ${esc(p.name)} | ${esc(m.title)} | ${m.km.toFixed(2)} | ${m.why} | ${desc ? "있음" : "-"} |`), "",
  "## 관광공사 영문이 없는 곳 (앱 번역으로 채움: 이름은 로마자 표기, 소개는 data.js 한국어 설명을 옮김)", "", "| id | 우리 이름 | 이유 | 앱 번역 |", "|---|---|---|---|",
  ...missing.map(({ p, why }) => { const f = filled.find((x) => x.p === p); return `| ${p.id} | ${esc(p.name)} | ${esc(why)} | ${f ? esc([f.name, f.desc].filter(Boolean).join(" — ")) : "없음(한국어 그대로)"} |`; }), "",
  "## 관광공사 영문 이름은 있고 소개만 앱 번역", "", "| id | 영문 이름 | 앱 번역 소개 |", "|---|---|---|",
  ...filled.filter((f) => !f.name).map((f) => `| ${f.p.id} | ${esc(out[f.p.id].name)} | ${esc(f.desc)} |`), "",
  "## 버린 후보", "", "| id | 우리 이름 | 관광공사 영문 제목 | 거리(km) | 이유 |", "|---|---|---|---|---|",
  ...dropped.map((d) => `| ${d.p.id} | ${esc(d.p.name)} | ${esc(d.title)} | ${d.km.toFixed(2)} | ${esc(d.why)} |`), "",
];
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/english.md", import.meta.url), md.join("\n"));
console.log(`\n앱 번역으로 채움 ${filled.length}곳 · 영문 이름 ${rows.length}/${targets.length}곳 · 소개 ${rows.filter((r) => r.desc).length} · 못 찾음 ${missing.length} → public/data-en.json, reports/english.md`);
