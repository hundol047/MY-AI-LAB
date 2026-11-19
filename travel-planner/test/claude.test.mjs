// Claude AI(선택 기능) 시험: 실제 API는 부르지 않는다
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { maskPII, sanitize, allowIp, aiRoutes, SCHEMA } from "../claude.mjs";
import { parseSpoken, mergeHint } from "../public/voice-parse.js";

// 1) 보내기 전에 개인정보를 가린다 (금액·날짜·시각은 남긴다)
const m = maskPII("홍길동 010-1234-5678 카드 1234-5678-9012-3456 승인번호 12345678 주민 900101-1234567 a@b.com 27,000원 2026-11-21 12:41");
for (const bad of ["010-1234-5678", "1234-5678-9012-3456", "12345678", "900101-1234567", "a@b.com"]) assert.ok(!m.includes(bad), bad);
for (const keep of ["27,000원", "2026-11-21", "12:41"]) assert.ok(m.includes(keep), keep);

// 2) 응답 검사: 허용된 값만, 말 안 한 것은 빼고, 지난 날짜·이상한 값은 버린다
const today = "2026-11-19";
assert.deepEqual(sanitize({ region: "gangneung", route: [], date: "2026-11-28", days: 2, who: "parents", move: "car", likes: ["sea"], avoid: ["cafe"], access: ["walker"], adults: 3, kids: 0, pace: "relaxed", lessWalk: false, startTime: "09:30", note: "계단 싫어함" }, today),
  { region: "gangneung", date: "2026-11-28", days: 2, who: "parents", move: "car", likes: ["sea"], avoid: ["cafe"], access: ["walker"], people: { adults: 3, kids: 0 }, pace: "relaxed", lessWalk: true, startTime: "09:30", note: "계단 싫어함" });
assert.deepEqual(sanitize({ region: "jeju", route: ["seoul"], date: "2025-01-01", days: 9, who: "boss", move: "plane", likes: ["x"], avoid: [], access: ["fly"], adults: 99, kids: -1, pace: "", lessWalk: false, startTime: "25:00", note: "" }, today), {});
assert.deepEqual(sanitize({ region: "", route: ["chuncheon", "seorak", "gangneung"], days: 2 }, today), { region: "chuncheon", route: ["chuncheon", "seorak"], days: 2 });
assert.deepEqual(sanitize("not json", today), {});
assert.equal(SCHEMA.additionalProperties, false);

// 3) 기기 안 해석 위에 덮기: AI가 말한 것만 바뀐다
const local = parseSpoken("다음 주 토요일 엄마랑 강릉 1박", today);
const merged = mergeHint(local, { access: ["walker"], avoid: ["cafe"], note: "점심은 앉아서 오래" });
assert.equal(merged.input.region, local.input.region);
assert.equal(merged.input.date, local.input.date);
assert.deepEqual(merged.access, ["walker"]);
assert.equal(merged.lessWalk, true);
assert.ok(!merged.input.likes.includes("cafe"));
assert.ok(merged.heard.some((h) => h.key === "note"));
assert.ok(merged.heard.some((h) => h.key === "access" && h.ko === "walker"));
assert.equal(mergeHint(local, null), local);
const moved = mergeHint(parseSpoken("춘천 갔다가 속초 2박", today), { region: "gangneung" });
assert.equal(moved.input.region, "gangneung"); assert.equal(moved.input.route, undefined);

// 4) IP당 하루 한도
process.env.AI_DAILY_PER_IP = "2";
assert.ok(allowIp("1.1.1.1")); assert.ok(allowIp("1.1.1.1")); assert.ok(!allowIp("1.1.1.1")); assert.ok(allowIp("2.2.2.2"));

// 5) 키가 없으면 꺼져 있고, 화면은 기기 안 해석으로 진행한다
delete process.env.ANTHROPIC_API_KEY;
const handle = aiRoutes({ dataDir: await mkdtemp(`${tmpdir()}/ai-test-`) });
const call = async (method, p, body) => {
  let out = null;
  const res = { writeHead: (code) => ({ end: (s) => (out = { code, body: JSON.parse(s) }) }) };
  const json = (r, code, obj) => r.writeHead(code).end(JSON.stringify(obj));
  const req = { method, headers: { host: "x" }, socket: { remoteAddress: "9.9.9.9" }, async *[Symbol.asyncIterator]() { if (body) yield JSON.stringify(body); } };
  const hit = await handle(req, res, new URL(p, "http://x"), json);
  return hit ? out : null;
};
assert.deepEqual(await call("GET", "/api/ai/status"), { code: 200, body: { enabled: false } });
assert.deepEqual(await call("POST", "/api/ai/understand", { text: "강릉 1박" }), { code: 503, body: { error: "AI_OFF" } });
assert.equal(await call("GET", "/api/bus/arrivals"), null);
console.log("ok - Claude 준비 (개인정보 가리기·응답 검사·기기 해석과 합치기·하루 한도·키 없으면 꺼짐)");
