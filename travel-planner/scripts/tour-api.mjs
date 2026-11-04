// 한국관광공사 TourAPI (국문 KorService2 / 영문 EngService2) 공용 클라이언트와 장소 대조 규칙
// - 인증키는 환경변수 TOUR_API_KEY (Decoding 키)로만 받는다. 키는 로그·캐시·파일에 남기지 않는다.
// - 굽기 스크립트는 응답을 .cache/tour/에 저장해 여러 번 돌려도 호출 횟수를 아낀다 (git 제외).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const BASE = "https://apis.data.go.kr/B551011";
const CACHE_DIR = new URL("../.cache/tour/", import.meta.url);

export function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// service: "KorService2" | "EngService2", op: "searchKeyword2" | "locationBasedList2" | "detailCommon2"
export async function tour(service, op, params, { key = process.env.TOUR_API_KEY, cache = false } = {}) {
  if (!key) throw new Error("TOUR_API_KEY가 없습니다");
  const pub = new URLSearchParams({ MobileOS: "ETC", MobileApp: "ohneul-gangwon", _type: "json", ...params });
  const file = cache && new URL(createHash("sha1").update(`${service}/${op}?${pub}`).digest("hex") + ".json", CACHE_DIR);
  if (file) {
    const hit = await readFile(file, "utf8").catch(() => null);
    if (hit) return JSON.parse(hit);
  }
  const q = new URLSearchParams({ serviceKey: key, ...Object.fromEntries(pub) });
  let res;
  for (let i = 0; i < 3; i++) {
    res = await fetch(`${BASE}/${service}/${op}?${q}`, { headers: { "User-Agent": "ohneul-gangwon/1.0" } }).catch(() => null);
    if (res?.ok) break;
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  if (!res?.ok) throw new Error(`${service}/${op} HTTP ${res?.status ?? "연결 실패"}`);
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`${service}/${op} JSON 아님: ${text.slice(0, 80).replaceAll(key, "***")}`); }
  const code = j?.response?.header?.resultCode;
  if (code && code !== "0000") throw new Error(`${service}/${op} 오류 ${code} ${j.response.header.resultMsg}`);
  let items = j?.response?.body?.items?.item || [];
  if (!Array.isArray(items)) items = [items];
  if (file) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(items));
  }
  return items;
}

/* ---------- 이름 대조 ----------
   관광공사 제목은 "강릉 경포해수욕장", "Gangneung Gyeongpo Beach (강릉 경포해수욕장)"처럼 지역명이 앞에 붙거나
   해변/해수욕장처럼 다른 말을 쓴다. 지역명과 띄어쓰기를 떼고 같은 뜻의 말을 맞춘 뒤 비교한다. */
const REGION_WORDS = ["강원특별자치도", "강원도", "강릉시", "강릉", "동해시", "동해", "삼척", "속초", "고성", "양양", "인제", "춘천", "철원", "화천", "평창", "정선", "영월", "태백", "원주", "횡성", "홍천"];
const SAME = [[/해수욕장/g, "해변"], [/전통시장/g, "시장"], [/관광수산시장/g, "관광시장"], [/스카이워크/g, "스카이워크"]];

// 영문 제목 끝 괄호 안의 한국어 원명. 괄호가 겹칠 수 있다: "Hwanseongul Cave (Daei-ri Cave System) (환선굴 (대이리 동굴지대))"
function lastHangulGroup(title) {
  const s = String(title);
  let found = null;
  for (let end = s.length - 1; end >= 0; end--) {
    if (s[end] !== ")") continue;
    let depth = 0, i = end;
    for (; i >= 0; i--) { if (s[i] === ")") depth++; else if (s[i] === "(" && --depth === 0) break; }
    if (i < 0) break;
    const inner = s.slice(i + 1, end);
    if (/[가-힣]/.test(inner)) { found = { start: i, end, inner }; break; }
    end = i;
  }
  return found;
}
export function koreanInTitle(title) {
  return lastHangulGroup(title)?.inner.trim() || "";
}
export function englishInTitle(title) {
  const g = lastHangulGroup(title);
  const s = g ? String(title).slice(0, g.start) + String(title).slice(g.end + 1) : String(title);
  return s.replace(/\[[^\]]*(Tax Refund|Korea Grand Sale)[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
}

export function core(name) {
  let s = String(name).replace(/\([^)]*\)/g, " ").replace(/[^가-힣A-Za-z0-9]/g, "");
  for (const [re, to] of SAME) s = s.replace(re, to);
  for (const w of REGION_WORDS) if (s.startsWith(w) && s.length - w.length >= 2) { s = s.slice(w.length); break; }
  return s;
}
function bigrams(s) { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; }
export function dice(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return a === b ? 1 : 0;
  const pool = [...B]; let hit = 0;
  for (const g of A) { const k = pool.indexOf(g); if (k >= 0) { hit++; pool.splice(k, 1); } }
  return (2 * hit) / (A.length + B.length);
}

// 우리 장소 이름의 대조 후보들: 전체 이름, "·"로 나뉜 각 이름, 부가설명 뺀 앞부분 (예: "영진해변 도깨비 촬영지" → "영진해변")
export function nameVariants(place) {
  const raw = place.name.replace(/\([^)]*\)/g, " ");
  const v = new Set([core(raw)]);
  for (const part of raw.split(/[·,]/)) if (core(part).length >= 2) v.add(core(part));
  const words = raw.trim().split(/\s+/);
  if (!place.multi && core(words[0]).length >= 3) v.add("=" + core(words[0])); // "=": 완전히 같을 때만 인정 (대관령 삼양목장 ≠ 대관령 하늘목장)
  // 지점명 빼기: "테라로사 커피공장 강릉본점" → "테라로사 커피공장"
  if (!place.multi && words.length > 1 && /점$/.test(words.at(-1))) v.add(core(words.slice(0, -1).join(" ")));
  for (const alias of place.alias || []) v.add(core(alias));
  return [...v].filter(Boolean);
}

// 관광공사 결과 하나가 우리 장소와 같은 곳인지 판정한다. 반환: { ok, why, score }
// 관광공사 제목이 "강릉 오죽헌·시립박물관"처럼 여러 이름을 묶은 경우 각각도 비교한다.
export function judge(place, koTitle, contenttypeid) {
  const whole = core(koTitle);
  if (!whole) return { ok: false, why: "한국어 이름 없음", score: 0 };
  const titles = [...new Set([whole, ...String(koTitle).replace(/\([^)]*\)/g, " ").split(/[·&,/.]/).map(core).filter((x) => x.length >= 2)])];
  let best = { ok: false, why: "이름 다름", score: 0 };
  for (const t of titles) for (const raw of nameVariants(place)) {
    let r;
    const strict = raw.startsWith("=");
    const v = strict ? raw.slice(1) : raw;
    if (t === v) r = { ok: true, why: strict ? "앞 이름 같음" : "이름 같음", score: strict ? 2.5 : 3 };
    else if (strict) r = { ok: false, why: "이름 다름", score: 0 };
    else if (place.multi) {
      // 여러 가게가 모인 곳: 그 거리·시장 자체만. 거리 이름 뒤에 가게 이름이 더 붙은 결과(개별 가게)는 버린다.
      if (v.includes(t) && t.length >= 3 && /(시장|거리|골목|마을|센터|식당가|촌)$/.test(t)) r = { ok: true, why: "거리·시장 이름 포함", score: 2 };
      else r = { ok: false, why: t.includes(v) ? "거리 안의 개별 가게" : "이름 다름", score: 0 };
    } else if (t.endsWith(v) || v.endsWith(t)) {
      // 앞에 지역·권역명이 더 붙은 것만 같은 곳으로 본다 ("도째비골 해랑전망대" = 해랑전망대).
      // 뒤에 다른 명사가 붙으면 옆의 다른 시설이다 ("고석정 꽃밭" ≠ 고석정, "남이섬 노래박물관" ≠ 남이섬).
      const extra = Math.abs(t.length - v.length);
      const shorter = Math.min(t.length, v.length);
      r = shorter >= 3 && extra <= 4 ? { ok: true, why: "앞에 지역명 추가", score: 2 } : { ok: false, why: "이름 일부만 같음", score: 0 };
    } else if (t.includes(v) || v.includes(t)) {
      r = { ok: false, why: "다른 시설(이름 뒤에 다른 말)", score: 0 };
    } else {
      const d = dice(t, v);
      r = d >= 0.6 ? { ok: true, why: `이름 유사(${d.toFixed(2)})`, score: 1 + d } : { ok: false, why: "이름 다름", score: 0 };
    }
    // 지점이 다르면 다른 가게: "보헤미안 박이추커피 사천점" ≠ "보헤미안박이추커피 본점"
    const ourBranch = /\S+점$/.test(place.name.trim()) ? place.name.trim().split(/\s+/).at(-1) : null;
    const theirBranch = String(koTitle).trim().split(/\s+/).find((w) => /.+점$/.test(w) && w !== ourBranch);
    if (ourBranch && theirBranch) r = { ok: false, why: "다른 지점", score: 0 };
    if (place.multi && ["39", "82"].includes(String(contenttypeid)) && !/시장|거리|골목|식당가|촌/.test(t)) r = { ok: false, why: "개별 음식점", score: 0 };
    if (r.score > best.score || (!best.ok && r.ok)) best = r;
  }
  return best;
}

// 한 장소에 대해 이름 검색 + 주변(2km) 검색 결과를 모아 판정한 목록을 돌려준다.
export async function candidates(service, place, opts = {}) {
  const seen = new Map();
  const isEng = service.startsWith("Eng");
  const rate = (list) => list
    .filter((it) => it.mapx && it.mapy && Number(it.mapx) > 0 && String(it.contenttypeid) !== "25") // 25: 여행코스(사진이 다른 곳)
    .map((it) => {
      const koTitle = isEng ? koreanInTitle(it.title) : it.title;
      const d = km(place, { lat: Number(it.mapy), lng: Number(it.mapx) });
      return { ...it, koTitle, km: d, ...judge(place, koTitle, it.contenttypeid) };
    })
    .sort((a, b) => b.ok - a.ok || b.score - a.score || a.km - b.km);
  // 검색은 제목 부분일치라 "경포해변"으로는 "경포해수욕장"이 안 나온다. 이름 변형을 차례로 검색하고 찾으면 멈춘다.
  const variants = nameVariants(place).map((v) => v.replace(/^=/, "")).filter((v) => v.length >= 2);
  const keywords = [...new Set([place.name.replace(/[·()]/g, " ").replace(/\s+/g, " ").trim(), ...variants, ...variants.filter((v) => /해변$/.test(v)).map((v) => v.replace(/해변$/, "해수욕장"))])];
  for (const kw of keywords.slice(0, 6)) {
    for (const it of await tour(service, "searchKeyword2", { keyword: kw, numOfRows: "30", pageNo: "1" }, opts)) seen.set(it.contentid, it);
    if (rate([...seen.values()]).some((c) => c.ok && c.km <= 2 && (c.firstimage || isEng))) break;
  }
  // 이름 검색으로 2km 안에서 못 찾으면 주변 2km 목록에서 다른 이름(예: 경포해변 ↔ 경포해수욕장)으로 등록된 것을 찾는다
  if (!rate([...seen.values()]).some((c) => c.ok && c.km <= 2)) {
    for (const it of await tour(service, "locationBasedList2", { mapX: String(place.lng), mapY: String(place.lat), radius: "2000", arrange: "E", numOfRows: "100", pageNo: "1" }, opts)) seen.set(it.contentid, it);
  }
  return rate([...seen.values()]);
}

// 영문 소개 첫 문장 (안내문은 건너뜀, 소수점·약어에서 자르지 않음)
export function firstSentence(text) {
  const s = String(text || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  // 문장 끝: . ! ? 뒤에 공백+대문자(또는 글 끝). "7.4-kilometer"나 "Mt. Seorak" 중간에서는 자르지 않는다.
  const sentences = s.split(/(?<=[a-z0-9)"'”’][.!?])\s+(?=[A-Z"'(*“])/);
  // "*The information below is based on ..." 같은 안내문은 소개가 아니므로 건너뛴다
  const ok = sentences.map((x) => x.trim()).filter((x) => x && !/^\*|information (below|above)|subject to change|please (check|note)/i.test(x));
  return ok[0] || "";
}

// 같은 곳으로 볼 거리: 기본 2km, 길게 이어진 탐방로(trailKm)는 그 길이까지 (좌표는 한쪽 입구, 관광공사는 다른 끝일 수 있음)
export const maxKmFor = (place, base = 2) => Math.max(base, place.trailKm || 0);

export const https = (u) => String(u || "").replace(/^http:\/\//, "https://");
