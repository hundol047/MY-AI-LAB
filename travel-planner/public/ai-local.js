// AI 서버에 연결되지 않았을 때 쓰는 간단한 규칙 기반 대체
import { addDays, parseRequestLocally, hoursFor, fmt, RAIN } from "./planner.js";
import { PLACES } from "./data.js";
import { normalize, detectLang, NICKS, NICKS_EN, TIPS, TIPS_EN, THEMES, FAQ, FAQ_EN } from "./knowledge.js";
import { toSimplified, NAMES_JA, NAMES_ZH, NICKS_JA, NICKS_ZH, TIPS_JA, TIPS_ZH, FAQ_JA, FAQ_ZH } from "./knowledge-intl.js";

const REGION_WORDS = {
  gangneung: ["강릉", "동해", "삼척", "정동진", "경포", "주문진"],
  seorak: ["속초", "양양", "고성", "설악", "인제"],
  chuncheon: ["춘천", "남이섬", "화천", "철원", "홍천"],
  pyeongchang: ["평창", "대관령", "정선", "영월", "태백"],
  wonju: ["원주", "횡성"],
};

export function startLocal(text, today) {
  const t = normalize(text);
  const has = (...w) => w.some((x) => t.includes(x));
  const r = { region: "gangneung", date: addDays(today, 1), days: 2, who: "couple", likes: [], move: "car" };
  for (const [k, words] of Object.entries(REGION_WORDS)) if (has(...words)) { r.region = k; break; }
  if (has("당일", "하루")) r.days = 1;
  if (has("1박")) r.days = 2;
  if (has("2박")) r.days = 3;
  if (has("3박")) r.days = 4;
  if (has("4박", "5박", "6박", "일주일")) r.days = 5;
  if (has("혼자")) r.who = "solo";
  if (has("아이", "애들", "가족", "아들", "딸")) r.who = "family";
  if (has("부모님", "엄마", "아빠", "어머니", "아버지", "어르신")) r.who = "parents";
  if (has("기차", "버스", "뚜벅", "대중교통", "KTX")) r.move = "transit";
  if (has("택시")) r.move = "taxi";
  const cats = { sea: ["바다", "해변"], cafe: ["카페", "커피"], food: ["맛집", "먹", "시장"], culture: ["역사", "문화", "박물관", "전시"], nature: ["자연", "산책", "숲", "산", "호수"] };
  for (const [c, words] of Object.entries(cats)) if (has(...words)) r.likes.push(c);
  if (!r.likes.length) r.likes = ["sea", "food"];
  if (has("내일")) r.date = addDays(today, 1);
  if (has("모레")) r.date = addDays(today, 2);
  if (has("주말")) {
    const wd = new Date(today).getDay();
    r.date = addDays(today, (6 - wd + 7) % 7 || 7);
  }
  const m = t.match(/(\d{1,2})월(\d{1,2})일/);
  if (m) {
    let y = Number(today.slice(0, 4));
    const ds = `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    r.date = ds < today ? `${y + 1}${ds.slice(4)}` : ds;
  }
  return r;
}

/* ---------- AI 가이드 (AI 없이) ----------
 * 질문을 knowledge.js의 표현 사전으로 고친 뒤(영어·일본어·중국어 질문도 같은 한국어 핵심어로), 장소 이름과 주제를 찾아 답한다.
 * 답하는 언어는 질문의 언어(detectLang). 운영시간·요금·실내/야외·걷는 양은 검증된 데이터(data.js·fees.json)에서, 팁은 knowledge*.js에서.
 * ctx: { input: 여행 조건, opts: 현재 일정 옵션, fees: fees.json, lang: 화면 언어 "ko"|"en", namesEn: { 장소id: 영어 이름 } }
 * 돌려주는 값: { answer, changed, lang, kind(답의 종류, 정확도 측정용), ...일정 변경 }
 */
const josa = (word, pair) => {
  const c = String(word).charCodeAt(String(word).length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${word}${pair[0]}(${pair[1]})`;
  return word + (c % 28 ? pair[0] : pair[1]);
};
const firstSentence = (t) => (t.match(/^.*?(?:[요다]\.|\.(?=\s|$)|。)/) || [t])[0];
const CAT_WORDS = { sea: ["바다", "해변"], cafe: ["카페"], food: ["맛집", "시장"], culture: ["역사", "문화", "박물관", "전시", "미술관"], nature: ["자연", "산책", "숲", "호수", "공원"] };
const CAT_LABEL = {
  sea: { ko: "바다", en: "beach", ja: "海", zh: "海边" }, cafe: { ko: "카페", en: "cafe", ja: "カフェ", zh: "咖啡店" },
  food: { ko: "식당", en: "place to eat", ja: "食事処", zh: "餐厅" }, culture: { ko: "볼거리", en: "sight", ja: "見どころ", zh: "景点" },
  nature: { ko: "산책할 곳", en: "place for a walk", ja: "散歩スポット", zh: "散步的地方" },
};
const DAY_WORDS = [["첫날", 0], ["첫째날", 0], ["둘째날", 1], ["셋째날", 2], ["넷째날", 3]];
const won = (n) => n.toLocaleString("ko-KR");
const md = (date) => date.slice(5).replace("-", "/");
const stripName = (x) => x.replace(/[（(].*?[)）]/g, "").replace(/[\s·・]/g, "").toLowerCase();

// 영어 이름에서 한 장소에만 나오는 낱말(5자 이상)도 이름으로 알아듣는다 ("Ojukheon House" → "ojukheon")
let enIndexFor = null, enIndex = new Map();
function enTokens(namesEn) {
  if (enIndexFor === namesEn) return enIndex;
  enIndexFor = namesEn; enIndex = new Map();
  const words = new Map();
  enWords = new Set();
  for (const [id, name] of Object.entries(namesEn || {})) {
    const ws = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    for (const w of ws) enWords.add(w);
    for (const w of new Set(ws.filter((x) => x.length >= 5))) words.set(w, words.has(w) ? null : id);
    const compact = name.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]/g, "");
    // "Gangneung Gyeongpo Beach" → "gyeongpobeach"도
    const noCity = compact.replace(CITY_EN, "");
    enIndex.set(id, [compact, noCity.length >= 6 && !/^(beach|market|street|port|lake|island|falls|museum|park)$/.test(noCity) ? noCity : compact, name.toLowerCase().replace(/^cafe\s+/, "").replace(/[^a-z0-9]/g, "")]);
  }
  for (const [w, id] of words) if (id) enIndex.get(id).push(w);
  return enIndex;
}
let enWords = new Set();
const CITY_EN = /^(gangneung|donghae|sokcho|yangyang|inje|goseong|chuncheon|cheorwon|hwacheon|wonju|hoengseong|samcheok|jeongseon|yeongwol|taebaek|pyeongchang)/;
// 일본어·중국어 이름의 줄임: 앞뒤 도시 이름을 뗀 것, 띄어 쓴 낱말·괄호 앞부분, 앞의 "カフェ"를 뗀 것
const CITY_CJK = /^(江陵|束草|春川|原州|三陟|高城|襄陽|襄阳|鉄原|铁原|華川|华川|寧越|宁越|太白|旌善|横城|平昌|大関嶺|大关岭|雉岳山|正東津|正东津|墨湖|注文津|麟蹄)|(江陵|江陵本店|江陵总店)$/g;
// 한자 두 글자(許筠)도 한 장소에만 나오면 이름으로 쓴다
const cjkParts = (name) => (name ? name.replace(/[（(].*?[)）]/g, "").split(/[\s・·]/).map((x) => x.toLowerCase()).filter((x) => x.length >= 3 || /^[\u4e00-\u9fff]{2}$/.test(x)) : []);
const cjkCache = new Map(); // 장소 id → 일본어·중국어 이름 줄임들 (한 번만 만든다)
const cjkTokensOf = (id) => { if (!cjkCache.has(id)) cjkCache.set(id, [...cjkTokens(NAMES_JA[id]), ...cjkTokens(NAMES_ZH[id])]); return cjkCache.get(id); };
let partCount = null; // 띄어 쓴 낱말이 몇 장소의 이름에 나오는지 (한 곳에만 나오는 낱말만 이름으로 쓴다: "カフェ"는 안 됨)
function cjkTokens(name) {
  if (!name) return [];
  partCount ??= (() => { const m = new Map(); for (const p of PLACES) for (const x of new Set([...cjkParts(NAMES_JA[p.id]), ...cjkParts(NAMES_ZH[p.id])])) m.set(x, (m.get(x) || 0) + 1); return m; })();
  const base = name.replace(/[（(].*?[)）]/g, "");
  return [base, base.replace(CITY_CJK, ""), base.replace(/^カフェ[・\s]?/, ""), base.replace(/(の遊歩道|遊歩道|の道|環湖步道|环湖步道|步道|散歩道|湖水公園|湖水公园)$/, ""), ...cjkParts(name).filter((x) => partCount.get(x) === 1)]
    .map((x) => x.replace(/[\s・·]/g, "").toLowerCase()).filter((x) => x.length >= 3 || /^[\u4e00-\u9fff]{2}$/.test(x));
}

function findPlaces(norm, regions, namesEn, question = "") {
  const en = enTokens(namesEn);
  const raw = String(question).toLowerCase().replace(/[\s.,!?、。！？・·()（）「」『』~〜]/g, "");
  // 표현 사전을 거치기 전 원문(번체는 간체로도)에서도 이름을 찾는다 ("sea trail"이 "바다 산책"으로 바뀌기 전)
  const n = `${norm}|${raw}|${toSimplified(raw)}`;
  const hits = [];
  // 영어 낱말이 영문 이름 낱말의 앞부분이면 그 장소 ("hwanseon" → "Hwanseongul Cave")
  const qWords = String(question).toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 5);
  for (const [id, toks] of en) for (const tok of toks.slice(3)) for (const w of qWords) if (tok !== w && !enWords.has(w) && tok.startsWith(w)) hits.push({ id, at: n.indexOf(w), len: w.length });
  // 영어 이름의 고유 낱말(5자 이상)은 질문 속 낱말과 통째로 같아야 한다 ("grandmother" 속 "grand"는 소금산 Grand Valley가 아님)
  const qWordSet = new Set(qWords);
  for (const p of PLACES) {
    const full = [p.name, ...(p.alias || [])].flatMap((x) => [x.replace(/\s/g, "").toLowerCase(), stripName(x)])
      .concat(cjkTokensOf(p.id));
    // 별명은 이 여행 권역의 장소만 (예: "케이블카"가 다른 권역 케이블카를 가리키지 않게)
    const nick = regions.has(p.region) ? [...(NICKS[p.id] || []), ...(NICKS_EN[p.id] || []), ...(NICKS_JA[p.id] || []), ...(NICKS_ZH[p.id] || [])] : [];
    const enToks = en.get(p.id) || [];
    for (const w of enToks.slice(3)) if (qWordSet.has(w)) hits.push({ id: p.id, at: n.indexOf(w), len: w.length });
    for (const tok of [...new Set([...full, ...enToks.slice(0, 3), ...nick])]) {
      const at = n.indexOf(tok.toLowerCase());
      if (tok.length >= 2 && at >= 0) hits.push({ id: p.id, at, len: tok.length });
    }
  }
  // 더 긴 이름 안에 들어 있는 짧은 이름은 버린다 ("정동진시간박물관" 안의 "정동진")
  const kept = hits.filter((h) => !hits.some((o) => o.len > h.len && o.at <= h.at && h.at + h.len <= o.at + o.len));
  return [...new Set(kept.sort((a, b) => a.at - b.at).map((h) => h.id))].map((id) => PLACES.find((p) => p.id === id));
}
const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * 0.8);

// 일정이 바뀐 뒤 화면이 덧붙이는 말 (한국어·영어는 화면 번역 t()를 쓰고, 일본어·중국어는 여기서)
export function changeNote(lang, hours = [], far = []) {
  if (lang !== "ja" && lang !== "zh") return null;
  if (!hours.length && !far.length) return lang === "ja" ? " 営業時間を確認し直してプランに反映しました。" : " 已重新确认营业时间并更新行程。";
  const h = hours.length ? (lang === "ja" ? `(${hours.join("、")}は営業時間かルートが合わず入れられませんでした)` : `(${hours.join("、")}因营业时间或路线不合适，没能加入)`) : "";
  const f = far.length ? (lang === "ja" ? `(${far.join("、")}は今回の旅のエリアから遠いため入れられませんでした)` : `(${far.join("、")}离这次行程的区域太远，没能加入)`) : "";
  return h + f;
}

export function guideLocal(question, trip, dayIdx, ctx = {}) {
  const lang = detectLang(question, ctx.lang || "ko");
  const en = lang === "en", cjk = lang === "ja" || lang === "zh";
  const L = (ko, e, ja, zh) => ({ ko, en: e, ja, zh })[lang];
  const nm = (p) => ({ en: ctx.namesEn?.[p.id], ja: NAMES_JA[p.id], zh: NAMES_ZH[p.id] })[lang] || p.name;
  // 일본어·중국어는 번역한 이름이라 한 장소를 말할 때는 한국어 이름(간판)을 함께
  const nmK = (p) => (cjk && nm(p) !== p.name ? (/[(（]/.test(nm(p)) ? `${nm(p)}［${p.name}］` : `${nm(p)}(${p.name})`) : nm(p)); // 이름에 이미 괄호가 있으면 ［한국어］
  const sep = cjk ? "、" : ", ";
  const list = (ps) => ps.map(nm).join(sep);
  const J = (ps, pair) => (lang === "ko" ? josa(list(ps), pair) : list(ps)); // 이름 목록 + 한국어 조사
  const tipOf = (p) => ({ ko: TIPS, en: TIPS_EN, ja: TIPS_JA, zh: TIPS_ZH })[lang][p.id];
  const be = (ps, one, many) => (ps.length > 1 ? many : one); // 영어 단·복수
  const n = normalize(question);
  const has = (...w) => w.some((x) => n.includes(x));
  const fees = ctx.fees || {};
  const opts = ctx.opts || {};
  const regions = new Set([ctx.input?.region, ...trip.days.flatMap((d) => d.items.map((i) => i.place.region))].filter(Boolean));
  const inTrip = new Set(trip.days.flatMap((d) => d.items.map((i) => i.id)));
  const info = (kind, answer) => ({ answer, changed: false, lang, kind });
  const change = (kind, answer, o = {}) => ({ answer, changed: true, lang, kind, remove: [], add: [], indoor: "keep", lessWalk: "keep", pace: "keep", ...o });

  // 어느 날 이야기인지: "2일차", "둘째날", "마지막날" (다른 언어도 "2일차" 등으로 바뀌어 들어온다)
  let di = dayIdx;
  const m = n.match(/(\d)일차/);
  if (m) di = Number(m[1]) - 1;
  for (const [w, k] of DAY_WORDS) if (n.includes(w)) di = k;
  if (n.includes("마지막날")) di = trip.days.length - 1;
  di = Math.min(Math.max(di, 0), trip.days.length - 1);
  const day = trip.days[di];
  const multi = trip.days.length > 1;
  const dayLabel = multi ? L(`${di + 1}일차`, `Day ${di + 1}`, `${di + 1}日目`, `第${di + 1}天`) : L("오늘", "Today", "今日", "今天");
  const dayPlaces = day.items.map((i) => i.place).filter(Boolean);

  const mentioned = findPlaces(n, regions, ctx.namesEn, question);
  const targets = mentioned.length ? mentioned : dayPlaces.filter((p) => p.cat || p.start);

  const hoursLine = (p, date) => {
    if (p.start) return `${nm(p)} ${p.start <= date && date <= p.end ? L("축제 기간이에요", "festival is on", "開催中", "节庆期间") : L("축제 기간이 아니에요", "festival is not on", "開催期間外", "不在节庆期间")}`;
    const h = hoursFor(p, date);
    if (h.closedToday) return `${nm(p)} ${L("이날 휴무", "closed that day", "この日は休み", "当天休息")}`;
    if (h.open === 0 && h.close >= 1439) return `${nm(p)} ${L("상시 개방", "always open", "常時開放", "全天开放")}`;
    const last = h.lastEntry !== null ? L(`(입장마감 ${fmt(h.lastEntry)})`, ` (last entry ${fmt(h.lastEntry)})`, `(最終入場 ${fmt(h.lastEntry)})`, `(最晚入场 ${fmt(h.lastEntry)})`) : "";
    return `${nm(p)} ${fmt(h.open)}–${fmt(h.close)}${last}`;
  };
  const feeLine = (p) => {
    const f = fees[p.id];
    if (!f) return `${nm(p)} ${L("요금 정보 없음", "no fee info", "料金情報なし", "无票价信息")}`;
    if (!f.adult && !f.child) return `${nm(p)} ${L("무료", "free", "無料", "免费")}`;
    const kid = f.child ? L(`·어린이 ${won(f.child)}원`, `, children ₩${won(f.child)}`, `・子ども${won(f.child)}ウォン`, `、儿童${won(f.child)}韩元`) : "";
    return `${nm(p)} ${L(`어른 ${won(f.adult)}원`, `adults ₩${won(f.adult)}`, `大人${won(f.adult)}ウォン`, `成人${won(f.adult)}韩元`)}${kid}`;
  };

  /* 1) 일정 바꾸기: 장소를 빼거나 넣기 */
  const wantsRemove = /(빼|제외|취소|안갈|안가|건너뛰|지워)/.test(n);
  const wantsAdd = /(넣어|넣자|추가|가고싶|들르|들러|가보고|가볼래|더가|한곳더|한군데더|더넣|더보)/.test(n);
  if (mentioned.length && wantsRemove) {
    const ids = mentioned.filter((p) => inTrip.has(p.id));
    if (!ids.length) return info("remove", L(`${J(mentioned, ["은", "는"])} 지금 일정에 없어요.`, `${list(mentioned)} ${be(mentioned, "isn't", "aren't")} in your plan right now.`, `${list(mentioned)}は今のプランに入っていません。`, `${list(mentioned)}不在现在的行程里。`));
    return change("remove", L(`${J(ids, ["을", "를"])} 빼고 다른 곳으로 채워 볼게요.`, `I'll take out ${list(ids)} and fill the gap with somewhere else.`, `${list(ids)}を外して、別の場所で埋めてみます。`, `我把${list(ids)}去掉，换成别的地方。`), { remove: ids.map((p) => p.id) });
  }
  if (mentioned.length && wantsAdd) {
    const add = mentioned.filter((p) => !inTrip.has(p.id) && !p.start);
    if (!add.length) return info("add", L(`${J(mentioned, ["은", "는"])} 이미 일정에 있어요.`, `${list(mentioned)} ${be(mentioned, "is", "are")} already in your plan.`, `${list(mentioned)}はもうプランに入っています。`, `${list(mentioned)}已经在行程里了。`));
    const far = add.some((p) => !regions.has(p.region));
    const farNote = far ? L(" 이번 여행 권역에서 멀어 이동이 길어질 수 있어요.", " It's outside this trip's area, so travel time may be long.", " 今回の旅のエリアから遠いので、移動が長くなるかもしれません。", " 离这次行程的区域较远，路上可能要很久。") : "";
    const names = add.map(nmK).join(sep);
    return change("add", L(`${J(add, ["을", "를"])} 넣어 볼게요.`, `I'll try adding ${names}.`, `${names}を入れてみます。`, `我试着加上${names}。`) + farNote, { add: add.map((p) => p.id) });
  }
  // "2일차에 바다 한 곳 더" → 그날 동선 근처에서 그 종류의 장소를 하나 고른다
  const askedCat = Object.entries(CAT_WORDS).find(([, ws]) => ws.some((w) => n.includes(w)))?.[0];
  if (askedCat && wantsAdd) {
    const cat = CAT_LABEL[askedCat][lang];
    const center = day.items.length ? day.items[Math.floor(day.items.length / 2)].place : null;
    const pick = PLACES
      .filter((p) => p.cat === askedCat && regions.has(p.region) && !inTrip.has(p.id) && !hoursFor(p, day.date).closedToday && !(opts.exclude || []).includes(p.id))
      .sort((a, b) => (center ? dist(a, center) - dist(b, center) : (b.pop || 0) - (a.pop || 0)))[0];
    if (!pick) return info("addCat", L(`${dayLabel}에 더 넣을 만한 ${josa(cat, ["을", "를"])} 찾지 못했어요. 이번 권역의 ${josa(cat, ["은", "는"])} 이미 일정에 있거나 그날 쉬어요.`, `I couldn't find another ${cat} for ${dayLabel}. The ones in this area are already in your plan or closed that day.`, `${dayLabel}に追加できる${cat}が見つかりませんでした。このエリアの${cat}はもうプランにあるか、その日は休みです。`, `没找到${dayLabel}还能加的${cat}。这个区域的${cat}已经在行程里，或者当天休息。`));
    const tip = tipOf(pick) ? ` ${firstSentence(tipOf(pick))}` : "";
    return change("addCat", L(`${dayLabel} 동선 근처의 ${josa(nm(pick), ["을", "를"])} 넣어 볼게요.`, `I'll try adding ${nm(pick)}, near your ${dayLabel} route.`, `${dayLabel}のルートの近くにある${nmK(pick)}を入れてみます。`, `我试着加上${dayLabel}路线附近的${nmK(pick)}。`) + tip, { add: [pick.id] });
  }

  /* 2) 정보 질문 ("카페 빼줘", "바다 말고"처럼 빼 달라는 말이면 건너뛰고 3)으로) */
  const negate = wantsRemove || /(말고|싫|없이|그만)/.test(n);
  if (!negate) {
    // 한국어로 쓴 질문은 원문으로 판단 (화면 언어로 답하더라도 "닭갈비"의 비는 비가 아님), 다른 언어는 "rain·雨"가 바뀐 "비"로
    const rain = /[가-힣]/.test(question) ? RAIN.test(question) : n.includes("비");
    if ((has("일출") || has("사진")) && mentioned.length) {
      const sun = has("일출"), p = mentioned[0];
      const listed = THEMES[sun ? "일출" : "사진"].includes(p.id);
      const yes = listed
        ? (sun ? L(`${josa(nm(p), ["은", "는"])} 일출 명소로 꼽혀요. 일출 시간은 계절마다 달라 전날 확인하세요.`, `${nm(p)} is known for its sunrise. Sunrise time changes with the season, so check the day before.`, `${nmK(p)}は日の出の名所です。季節で時間が変わるので前日に確認を。`, `${nmK(p)}是看日出的好地方。日出时间随季节变化，请前一天确认。`)
               : L(`${josa(nm(p), ["은", "는"])} 사진 명소로 꼽혀요.`, `${nm(p)} is a popular photo spot.`, `${nmK(p)}は写真スポットとして人気です。`, `${nmK(p)}是热门拍照地。`))
        : (sun ? L(`${josa(nm(p), ["은", "는"])} 앱에서 일출 명소로 꼽은 곳은 아니에요.`, `${nm(p)} isn't one of the sunrise spots in this app.`, `${nmK(p)}はこのアプリの日の出スポットには入っていません。`, `${nmK(p)}不在本应用的日出推荐里。`)
               : L(`${josa(nm(p), ["은", "는"])} 앱에서 사진 명소로 꼽은 곳은 아니에요.`, `${nm(p)} isn't one of the photo spots in this app.`, `${nmK(p)}はこのアプリの写真スポットには入っていません。`, `${nmK(p)}不在本应用的拍照推荐里。`));
      return info(sun ? "sunrise" : "photo", `${yes} ${tipOf(p) || ""}`.trim());
    }
    if (has("운영")) {
      const dateOf = (p) => trip.days.find((d) => d.items.some((i) => i.id === p.id))?.date || day.date;
      const lines = targets.filter((p) => p.hours || p.start).map((p) => `${hoursLine(p, dateOf(p))}${mentioned.length ? ` (${md(dateOf(p))})` : ""}`);
      const tip = mentioned.length === 1 ? tipOf(mentioned[0]) || "" : "";
      const note = tip.split(/(?<=[.。])\s?/).find((x) => /오일장|통제|운휴|예약|휴무|five-day market|close|stops|reservation|五日市|閉鎖|運休|止ま|入山|五日集|封闭|停运|关闭|禁止/.test(x));
      const head = mentioned.length ? L("운영시간이에요.", "Opening hours:", "営業時間です。", "营业时间：") : L(`${dayLabel}(${md(day.date)}) 운영시간이에요.`, `${dayLabel} (${md(day.date)}) opening hours:`, `${dayLabel}(${md(day.date)})の営業時間です。`, `${dayLabel}(${md(day.date)})的营业时间：`);
      if (lines.length) return info("hours", `${head} ${lines.join(sep)}${cjk ? "。" : "."}${note ? ` ${note}` : ""}`);
    }
    if (has("입장료")) {
      const ps = targets.filter((p) => !p.start && p.cat !== "food" && p.cat !== "cafe");
      if (ps.length) {
        const sum = ps.reduce((acc, p) => acc + (fees[p.id]?.adult || 0), 0);
        const unknown = ps.some((p) => !fees[p.id]);
        const total = !mentioned.length && sum ? L(` ${dayLabel} 입장료는 어른 1명 ${won(sum)}원 정도예요.`, ` ${dayLabel} admission comes to about ₩${won(sum)} per adult.`, ` ${dayLabel}の入場料は大人1人約${won(sum)}ウォンです。`, ` ${dayLabel}的门票成人每人约${won(sum)}韩元。`) : "";
        const unk = unknown ? L(" 요금 정보가 없는 곳은 현장에서 확인해 주세요.", " Please check prices on site where there's no fee info.", " 料金情報がない所は現地で確認してください。", " 没有票价信息的地方请到现场确认。") : "";
        return info("fee", `${ps.map(feeLine).join(sep)}${cjk ? "。" : "."}${total}${unk}`);
      }
    }
    if (has("소요시간") && mentioned.length) {
      const trail = mentioned.some((p) => p.trailKm);
      return info("duration", mentioned.map((p) => L(`${josa(nm(p), ["은", "는"])} 보통 ${p.stay || 60}분 정도 머물러요.`, `People usually spend about ${p.stay || 60} minutes at ${nm(p)}.`, `${nmK(p)}は普通${p.stay || 60}分ほど過ごします。`, `${nmK(p)}一般待${p.stay || 60}分钟左右。`)).join(" ") + (trail ? L(" 탐방로는 걷는 속도에 따라 더 걸릴 수 있어요.", " Trails can take longer depending on your pace.", " 遊歩道は歩く速さによってもっとかかることがあります。", " 步道根据步行速度可能需要更久。") : ""));
    }
    if (has("아이") || has("부모님")) {
      const kid = has("아이"), tag = kid ? "kids" : "senior";
      const who = L(kid ? "아이" : "부모님", kid ? "kids" : "parents", kid ? "子ども" : "ご両親", kid ? "孩子" : "父母");
      const ps = targets.filter((p) => p.cat);
      const good = ps.filter((p) => (p.tags || []).includes(tag));
      const hard = ps.filter((p) => p.walk >= 3);
      const rest = ps.filter((p) => !good.includes(p));
      const withWho = L(josa(who, ["과", "와"]), `with ${who}`, `${who}と`, `带${who}`);
      const allTxt = mentioned.length ? null : L(`${dayLabel} 일정은 모두`, `Everything on ${dayLabel}`, `${dayLabel}のプランはすべて`, `${dayLabel}的行程都`);
      let a = !rest.length
        ? L(`${allTxt || J(ps, ["은", "는"])} ${withWho} 가기 좋은 곳이에요.`, `${allTxt || list(ps)} ${be(ps, "is", "are")} a good fit ${withWho}.`, `${allTxt || `${list(ps)}は`}${withWho}行くのに向いています。`, `${allTxt || list(ps)}适合${withWho}去。`)
        : !good.length
          ? L(`${J(ps, ["은", "는"])} ${who} 동반에 특히 맞춘 곳은 아니에요.`, `${list(ps)} ${be(ps, "isn't", "aren't")} especially suited for going ${withWho}.`, `${list(ps)}は${who}連れ向けというわけではありません。`, `${list(ps)}不算特别适合${withWho}去。`)
          : L(`${J(good, ["은", "는"])} ${withWho} 가기 좋아요. ${J(rest, ["은", "는"])} ${who} 동반에 특히 맞춘 곳은 아니에요.`, `${list(good)} ${be(good, "is", "are")} good ${withWho}. ${list(rest)} ${be(rest, "isn't", "aren't")} especially suited for it.`, `${list(good)}は${withWho}行くのに向いています。${list(rest)}は${who}連れ向けというわけではありません。`, `${list(good)}适合${withWho}去。${list(rest)}不算特别适合。`);
      if (hard.length) a += L(` ${J(hard, ["은", "는"])} 많이 걷거나 계단이 있어요.`, ` ${list(hard)} ${be(hard, "involves", "involve")} a lot of walking or stairs.`, ` ${list(hard)}はたくさん歩くか階段があります。`, ` ${list(hard)}要走很多路或有台阶。`);
      const kind = kid ? "kids" : "parents";
      if (!mentioned.length && hard.length) return change(kind, a + L(" 덜 걷는 일정으로 바꿔 볼게요.", " I'll switch to a plan with less walking.", " 歩く量の少ないプランに変えてみます。", " 我换成少走路的行程。"), { lessWalk: "on", pace: kid ? "keep" : "relaxed" });
      return info(kind, a);
    }
    if (has("계단") && !/(해줘|바꿔|줄여)/.test(n)) {
      const ps = targets.filter((p) => p.cat);
      const hard = ps.filter((p) => p.walk >= 3), mid = ps.filter((p) => p.walk === 2);
      if (ps.length) return info("walk", hard.length
        ? L(`${J(hard, ["은", "는"])} 많이 걷거나 오르막·계단이 있어요.${mid.length ? ` ${J(mid, ["은", "는"])} 보통이에요.` : ""} "덜 걷게 해줘"라고 하면 일정을 바꿔 드려요.`,
          `${list(hard)} ${be(hard, "involves", "involve")} a lot of walking, slopes or stairs.${mid.length ? ` ${list(mid)} ${be(mid, "is", "are")} moderate.` : ""} Say "less walking" and I'll change the plan.`,
          `${list(hard)}はたくさん歩くか、坂や階段があります。${mid.length ? `${list(mid)}は普通です。` : ""}「歩きたくない」と言えばプランを変えます。`,
          `${list(hard)}要走很多路，或有坡和台阶。${mid.length ? `${list(mid)}一般。` : ""}说“少走路”就帮你改行程。`)
        : L(`${J(ps, ["은", "는"])} 많이 걷지 않아도 되는 곳이에요.`, `${list(ps)} ${be(ps, "doesn't", "don't")} need much walking.`, `${list(ps)}はあまり歩かなくて大丈夫です。`, `${list(ps)}不用走太多路。`));
    }
    if (rain) {
      const out = dayPlaces.filter((p) => p.cat && !p.indoor);
      if (!out.length) return info("rain", L(`${dayLabel} 일정은 모두 실내라 비가 와도 괜찮아요.`, `Everything on ${dayLabel} is indoors, so rain is fine.`, `${dayLabel}のプランはすべて屋内なので、雨でも大丈夫です。`, `${dayLabel}的行程都在室内，下雨也没关系。`));
      return change("rain", L(`${dayLabel} 일정 중 ${J(out, ["은", "는"])} 야외예요. 비가 오면 실내 위주로 바꿔 볼게요.`, `On ${dayLabel}, ${list(out)} ${be(out, "is", "are")} outdoors. If it rains, I'll switch to mostly indoor places.`, `${dayLabel}のうち${list(out)}は屋外です。雨なら屋内中心に変えてみます。`, `${dayLabel}里${list(out)}在户外。下雨的话我改成以室内为主。`), { indoor: "on" });
    }
    if (has("일출") || has("사진")) {
      const sun = has("일출");
      const ps = THEMES[sun ? "일출" : "사진"].map((id) => PLACES.find((p) => p.id === id)).filter((p) => regions.has(p.region));
      const addHint = ps.length ? L(` 넣고 싶으면 "${ps[0].name} 넣어줘"라고 말해 주세요.`, ` To add one, say "add ${nm(ps[0])}".`, ` 入れたいときは「${nm(ps[0])}を追加」と言ってください。`, ` 想加的话，请说“加上${nm(ps[0])}”。`) : "";
      if (ps.length) return info(sun ? "sunrise" : "photo", sun
        ? L(`일출 명소로는 ${J(ps, ["이", "가"])} 있어요. 일출은 계절마다 시간이 달라 전날 확인하세요.`, `Good sunrise spots: ${list(ps)}. Sunrise time changes with the season, so check the day before.`, `日の出の名所は${list(ps)}です。季節で時間が変わるので前日に確認を。`, `看日出的好地方有${list(ps)}。日出时间随季节变化，请前一天确认。`) + addHint
        : L(`사진 명소로는 ${J(ps, ["이", "가"])} 있어요.`, `Good photo spots: ${list(ps)}.`, `写真スポットは${list(ps)}です。`, `拍照的好地方有${list(ps)}。`) + addHint);
    }
    if (has("밤")) {
      const ps = PLACES.filter((p) => regions.has(p.region) && (p.tags || []).includes("night")).slice(0, 5);
      if (ps.length) return info("night", L(`저녁에 가기 좋은 곳은 ${J(ps, ["이에요", "예요"])}. 운영시간은 날짜마다 다르니 "운영시간 알려줘"로 확인하세요.`, `Good places for the evening: ${list(ps)}. Hours change by date, so ask "opening hours" to check.`, `夜に行くのにいい所は${list(ps)}です。営業時間は日によって違うので「営業時間」と聞いて確認してください。`, `适合晚上去的地方有${list(ps)}。营业时间每天不同，可以问“营业时间”确认。`));
    }
    if ((has("맛집") || has("카페")) && !mentioned.length) {
      const cafe = has("카페") && !has("맛집");
      const center = day.items.length ? day.items[0].place : null;
      const ps = PLACES.filter((p) => p.cat === (cafe ? "cafe" : "food") && regions.has(p.region) && !hoursFor(p, day.date).closedToday)
        .sort((a, b) => (center ? dist(a, center) - dist(b, center) : 0)).slice(0, 3);
      const item = (p) => (lang === "ko" ? `${p.name}(${p.desc})` : `${nmK(p)} — ${firstSentence(tipOf(p) || "")}`);
      if (ps.length) return info(cafe ? "cafe" : "food", L(
        `${dayLabel} 동선 근처 ${cafe ? "카페" : "먹을 곳"}이에요. ${ps.map(item).join(", ")}. 넣고 싶으면 이름과 함께 "넣어줘"라고 말해 주세요.`,
        `${cafe ? "Cafes" : "Places to eat"} near your ${dayLabel} route: ${ps.map(item).join(" ")} To add one, say "add" with its name.`,
        `${dayLabel}のルート近くの${cafe ? "カフェ" : "食事処"}です。${ps.map(item).join(" ")} 入れたいときは名前と一緒に「追加」と言ってください。`,
        `${dayLabel}路线附近的${cafe ? "咖啡店" : "餐厅"}：${ps.map(item).join(" ")} 想加的话，请说名字加“加上”。`));
    }
    const key = FAQ.find((f) => f.keys.some((k) => n.includes(k)));
    if (key) {
      const pickR = (a) => (typeof a === "string" ? a : a[ctx.input?.region] || a.gangneung);
      const k = { 주차: "주차", 가는법: "가는법", 특산물: "특산물", 숙소: "숙소" }[key.keys[0]];
      if (lang === "ko") return info(`faq:${k}`, pickR(key.answer) + (key.after || ""));
      const table = { en: FAQ_EN, ja: FAQ_JA, zh: FAQ_ZH }[lang];
      return info(`faq:${k}`, pickR(table[k]) + (table[`${k}_after`] || ""));
    }
    if (mentioned.length) {
      const p = mentioned[0];
      const walk = p.walk >= 3 ? L("많이 걸어요", "lots of walking", "よく歩く", "要走很多路") : p.walk === 2 ? L("걷는 양 보통", "some walking", "歩く量は普通", "步行量一般") : L("걷는 양 적음", "little walking", "あまり歩かない", "走路不多");
      const facts = [p.indoor ? L("실내", "indoors", "屋内", "室内") : L("야외", "outdoors", "屋外", "户外"), L(`보통 ${p.stay || 60}분`, `usually ${p.stay || 60} min`, `普通${p.stay || 60}分`, `一般${p.stay || 60}分钟`), walk];
      if (p.hours) facts.push(hoursLine(p, day.date).replace(`${nm(p)} `, `${md(day.date)} `));
      const where = inTrip.has(p.id)
        ? L(" 지금 일정에 들어 있어요.", " It's in your plan.", " 今のプランに入っています。", " 已经在行程里。")
        : L(` 지금 일정에는 없어요. 넣고 싶으면 "${p.name} 넣어줘"라고 말해 주세요.`, ` It's not in your plan. To add it, say "add ${nm(p)}".`, ` 今のプランには入っていません。入れたいときは「${nm(p)}を追加」と言ってください。`, ` 现在不在行程里。想加的话，请说“加上${nm(p)}”。`);
      const head = `${nmK(p)}: `;
      return info("place", `${head}${tipOf(p) || `${nm(p)}: ${p.desc}.`} (${facts.join(" · ")})${where}`);
    }
  }

  /* 3) 조건 바꾸기: 덜 걷기·여유롭게·카페 빼기 등 (다른 언어는 핵심어로 바꾼 문장으로 판단) */
  const c = parseRequestLocally(/[가-힣]/.test(question) ? question : n);
  const lessWalk = c.lessWalk || (has("계단") && /(해줘|바꿔|줄여)/.test(n));
  if (c.indoor || lessWalk || c.pace || c.prefer.length || c.avoid.length) {
    const avoid = [...new Set([...(opts.avoid || []), ...c.avoid])].filter((x) => !c.prefer.includes(x));
    const prefer = [...new Set([...(opts.prefer || []), ...c.prefer])].filter((x) => !avoid.includes(x));
    return change("prefs", L("요청하신 대로 바꿔 볼게요.", "I'll change the plan as you asked.", "ご希望どおりに変えてみます。", "我按你的要求改一下。"), { prefer, avoid, indoor: c.indoor ? "on" : "keep", lessWalk: lessWalk ? "on" : "keep", pace: c.pace || "keep" });
  }
  return info("help", L(
    "AI 서버 없이 답하는 간단 모드예요. 장소 이름과 함께 운영시간·입장료·아이/부모님·계단·소요시간을 묻거나, \"오죽헌 넣어줘\", \"2일차에 바다 한 곳 더\", \"카페 빼줘\", \"덜 걷게 해줘\"처럼 말해 주세요.",
    "This is the simple mode that works without an AI server. Ask about a place's hours, price, kids/parents, stairs or how long to stay, or say things like \"add Ojukheon\", \"one more beach on day 2\", \"no cafes\" or \"less walking\".",
    "AIサーバーなしで答える簡易モードです。場所の名前と一緒に営業時間・入場料・子ども/ご両親・階段・所要時間を聞くか、「烏竹軒を追加」「2日目に海をもう一つ」「カフェなし」「歩きたくない」のように言ってください。",
    "这是不用AI服务器的简易模式。可以带上地点名问营业时间、门票、带孩子/父母、台阶、要待多久，或者说“加上乌竹轩”“第2天再加一个海边”“不要咖啡”“少走路”。"));
}

// 숙소 안심 체크 (AI 없이): 붙여넣은 글에서 위험한 표현을 찾는다. 결과 문장은 화면 언어로
const LC = {
  ko: { noRule: "취소 규정 문구를 찾지 못했어요. 예약 전에 꼭 확인하세요.", noRefund: "환불 불가 조건이 있어요. 일정이 바뀌면 돈을 돌려받지 못할 수 있어요.", late: "임박해서 취소하면 환불이 안 돼요. 며칠 전까지 무료 취소인지 확인하세요.", fee: "취소 시점에 따라 수수료가 붙어요.", free: "무료 취소가 가능해요. 마감 시점만 확인하세요.",
    extra: "추가 인원·바비큐·현장 결제 등 별도 요금이 있어요. 총액을 확인하세요.", noCompare: "평소 가격과 비교할 데이터는 없어요. 같은 날짜 다른 숙소와 비교해 보세요.",
    rv: ["곰팡이·습기 이야기가 있어요", "벌레가 나왔다는 후기가 있어요", "소음 이야기가 있어요", "냄새 이야기가 있어요", "청결 문제 후기가 있어요", "사진과 다르다는 후기가 있어요", "응대가 불친절했다는 후기가 있어요", "주차가 불편하다는 후기가 있어요"],
    ask: ["무료 취소 마감 시점", "추가 요금 포함 총액", "주차 가능 대수"], sum: { low: "큰 위험 신호는 보이지 않아요.", mid: "예약 전에 확인할 점이 있어요.", high: "환불 조건이 까다로워요. 신중하게 예약하세요." }, note: " (AI 연결 없이 문구만 살펴본 결과예요)" },
  en: { noRule: "No cancellation policy found. Check it before booking.", noRefund: "There's a no-refund condition. If your plans change, you may not get your money back.", late: "Late cancellations aren't refunded. Check how many days before free cancellation ends.", fee: "A fee applies depending on when you cancel.", free: "Free cancellation is available. Just check the deadline.",
    extra: "There are extra charges (extra guests, barbecue, pay on site). Check the total.", noCompare: "There's no usual-price data to compare. Compare with other places for the same dates.",
    rv: ["Reviews mention mold or damp", "Reviews mention bugs", "Reviews mention noise", "Reviews mention smells", "Reviews mention cleanliness problems", "Reviews say it differs from the photos", "Reviews mention unfriendly staff", "Reviews say parking is difficult"],
    ask: ["Free cancellation deadline", "Total price including extra charges", "Number of parking spaces"], sum: { low: "No major warning signs.", mid: "There are things to check before booking.", high: "Strict refund conditions. Book carefully." }, note: " (checked the wording only, without AI)" },
  ja: { noRule: "キャンセル規定の記載が見つかりません。予約前に必ず確認してください。", noRefund: "返金不可の条件があります。予定が変わるとお金が戻らないかもしれません。", late: "直前のキャンセルは返金されません。何日前まで無料キャンセルか確認してください。", fee: "キャンセルの時期によって手数料がかかります。", free: "無料キャンセルができます。締切だけ確認してください。",
    extra: "追加人数・バーベキュー・現地払いなど別料金があります。総額を確認してください。", noCompare: "普段の料金と比べるデータはありません。同じ日の他の宿と比べてみてください。",
    rv: ["カビ・湿気の話があります", "虫が出たという口コミがあります", "騒音の話があります", "においの話があります", "清潔さに問題があるという口コミがあります", "写真と違うという口コミがあります", "対応が不親切だったという口コミがあります", "駐車が不便という口コミがあります"],
    ask: ["無料キャンセルの締切", "追加料金込みの総額", "駐車できる台数"], sum: { low: "大きな危険信号は見当たりません。", mid: "予約前に確認したい点があります。", high: "返金条件が厳しいです。慎重に予約してください。" }, note: " (AIなしで文面だけを見た結果です)" },
  zh: { noRule: "没找到取消规定的内容。预订前请一定确认。", noRefund: "有不可退款的条件。行程变了可能拿不回钱。", late: "临近取消不退款。请确认提前几天可以免费取消。", fee: "根据取消时间会收手续费。", free: "可以免费取消。只要确认截止时间。",
    extra: "有加人、烧烤、现场付款等额外费用。请确认总价。", noCompare: "没有平时价格可以比较。请和同一天的其他住宿比比看。",
    rv: ["评价提到发霉、潮湿", "有评价说出现了虫子", "评价提到噪音", "评价提到异味", "有评价说卫生有问题", "有评价说和照片不一样", "有评价说服务态度不好", "有评价说停车不方便"],
    ask: ["免费取消截止时间", "含额外费用的总价", "可停车数量"], sum: { low: "没看到大的风险信号。", mid: "预订前有需要确认的地方。", high: "退款条件很严格。请谨慎预订。" }, note: " (未连接AI，只检查了文字)" },
};
export function checkLodgingLocal(text, lang = "ko") {
  const M = LC[lang] || LC.ko;
  const t = text.replace(/\s+/g, " ");
  const find = (re) => re.test(t);
  let cancel = { risk: "low", plain: M.noRule };
  if (find(/환불\s*불가|취소\s*불가|환불이?\s*안|non-?refundable|返金不可|不可退款|不退款/i)) cancel = { risk: "high", plain: M.noRefund };
  else if (find(/(당일|1일 ?전|전날).{0,10}(취소|환불).{0,10}(불가|0%|없)/)) cancel = { risk: "mid", plain: M.late };
  else if (find(/위약금|수수료|\d+\s*%\s*(공제|환불)|cancellation fee|キャンセル料|手续费/i)) cancel = { risk: "mid", plain: M.fee };
  else if (find(/무료\s*취소|free cancellation|無料キャンセル|免费取消/i)) cancel = { risk: "low", plain: M.free };
  const price = find(/추가\s*(요금|인원|비용)|별도|현장\s*결제|바비큐.{0,6}(유료|별도)|extra (charge|guest|fee)|pay at (the )?property|追加料金|現地払い|额外费用|到店付款/i)
    ? { risk: "mid", plain: M.extra }
    : { risk: "low", plain: M.noCompare };
  const words = [/곰팡이|습기|눅눅|mold|damp|カビ|发霉/i, /벌레|바퀴|bugs?|cockroach|虫|蟑螂/i, /소음|시끄|방음|noisy|noise|うるさ|騒音|噪音|吵/i, /냄새|악취|smell|におい|臭/i,
    /더럽|청소.{0,4}안|머리카락|위생|dirty|unclean|汚|不干净|脏/i, /사진과\s*(다|달)|사진이랑|not like the photos|写真と違|和照片不一样/i, /불친절|응대|rude|不親切|态度差/i, /주차.{0,6}(어렵|어려|불가|좁|없|힘들)|parking (is )?(hard|difficult)|駐車.{0,4}(難|不便)|停车.{0,4}(难|不便)/i];
  const reviews = words.map((re, i) => (find(re) ? { risk: "mid", plain: M.rv[i] } : null)).filter(Boolean);
  const ask = [];
  if (cancel.risk !== "low") ask.push(M.ask[0]);
  if (price.risk === "mid") ask.push(M.ask[1]);
  if (find(/주차|parking|駐車|停车/i)) ask.push(M.ask[2]);
  const worst = [cancel.risk, price.risk, ...reviews.map((r) => r.risk)].includes("high") ? "high" : reviews.length >= 2 || cancel.risk === "mid" ? "mid" : "low";
  return { summary: M.sum[worst] + M.note, cancel, price, reviews, ask };
}
