import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUsageStats } from "../usage-stats.mjs";
const dir = await mkdtemp(join(tmpdir(), "stats-"));
try {
  const s = createUsageStats(join(dir, "usage-stats.json"));
  await s.record("plan"); await s.record("plan"); await s.record("plan_region", "gangneung");
  await assert.rejects(s.record("unknown"), /알 수 없는/);
  await assert.rejects(s.record("plan_region", "서울 강남구 123"), /형식/);
  await assert.rejects(s.record("plan_region", "a".repeat(40)), /형식/);
  const sum = await s.summary(30);
  assert.equal(sum.total.plan, 2); assert.equal(sum.total["plan_region:gangneung"], 1);
  await new Promise((r) => setTimeout(r, 2300));
  const saved = JSON.parse(await readFile(join(dir, "usage-stats.json"), "utf8"));
  assert.equal(Object.values(saved)[0].plan, 2);
  console.log("ok - 사용 집계: 정해진 이벤트만, 값 형식 제한, 날짜별 저장");
} finally { await rm(dir, { recursive: true, force: true }); }
