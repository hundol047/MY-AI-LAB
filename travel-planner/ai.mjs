// Claude를 쓰는 AI 기능 두 가지
// 1) startFromText: "이번 주말 부모님이랑 속초 1박" 같은 한 줄 → 5개 선택값
// 2) guide: 일정을 보며 묻고 고치는 AI 가이드
// 원칙: AI는 말을 이해하고 설명만 한다. 장소는 검증된 데이터의 id 중에서만 고를 수 있고(스키마 enum),
//       실제 배치와 영업시간 확인은 일정 엔진이 다시 한다.
import Anthropic from "@anthropic-ai/sdk";
import { PLACES, FESTIVALS, REGIONS } from "./public/data.js";
import { hoursFor, addDays, fmt } from "./public/planner.js";

const MODEL = "claude-opus-5-5";
const CATS = ["sea", "cafe", "food", "culture", "nature"];
const REGION_KEYS = Object.keys(REGIONS);
const NEIGHBORS = {
  gangneung: ["pyeongchang", "seorak"], seorak: ["gangneung", "chuncheon"], chuncheon: ["wonju", "seorak"],
  pyeongchang: ["gangneung", "wonju"], wonju: ["pyeongchang", "chuncheon"],
};

let client = null;
const getClient = () => (client ??= new Anthropic());

async function askJSON({ system, user, schema, effort }) {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    output_config: { effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new Error("refused");
  if (response.stop_reason === "max_tokens") throw new Error("truncated");
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("empty");
  return JSON.parse(block.text);
}

/* ---------- 1) 한 줄로 시작 ---------- */
const START_SCHEMA = {
  type: "object",
  properties: {
    region: { type: "string", enum: REGION_KEYS },
    date: { type: "string", description: "YYYY-MM-DD" },
    days: { type: "integer", enum: [1, 2, 3] },
    who: { type: "string", enum: ["solo", "couple", "family", "parents"] },
    likes: { type: "array", items: { type: "string", enum: CATS } },
    move: { type: "string", enum: ["car", "transit"] },
    summary: { type: "string" },
  },
  required: ["region", "date", "days", "who", "likes", "move", "summary"],
  additionalProperties: false,
};

const START_SYSTEM = `강원도 여행 일정 앱의 입력 도우미다. 사용자가 한 줄로 말한 여행 계획을 앱의 선택값으로 바꾼다.
- region: gangneung(강릉·동해·삼척·정동진), seorak(속초·양양·고성·설악산·인제), chuncheon(춘천·남이섬·화천·철원·홍천), pyeongchang(평창·대관령·정선·영월·태백), wonju(원주·횡성). 지역 언급이 없으면 취향에 가장 맞는 곳.
- date: 오늘 날짜를 기준으로 "내일", "이번 주말", "다음 달 3일" 등을 실제 날짜로. 언급이 없으면 내일.
- days: 당일=1, 1박 2일=2, 2박 3일 이상=3. 언급이 없으면 2.
- who: 혼자=solo, 연인·친구=couple, 아이·가족=family, 부모님·어르신=parents. 언급이 없으면 couple.
- likes: sea(바다), cafe(카페), food(맛집·시장), culture(역사·문화·전시), nature(자연·산책). 1~3개.
- move: 자동차·렌터카=car, 기차·버스·뚜벅이=transit. 언급이 없으면 car.
- summary: 고른 내용을 20자 안팎 한국어로. 예) "속초 1박 2일 · 부모님과 · 자동차"`;

export async function startFromText(text, today) {
  const r = await askJSON({ system: START_SYSTEM, user: `오늘: ${today}\n사용자: ${text}`, schema: START_SCHEMA, effort: "low" });
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

export async function guide({ question, history, trip }) {
  const { list, dates } = candidatesFor(trip);
  const tripIds = trip.days.flatMap((d) => d.items.map((i) => i.id)).filter((id) => list.some((p) => p.id === id));
  const allIds = list.map((p) => p.id);
  const schema = {
    type: "object",
    properties: {
      answer: { type: "string" },
      changed: { type: "boolean" },
      remove: { type: "array", items: { type: "string", enum: tripIds.length ? tripIds : ["none"] } },
      add: { type: "array", items: { type: "string", enum: allIds } },
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

  const user = `여행 조건: ${JSON.stringify({ region: REGIONS[trip.input.region].label, who: trip.input.who, likes: trip.input.likes, move: trip.input.move, ...trip.opts })}
숙소: ${trip.lodging ? `${trip.lodging.name} ${trip.lodging.typeLabel} (여행 내내 같은 숙소)` : "없음(당일)"}
현재 일정:
${planLines}

장소 데이터 (id | 이름 | 분류 | 실내/야외 | 걷는 양 | 설명 | 날짜별 운영):
${placeLines}
${hist ? `\n이전 대화:\n${hist}\n` : ""}
사용자: ${question}`;

  const r = await askJSON({ system, user, schema, effort: "medium" });
  r.remove = r.remove.filter((id) => tripIds.includes(id));
  return r;
}
