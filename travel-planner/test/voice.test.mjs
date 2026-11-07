// 말로 한 여행 요청 해석: 날짜·일수·인원·접근성·출발지·시각·속도, 4개 언어. 기준일 2026-11-07(토)
import assert from "node:assert/strict";
import { parseSpoken, parseDate } from "../public/voice-parse.js";

const T = "2026-11-07";
const cases = [
  ["다음 주 토요일에 어른 둘 아이 하나랑 강릉 2박 3일 차로 갈래", { region: "gangneung", date: "2026-11-14", days: 3, who: "family", move: "car" }, { people: { adults: 2, kids: 1 } }],
  ["이번 주말 휠체어 타시는 엄마 모시고 속초 당일치기, 서울역에서 기차로 아침 일찍", { region: "seorak", date: "2026-11-07", days: 1, who: "parents", move: "transit" }, { access: ["wheelchair"], start: "서울역", startTime: "07:00", lessWalk: true }],
  ["춘천 사흘 동안 여유롭게 카페랑 맛집 위주로", { region: "chuncheon", days: 3 }, { pace: "relaxed", likes: ["cafe", "food"] }],
  ["수요일에 혼자 원주 하루 버스로 9시 출발", { region: "wonju", date: "2026-11-11", days: 1, who: "solo", move: "transit" }, { startTime: "09:00" }],
  ["부산에서 기차 타고 강릉이랑 속초 3박 4일 넷이서", { region: "gangneung", days: 4, move: "transit", route: ["gangneung", "seorak"] }, { start: "부전역", people: { adults: 4, kids: 0 } }],
  ["11월 20일부터 평창 3일 동안 강아지랑", { region: "pyeongchang", date: "2026-11-20", days: 3, who: "pet" }, {}],
  ["오후 2시에 출발해서 양양 1박 유모차 끌고", { region: "seorak", days: 2 }, { access: ["stroller"], startTime: "14:00" }],
  ["Gangneung 2 nights with 2 adults and 1 kid by train next Saturday, leave at 8am", { region: "gangneung", date: "2026-11-14", days: 3, who: "family", move: "transit" }, { people: { adults: 2, kids: 1 }, startTime: "08:00" }],
  ["Sokcho day trip tomorrow with a stroller, walk less", { region: "seorak", date: "2026-11-08", days: 1 }, { access: ["stroller"], lessWalk: true }],
  ["来週の土曜日に大人2人子供1人で江陵へ2泊、ゆったり", { region: "gangneung", date: "2026-11-14", days: 3, who: "family" }, { people: { adults: 2, kids: 1 }, pace: "relaxed" }],
  ["下周六两个大人一个孩子去江陵玩两晚，坐火车，早上8点出发", { region: "gangneung", date: "2026-11-14", days: 3, who: "family", move: "transit" }, { people: { adults: 2, kids: 1 }, startTime: "08:00" }],
  ["三天后去束草一日游", { region: "seorak", date: "2026-11-10", days: 1 }, {}],
  ["我们四个人去春川三天", { region: "chuncheon", days: 3 }, { people: { adults: 4, kids: 0 } }],
];
for (const [q, want, extra] of cases) {
  const r = parseSpoken(q, T);
  for (const [k, v] of Object.entries(want)) assert.deepEqual(r.input[k], v, `${q} → ${k}: ${JSON.stringify(r.input[k])}`);
  if (extra.people) assert.deepEqual(r.people, extra.people, `${q} → 인원 ${JSON.stringify(r.people)}`);
  if (extra.access) assert.deepEqual(r.access, extra.access, `${q} → 접근성`);
  if (extra.start) assert.equal(r.start?.name, extra.start, `${q} → 출발지`);
  if (extra.startTime) assert.equal(r.startTime, extra.startTime, `${q} → 출발 시각`);
  if (extra.pace) assert.equal(r.pace, extra.pace, `${q} → 속도`);
  if (extra.lessWalk) assert.equal(r.lessWalk, true, `${q} → 덜 걷기`);
  if (extra.likes) assert.deepEqual(r.input.likes, extra.likes, `${q} → 취향`);
  assert.ok(r.heard.some((h) => h.key === "region") && r.said === q);
}
// 날짜: 평일 기준 "다음 주 토요일"은 다음 주, 요일만 말하면 다가오는 그 요일, "이번 주말"은 이번 주 토요일
assert.equal(parseDate("다음 주 토요일", "2026-11-11").date, "2026-11-21");
assert.equal(parseDate("토요일에", "2026-11-11").date, "2026-11-14");
assert.equal(parseDate("이번 주말", "2026-11-11").date, "2026-11-14");
assert.equal(parseDate("다음 주말", "2026-11-11").date, "2026-11-21");
assert.equal(parseDate("이번 주말", "2026-11-08").date, "2026-11-08");
assert.equal(parseDate("1월 3일", "2026-11-07").date, "2027-01-03");
// 도시 이름만으로는 출발지로 보지 않는다 ("서울 사람인데" ≠ 출발지), "서울에서"는 출발지
assert.equal(parseSpoken("대전 사는데 강릉 1박", T).start, null);
assert.equal(parseSpoken("대전에서 강릉 1박", T).start?.name, "대전복합터미널");
console.log(`ok - 말로 한 요청 해석 ${cases.length}문장 (4개 언어) + 날짜·출발지 규칙`);
