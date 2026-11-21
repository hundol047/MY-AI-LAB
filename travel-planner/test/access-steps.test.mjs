// 무장애 원문의 계단 주의: 경포대처럼 접근로는 턱이 없어도 주출입구가 계단이면 '경사로·턱 없음'으로 보이지 않고 휠체어 일정에서 빠져야 한다
import assert from "node:assert/strict";
import { stepsOf } from "../public/access-steps.js";
import { PLACES } from "../public/data.js";
import { planTrip } from "../public/planner.js";

assert.equal(stepsOf({ 접근로: "출입구까지 턱이 없어 휠체어 접근 가능함" }), null, "계단 없음은 좋은 뜻");
assert.equal(stepsOf({ 접근로: "계단 없음, 경사로 있음" }), null);
assert.equal(stepsOf({ 출입구: "주출입구는 계단으로 이어져 휠체어 출입 어려움" }).block, true);
assert.equal(stepsOf({ 출입구: "주출입구는 계단이 있으나 보조출입구에는 경사로가 있음" }).block, false, "대체 길이 있으면 주의만");
assert.equal(stepsOf({ 접근로: "보타전, 관음전은 휠체어로 접근이 가능하나 대웅전은 계단만 있어 접근이 어려움" }).block, false, "일부 건물만 계단이면 주의만");
assert.equal(stepsOf({ 출입구: "내부의 대부분이 계단으로 구성되어있어 일부만 관람가능" }).block, true);
const gp = PLACES.find((p) => p.id === "gyeongpodae");
assert.ok(gp.access.stepsBlock && !gp.access.ramp && /계단/.test(gp.access.stepsWarn), "경포대: 계단 막힘, 경사로 표시 없음");
assert.ok(PLACES.find((p) => p.id === "naksansa").access.stepsWarn);
// 휠체어로 강릉 3박: 계단 막힘 장소가 하나도 들어가지 않는다
const blocked = new Set(PLACES.filter((p) => p.access?.stepsBlock).map((p) => p.id));
for (const date of ["2026-12-05", "2027-01-16", "2027-05-01"]) for (const region of ["gangneung", "chuncheon"]) {
  const trip = planTrip({ region, days: 4, date, who: "parents", move: "car", likes: ["culture", "nature"] }, { access: ["wheelchair"], lessWalk: true });
  for (const d of trip.days) for (const it of d.items) assert.ok(!blocked.has(it.id), `${region} ${date} 휠체어 일정에 ${it.id}`);
}
console.log(`ok - 무장애 원문 계단 주의 (${PLACES.filter((p) => p.access?.stepsWarn).length}곳 주의, ${blocked.size}곳 휠체어 일정 제외)`);

// 가이드가 걷기·무장애 질문에 앱 자료로 답한다 (공식/미확인 구분, 계단 주의, 지도 자료의 계단·화장실)
const { guideLocal } = await import("../public/ai-local.js");
const { readFileSync } = await import("node:fs");
const walkInfo = JSON.parse(readFileSync(new URL("../public/walk-info.json", import.meta.url), "utf8"));
const trip2 = planTrip({ region: "seorak", days: 2, date: "2026-12-05", who: "parents", move: "car", likes: ["culture"] }, {});
let r = guideLocal("낙산사 계단 있어?", trip2, 0, { input: { region: "seorak" }, walkInfo, lang: "ko" });
assert.equal(r.kind, "access"); assert.match(r.answer, /낙산사/); assert.match(r.answer, /공식 조사/); assert.match(r.answer, /대웅전은 계단/); assert.match(r.answer, /주변 400m 지도\(미확인\)/); assert.match(r.answer, /계단 2곳/);
r = guideLocal("경포대 휠체어로 갈 수 있어?", trip2, 0, { input: { region: "gangneung" }, walkInfo, lang: "ko" });
assert.match(r.answer, /주출입구는 계단/);
r = guideLocal("Are there toilets?", trip2, 0, { input: { region: "seorak" }, walkInfo, lang: "en" });
assert.equal(r.kind, "access"); assert.match(r.answer, /Day 1/); assert.match(r.answer, /unverified|No official/);
console.log("ok - 가이드 무장애 질문 (공식 조사·계단 주의·주변 지도 자료, 한국어·영어)");

// 실내 길 안내: 조사 글의 상태 읽기 (가능·주의·어려움·안내), 조사에 없는 칸은 만들지 않음, 순서
const { statusOf, indoorRoute } = await import("../public/access-steps.js");
assert.equal(statusOf("주출입구는 턱이 없어 휠체어 접근 가능함_무장애 편의시설"), "ok");
assert.equal(statusOf("장애인 화장실 있음(1층 안내데스크 왼쪽)"), "ok");
assert.equal(statusOf("장애인 전용주차장(5면)"), "ok");
assert.equal(statusOf("주출입구는 계단으로 이어져 휠체어 출입 어려움"), "no");
assert.equal(statusOf("장애인 주차장 없음"), "no");
assert.equal(statusOf("주출입구는 계단이 있으나 보조출입구에는 경사로가 있음"), "part");
assert.equal(statusOf("엘리베이터 있음(낮은 높이의 조작버튼이 없어 휠체어 이용자가 사용하기 불편함)"), "part");
assert.equal(statusOf("출입구까지 경사로가 설치되어 있음(가파름)"), "part");
assert.equal(statusOf("여닫이문"), "info");
assert.equal(statusOf("턱이 없음"), "ok"); assert.equal(statusOf("턱이 없음"), "ok", "두 번 불러도 같은 답");
const route = indoorRoute(PLACES.find((p) => p.id === "gyeongpodae").access.text);
assert.deepEqual(route.map((r) => r.key).filter((k) => ["접근로", "출입구"].includes(k)), ["접근로", "출입구"]);
assert.equal(route.find((r) => r.key === "출입구").status, "no");
assert.equal(route.some((r) => r.key === "엘리베이터"), false, "조사에 없는 칸은 만들지 않는다");
assert.deepEqual(indoorRoute({}), []);
assert.doesNotMatch(route[0].text, /무장애 편의시설/);
console.log("ok - 실내 길 안내 (조사 글 상태 읽기, 없는 칸은 만들지 않음)");
