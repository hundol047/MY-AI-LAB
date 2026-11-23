// 기상특보 받기: 기상청이 한 번 빈 응답을 줘도 다시 받아 성공해야 한다 (2026-11-22 갱신 실패)
import test from "node:test";
import assert from "node:assert/strict";
import { fetchWarnings } from "../scripts/kma-warnings.mjs";

const good = { response: { header: { resultCode: "00" }, body: { items: { item: [{ tmEf: "202611220600", tmFc: "202611220500", t6: "", t7: "" }] } } } };
const reply = (v) => ({ json: async () => { if (v === "bad") throw new Error("not json"); return v; } });
test("빈 응답·연결 실패 뒤에 다시 받아 성공한다", async () => {
  const seq = ["bad", null, {}, good]; let n = 0; const real = globalThis.fetch;
  globalThis.fetch = async () => { const v = seq[n++]; if (v === null) throw new Error("net"); return reply(v); };
  try { const w = await fetchWarnings("k", { wait: 1 }); assert.equal(n, 4); assert.equal(w.effective, "202611220600"); } finally { globalThis.fetch = real; }
});
test("끝까지 안 되면 이유와 함께 실패한다", async () => {
  const real = globalThis.fetch; globalThis.fetch = async () => reply({ response: { header: { resultCode: "22" } } });
  try { await assert.rejects(fetchWarnings("k", { wait: 1 }), /응답 코드 22/); } finally { globalThis.fetch = real; }
});
