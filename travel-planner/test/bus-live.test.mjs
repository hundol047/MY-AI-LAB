// 실시간 버스(서버): 입력 검사, TAGO 응답 정리, 20초 재사용, 요청 제한, 활용신청 전(403)·키 없음은 503, 키·원문을 돌려주지 않음
import assert from "node:assert/strict";
import { handleBusLive, validCity, validId, allow } from "../bus-live.mjs";

assert.ok(validCity("32010") && !validCity("3201") && !validCity("abcde"));
assert.ok(validId("CCB250012345") && validId("WJB251067005") && !validId("x;drop") && !validId(""));

const out = [];
const json = (res, status, body) => out.push({ status, body });
const req = (ip = "1.1.1.1") => ({ method: "GET", headers: {}, socket: { remoteAddress: ip } });
let calls = 0;
const ok = async (u) => {
  calls++;
  assert.ok(!String(u).includes("drop"), "검사 안 된 값이 TAGO로 가면 안 됨");
  return { ok: true, status: 200, json: async () => ({ response: { header: { resultCode: "00" }, body: { items: { item: [
    { routeno: 300, routeid: "CCB250000300", arrtime: 425, arrprevstationcnt: 3, routetp: "간선버스" },
    { routeno: 7, routeid: "CCB250000007", arrtime: 95, arrprevstationcnt: 1, routetp: "지선버스" },
  ] } } } }) };
};
const u = (q) => new URL(`http://x/api/bus/arrivals?${q}`);
assert.equal(await handleBusLive(req(), {}, u("city=32010&node=CCB250012345"), json, "K", ok), true);
assert.equal(out.at(-1).status, 200);
assert.deepEqual(out.at(-1).body.list.map((x) => `${x.no}:${x.min}:${x.stops}`), ["7:2:1", "300:7:3"], "도착 빠른 순, 분 단위");
await handleBusLive(req(), {}, u("city=32010&node=CCB250012345"), json, "K", ok);
assert.equal(calls, 1, "20초 안 같은 정류장은 다시 부르지 않음");
await handleBusLive(req(), {}, u("city=32010&node=x;drop"), json, "K", ok);
assert.equal(out.at(-1).status, 400);
// 활용신청 전: TAGO가 403 → 503, 키·원문은 내보내지 않음
const denied = async () => ({ ok: false, status: 403, json: async () => ({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } }) });
await handleBusLive(req("2.2.2.2"), {}, u("city=32020&node=WJB251067005"), json, "SECRET", denied);
assert.equal(out.at(-1).status, 503); assert.ok(!JSON.stringify(out.at(-1).body).includes("SECRET") && !JSON.stringify(out.at(-1).body).includes("REGISTERED"));
await handleBusLive(req(), {}, u("city=32010&node=CCB250012345"), json, "", ok);
assert.equal(out.at(-1).status, 503, "키 없음");
assert.equal(await handleBusLive(req(), {}, new URL("http://x/api/other"), json, "K", ok), false, "다른 주소는 넘김");
// 요청 제한: 1분 30번
const now = Date.now(); let n = 0; while (allow("9.9.9.9", now)) n++;
assert.equal(n, 30);
console.log("ok - 실시간 버스 서버 (입력 검사·도착 정리·20초 재사용·활용신청 전 503·요청 제한)");
