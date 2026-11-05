// AI 기능: 한 줄 시작, AI 가이드, 숙소 안심 체크, 메뉴판 읽기
// OpenAI 방식(OpenAI 호환) API를 쓴다. 모델·주소는 환경변수로 정한다. 키가 없으면 화면이 무료 간단 모드(public/ai-local.js)로 답한다.
//   AI_API_KEY (또는 OPENAI_API_KEY) · AI_MODEL (필수, 예: 제공사 콘솔에 적힌 모델 ID)
//   AI_BASE_URL (OpenAI가 아닌 호환 API일 때) · AI_REASONING_EFFORT (추론 모델이면 low/medium/high)
// 원칙: AI는 말을 이해하고 설명만 한다. 장소는 검증된 데이터의 id 중에서만 고를 수 있고(스키마 enum + 서버 재검사),
//       실제 배치와 영업시간 확인은 일정 엔진이 다시 한다.
import OpenAI from "openai";
import { PLACES, FESTIVALS, REGIONS } from "./public/data.js";
import { hoursFor, addDays, fmt } from "./public/planner.js";

export const AI_MODEL = process.env.AI_MODEL || "";
// 기다리는 최대 시간. 넘으면 서버가 실패를 돌려주고 화면은 바로 무료 간단 모드로 답한다 (화면 쪽은 이보다 1초 길게 기다림)
export const START_MS = 6_000, GUIDE_MS = 8_000;
const CATS = ["sea", "cafe", "food", "culture", "nature"];
const REGION_KEYS = Object.keys(REGIONS);
const NEIGHBORS = {
  gangneung: ["pyeongchang", "seorak"], seorak: ["gangneung", "chuncheon"], chuncheon: ["wonju", "seorak"],
  pyeongchang: ["gangneung", "wonju"], wonju: ["pyeongchang", "chuncheon"],
};

let client = null;
function getClient() {
  if (!AI_MODEL) throw new Error("AI_MODEL이 설정되지 않았습니다");
  return (client ??= new OpenAI({
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY,
    ...(process.env.AI_BASE_URL ? { baseURL: process.env.AI_BASE_URL } : {}),
    timeout: 40_000,
    maxRetries: 1,
  }));
}

// 응답이 스키마를 지키는지 서버에서도 확인 (구조화 출력을 엄격히 지키지 않는 모델 대비)
function conforms(v, sc) {
  if (sc.enum) return sc.enum.includes(v);
  if (sc.type === "string") return typeof v === "string";
  if (sc.type === "integer") return Number.isInteger(v);
  if (sc.type === "boolean") return typeof v === "boolean";
  if (sc.type === "array") return Array.isArray(v) && v.every((x) => conforms(x, sc.items));
  if (sc.type === "object") return v && typeof v === "object" && (sc.required || []).every((k) => k in v && conforms(v[k], sc.properties[k]));
  return true;
}

// 같은 앞부분(system + 장소 데이터)은 제공사의 자동 프롬프트 캐시가 재사용하도록 앞에 둔다
// timeout: 화면에서 기다리는 시간보다 조금 짧게 (재시도 없이 바로 실패 → 화면은 규칙 기반으로 대체)
async function askJSON({ system, user, schema, name = "result", image = null, sanitize = (o) => o, timeout = 18_000 }) {
  const text = typeof user === "string" ? user : user.map((b) => b.text).join("\n\n");
  const content = image
    ? [{ type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } }, { type: "text", text }]
    : text;
  const base = {
    model: AI_MODEL,
    max_completion_tokens: 6000,
    ...(process.env.AI_REASONING_EFFORT ? { reasoning_effort: process.env.AI_REASONING_EFFORT } : {}),
  };
  let res;
  try {
    res = await getClient().chat.completions.create({
      ...base,
      messages: [{ role: "system", content: system }, { role: "user", content }],
      response_format: { type: "json_schema", json_schema: { name, schema, strict: true } },
    }, { timeout, maxRetries: 0 });
  } catch (err) {
    // 구조화 출력(json_schema)을 지원하지 않는 호환 API면 JSON 모드 + 스키마 설명으로 다시
    if (!(err instanceof OpenAI.BadRequestError)) throw err;
    res = await getClient().chat.completions.create({
      ...base,
      messages: [{ role: "system", content: `${system}\n\n반드시 아래 JSON 스키마에 맞는 JSON 객체 하나만 출력한다.\n${JSON.stringify(schema)}` }, { role: "user", content }],
      response_format: { type: "json_object" },
    }, { timeout, maxRetries: 0 });
  }
  const choice = res.choices?.[0];
  if (!choice) throw new Error("empty");
  if (choice.message?.refusal) throw new Error("refused");
  if (choice.finish_reason === "length") throw new Error("truncated");
  const out = sanitize(JSON.parse(choice.message?.content || ""));
  if (!conforms(out, schema)) throw new Error("schema mismatch");
  return out;
}

/* ---------- 1) 한 줄로 시작 ---------- */
const START_SCHEMA = {
  type: "object",
  properties: {
    region: { type: "string", enum: REGION_KEYS },
    date: { type: "string", description: "YYYY-MM-DD" },
    days: { type: "integer", enum: [1, 2, 3, 4, 5] },
    who: { type: "string", enum: ["solo", "couple", "family", "parents"] },
    likes: { type: "array", items: { type: "string", enum: CATS } },
    move: { type: "string", enum: ["car", "taxi", "transit"] },
    summary: { type: "string" },
  },
  required: ["region", "date", "days", "who", "likes", "move", "summary"],
  additionalProperties: false,
};

const START_SYSTEM = `강원도 여행 일정 앱의 입력 도우미다. 사용자가 한 줄로 말한 여행 계획을 앱의 선택값으로 바꾼다.
- region: gangneung(강릉·동해·삼척·정동진), seorak(속초·양양·고성·설악산·인제), chuncheon(춘천·남이섬·화천·철원·홍천), pyeongchang(평창·대관령·정선·영월·태백), wonju(원주·횡성). 지역 언급이 없으면 취향에 가장 맞는 곳.
- date: 오늘 날짜를 기준으로 "내일", "이번 주말", "다음 달 3일" 등을 실제 날짜로. 언급이 없으면 내일.
- days: 당일=1, 1박 2일=2, 2박 3일=3, 3박 4일=4, 4박 5일 이상=5. 언급이 없으면 2.
- who: 혼자=solo, 연인·친구=couple, 아이·가족=family, 부모님·어르신=parents. 언급이 없으면 couple.
- likes: sea(바다), cafe(카페), food(맛집·시장), culture(역사·문화·전시), nature(자연·산책). 1~3개.
- move: 자동차·렌터카=car, 택시=taxi, 기차·버스·뚜벅이=transit. 언급이 없으면 car.
- summary: 고른 내용을 20자 안팎 한국어로. 예) "속초 1박 2일 · 부모님과 · 자동차"`;

// 화면이 영어(lang="en")면 사람에게 보이는 글(summary·answer·plain 등)만 영어로 받는다. 선택값·id는 그대로.
const replyIn = (lang) => (lang === "en" ? "\n\n(사용자 화면이 영어다. 사람에게 보이는 문장은 모두 영어로 쓴다.)" : "");

export async function startFromText(text, today, lang) {
  const r = await askJSON({ system: START_SYSTEM, user: `오늘: ${today}\n사용자: ${text}${replyIn(lang)}`, schema: START_SCHEMA, name: "trip_choices", timeout: START_MS });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date < today) r.date = addDays(today, 1);
  r.likes = [...new Set(r.likes)].slice(0, 3);
  return r;
}

/* ---------- 2) AI 가이드 ---------- */
function hoursText(p, date) {
  if (p.start) return p.start <= date && date <= p.end ? "축제 진행" : "축제 기간 아님";
  const h = hoursFor(p, date);
  if (h.closedToday) return "휴무";
  if (h.open === 0 && h.close >= 1439) return "상시";
  let s = `${fmt(h.open)}–${fmt(h.close)}`;
  if (h.lastEntry !== null) s += ` 입장마감 ${fmt(h.lastEntry)}`;
  if (p.multi) s += " 가게별 상이";
  return s;
}

function candidatesFor(trip) {
  const r = trip.input.region;
  const regions = new Set([r, ...(trip.input.days > 1 ? NEIGHBORS[r] : [])]);
  const dates = Array.from({ length: trip.input.days }, (_, i) => addDays(trip.input.date, i));
  const list = [...PLACES, ...FESTIVALS.filter((f) => f.start)].filter((p) => regions.has(p.region));
  return { list, dates };
}

export async function guide({ question, history, trip, lang }) {
  const { list, dates } = candidatesFor(trip);
  const tripIds = trip.days.flatMap((d) => d.items.map((i) => i.id)).filter((id) => list.some((p) => p.id === id));
  const allIds = list.map((p) => p.id);
  const schema = {
    type: "object",
    properties: {
      answer: { type: "string" },
      changed: { type: "boolean" },
      // 장소 id는 enum으로 묶지 않는다: 여행마다 스키마가 바뀌면 매번 형식 준비 시간이 더 든다. 없는 id는 sanitize가 버린다
      remove: { type: "array", items: { type: "string" } },
      add: { type: "array", items: { type: "string" } },
      prefer: { type: "array", items: { type: "string", enum: CATS } },
      avoid: { type: "array", items: { type: "string", enum: CATS } },
      indoor: { type: "string", enum: ["on", "off", "keep"] },
      lessWalk: { type: "string", enum: ["on", "off", "keep"] },
      pace: { type: "string", enum: ["relaxed", "normal", "packed", "keep"] },
    },
    required: ["answer", "changed", "remove", "add", "prefer", "avoid", "indoor", "lessWalk", "pace"],
    additionalProperties: false,
  };

  const system = `너는 강원도 여행 앱 "오늘강원"의 AI 가이드다. 사용자의 현재 일정과 아래 장소 데이터만 근거로 한국어로 답한다.
규칙:
- 장소는 주어진 목록에 있는 것만 말한다. 목록에 없는 가게·가격·전화번호는 지어내지 말고 "앱 데이터로는 확인할 수 없어요"라고 한다.
- 운영시간은 데이터에 적힌 날짜별 시간만 쓴다.
- 답은 2~4문장, 친근하고 짧게. 목록·마크다운 없이.
- 일정을 바꿔 달라는 요청이면 changed=true로 하고 remove(일정에서 뺄 id), add(넣을 id), prefer/avoid(원하는 카테고리 전체 목록), indoor/lessWalk/pace를 채운다. 바꿀 게 없으면 changed=false, 빈 배열, keep.
- 바꾼다고 확정해서 말하지 말고 "이렇게 바꿔 볼게요"처럼 말한다. 앱이 영업시간을 다시 확인한 뒤 반영한다.
- 질문만 한 경우(예: 비 오면? 아이랑 괜찮아?)에는 이유와 함께 답하고, 바꾸는 게 좋겠으면 changed=true로 제안을 담는다.`;

  const placeLines = list.map((p) => `${p.id} | ${p.name} | ${p.cat || "festival"} | ${p.indoor ? "실내" : "야외"} | 걷기${p.walk ?? 2} | ${p.desc} | ${dates.map((d) => `${d.slice(5)} ${hoursText(p, d)}`).join(", ")}`).join("\n");
  const planLines = trip.days.map((d, i) => `${i + 1}일차 ${d.date} (${d.areaName}): ${d.items.map((it) => `${it.start} ${it.name}[${it.id}]`).join(" → ")}`).join("\n");
  const hist = (history || []).slice(-4).map((h) => `사용자: ${h.q}\n가이드: ${h.a}`).join("\n");

  // 장소 데이터는 같은 여행이면 매번 같으므로 앞쪽에 두고 캐시한다
  const user = [
    { text: `장소 데이터 (id | 이름 | 분류 | 실내/야외 | 걷는 양 | 설명 | 날짜별 운영):\n${placeLines}`, cache: true },
    { text: `여행 조건: ${JSON.stringify({ region: REGIONS[trip.input.region].label, who: trip.input.who, likes: trip.input.likes, move: trip.input.move, ...trip.opts })}
숙소: ${trip.lodging ? `${trip.lodging.name} ${trip.lodging.typeLabel} (여행 내내 같은 숙소)` : "없음(당일)"}
현재 일정:
${planLines}
${hist ? `\n이전 대화:\n${hist}\n` : ""}
사용자: ${question}${replyIn(lang)}` },
  ];

  // 앱 데이터에 없는 장소 id는 버린다 (답변은 살림)
  const sanitize = (o) => ({
    ...o,
    remove: Array.isArray(o?.remove) ? o.remove.filter((id) => tripIds.includes(id)) : [],
    add: Array.isArray(o?.add) ? o.add.filter((id) => allIds.includes(id)) : [],
  });
  const r = await askJSON({ system, user, schema, name: "guide_reply", sanitize, timeout: GUIDE_MS });
  return r;
}

/* ---------- 3) 숙소 안심 체크 ---------- */
const RISK = { type: "string", enum: ["low", "mid", "high"] };
const CHECK_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    cancel: { type: "object", properties: { risk: RISK, plain: { type: "string" } }, required: ["risk", "plain"], additionalProperties: false },
    price: { type: "object", properties: { risk: RISK, plain: { type: "string" } }, required: ["risk", "plain"], additionalProperties: false },
    reviews: { type: "array", items: { type: "object", properties: { risk: RISK, plain: { type: "string" } }, required: ["risk", "plain"], additionalProperties: false } },
    ask: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "cancel", "price", "reviews", "ask"],
  additionalProperties: false,
};
const CHECK_SYSTEM = `여행자가 숙소를 예약하기 전에 붙여넣은 숙소 페이지 내용(가격, 취소·환불 규정, 후기)을 쉬운 말로 점검한다.
- 붙여넣은 글에 있는 내용만 근거로 한다. 없는 정보는 "글에 없어요"라고 쓰고 추측하지 않는다.
- cancel: 언제까지 무료 취소인지, 환불 불가·수수료 조건을 한두 문장으로. 환불 불가면 high.
- price: 총액에 안 들어간 추가 요금(인원, 바비큐, 청소비, 현장 결제)을 찾는다. 평소 가격 데이터는 없으므로 비교했다고 말하지 않는다.
- reviews: 후기에서 반복되는 위험(청결, 벌레, 소음, 사진과 다름, 안전, 주차 등)만 최대 4개. 좋은 점은 넣지 않는다.
- ask: 예약 전에 숙소에 물어볼 것 최대 3개.
- summary: 전체 판단 한 문장. 쉬운 말, 존댓말.`;

export async function lodgingCheck({ text, nights, date, lang }) {
  return askJSON({
    system: CHECK_SYSTEM,
    user: `여행 날짜: ${date || "미정"}, ${nights || 1}박\n\n숙소 페이지 내용:\n${String(text).slice(0, 6000)}${replyIn(lang)}`,
    schema: CHECK_SCHEMA, name: "lodging_check",
  });
}

/* ---------- 4) 메뉴판 사진 → 다국어 메뉴 ---------- */
const MENU_SCHEMA = {
  type: "object",
  properties: {
    shopName: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ko: { type: "string" }, price: { type: "string" },
          en: { type: "string" }, ja: { type: "string" }, zh: { type: "string" },
          note: { type: "string" },
        },
        required: ["ko", "price", "en", "ja", "zh", "note"],
        additionalProperties: false,
      },
    },
    unclear: { type: "array", items: { type: "string" } },
  },
  required: ["shopName", "items", "unclear"],
  additionalProperties: false,
};
const MENU_SYSTEM = `가게 사장님이 찍은 메뉴판 사진을 읽어 외국인 손님용 메뉴로 만든다.
- 사진에 보이는 메뉴와 가격만 옮긴다. 안 보이거나 흐린 것은 지어내지 말고 unclear에 적는다.
- price: 사진에 적힌 그대로(예: "12,000원"). 없으면 빈 문자열.
- en/ja/zh: 음식 이름을 외국인이 이해하게 번역(필요하면 짧은 설명 포함). zh는 간체.
- note: 맵기·주재료 등 사진에 있는 정보만. 없으면 빈 문자열.
- shopName: 사진에 가게 이름이 있으면, 없으면 빈 문자열.`;

export async function menuScan({ image, mediaType }) {
  return askJSON({ system: MENU_SYSTEM, user: "이 메뉴판을 읽어 주세요.", schema: MENU_SCHEMA, name: "menu", image: { data: image, mediaType }, timeout: 40_000 });
}
