// AI 없이 답하는 가이드(무료 간단 모드): 지식 데이터가 앱 데이터와 맞는지, 대표 질문에 맞게 답하는지
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planTrip } from "../public/planner.js";
import { PLACES } from "../public/data.js";
import { guideLocal, startLocal } from "../public/ai-local.js";
import { NICKS, NICKS_EN, TIPS, TIPS_EN, THEMES, normalize } from "../public/knowledge.js";

const fees = JSON.parse(readFileSync(new URL("../public/fees.json", import.meta.url)));
const ids = new Set(PLACES.map((p) => p.id));
for (const id of [...Object.keys(NICKS), ...Object.keys(NICKS_EN), ...Object.keys(TIPS), ...Object.keys(TIPS_EN), ...Object.values(THEMES).flat()]) assert.ok(ids.has(id), `없는 장소 id: ${id}`);
for (const p of PLACES) assert.ok(TIPS[p.id] && TIPS_EN[p.id], `팁 없음: ${p.name}`);
for (const t of Object.values(TIPS)) assert.ok(!/\d{2,3}-\d{3,4}-\d{4}|\d,\d{3}원/.test(t), `팁에 전화번호·가격을 적지 않는다: ${t}`);

assert.equal(normalize("엄빠랑 뚜벅이"), "부모님랑대중교통");

const input = { region: "gangneung", date: "2026-11-07", days: 2, who: "couple", likes: ["sea", "food"], move: "car" };
const opts = { prefer: ["sea"], avoid: [] };
const trip = planTrip(input, opts);
const ask = (q, day = 0) => guideLocal(q, trip, day, { input, opts, fees });
const inTrip = new Set(trip.days.flatMap((d) => d.items.map((i) => i.id)));

let r = ask("오죽헌 얼마야?");
assert.match(r.answer, /오죽헌 어른 3,000원/);
assert.equal(r.changed, false);

r = ask("환선굴 넣어줘");
assert.deepEqual([r.changed, r.add], [true, ["hwanseon"]]);

const first = trip.days[0].items.find((i) => i.place.cat).place;
r = ask(`${first.name} 빼줘`);
assert.deepEqual([r.changed, r.remove], [true, [first.id]]);

r = ask("2일차에 바다 한 곳 더 넣어줘");
assert.equal(r.changed, true);
assert.equal(r.add.length, 1);
const added = PLACES.find((p) => p.id === r.add[0]);
assert.equal(added.cat, "sea");
assert.ok(!inTrip.has(added.id));

r = ask("카페 빼줘");
assert.equal(r.changed, true);
assert.ok(r.avoid.includes("cafe"));
assert.ok(r.prefer.includes("sea"), "기존 취향은 유지");

r = ask("오늘 운영시간 알려줘");
assert.match(r.answer, /운영시간이에요/);

r = ask("바다부채길 계단 많아?");
assert.match(r.answer, /계단/);
assert.equal(r.changed, false);

r = ask("툇마루 웨이팅 길어?");
assert.match(r.answer, /흑임자/);

r = ask("주차는?");
assert.match(r.answer, /주차 정보가 없어요/);

for (const q of ["비 오면 어떡해?", "아이랑 가도 괜찮을까?", "일출 보고 싶어", "아무말"]) {
  r = ask(q);
  assert.ok(r.answer && !/\(는\)|\(가\)|\(를\)/.test(r.answer), `${q} → ${r.answer}`);
}

const s = startLocal("토요일에 엄빠랑 뚜벅이로 강릉 1박, 맛집 위주", "2026-11-05");
assert.deepEqual([s.who, s.move, s.days, s.date], ["parents", "transit", 2, "2026-11-07"]);
// "닭갈비"의 "비"는 비가 아니다
r = ask("닭갈비 먹고 싶어");
assert.equal(r.changed, false);
assert.doesNotMatch(r.answer, /실내 위주/);
r = ask("비 오면 어떡해?");
assert.equal(r.indoor, "on");
// 영어 화면: 영어 질문을 알아듣고 영어로 답한다
const namesEn = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL("../public/data-en.json", import.meta.url)))).map(([k, v]) => [k, v.name]));
const askEn = (q) => guideLocal(q, trip, 0, { input, opts, fees, lang: "en", namesEn });
r = askEn("How much is Ojukheon?");
assert.match(r.answer, /adults ₩3,000/);
r = askEn("Add Hwanseon cave");
assert.deepEqual(r.add, ["hwanseon"]);
r = askEn("Is there a lot of walking at the sea trail?");
assert.match(r.answer, /Badabuchae-gil.*stairs/);
r = askEn("Add one more beach on day 2");
assert.equal(PLACES.find((p) => p.id === r.add[0]).cat, "sea");
r = askEn("No cafes please");
assert.ok(r.avoid.includes("cafe"));
r = askEn("What if it rains?");
assert.equal(r.indoor, "on");
for (const q of ["비 오면 어떡해?", "아이랑 가도 괜찮을까?", "오늘 운영시간 알려줘", "Parking?", "blah"]) {
  r = askEn(q);
  assert.doesNotMatch(r.answer, /[가-힣]/, `영어 화면인데 한국어 답: ${q} → ${r.answer}`);
}
console.log("ok - 무료 간단 모드 가이드");
