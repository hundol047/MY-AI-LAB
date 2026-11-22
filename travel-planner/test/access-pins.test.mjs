// 3D 현장 확인 표시 공유: 약 11m 칸으로 묶기, 기기 번호는 돌려주지 않음, 같은 기기는 칸·종류당 한 번, 하루 30개, 범위 제한, 지우기
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServices } from "../services.mjs";
import { createPII } from "../pii.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "pins-"));
try {
  const s = createServices(path.join(dir, "a.sqlite"), { pii: createPII({ secret: "pins-test-secret-".repeat(3), quiet: true }) });
  const at = { lat: 38.12481, lng: 128.62731 };
  s.accessPin({ ...at, kind: "steps", voter: "deviceaaaa1" });
  s.accessPin({ lat: 38.12483, lng: 128.62734, kind: "steps", voter: "deviceaaaa1" }); // 같은 칸·같은 기기 → 한 번
  s.accessPin({ lat: 38.12484, lng: 128.62729, kind: "steps", voter: "devicebbbb2" });
  s.accessPin({ ...at, kind: "toilet", voter: "devicebbbb2" });
  const box = "128.62,38.12,128.63,38.13";
  const rows = s.accessPins(box);
  assert.deepEqual({ ...rows.find((r) => r.kind === "steps") }, { lat: 38.1248, lng: 128.6273, kind: "steps", n: 2 });
  assert.equal(JSON.stringify(rows).includes("device"), false, "기기 번호는 돌려주지 않음");
  s.accessPin({ ...at, kind: "steps", voter: "deviceaaaa1", on: false });
  assert.equal(s.accessPins(box).find((r) => r.kind === "steps").n, 1, "내 표시 지우기");
  assert.throws(() => s.accessPin({ ...at, kind: "bogus", voter: "deviceaaaa1" }), { status: 400 });
  assert.throws(() => s.accessPin({ lat: 35, lng: 129, kind: "steps", voter: "deviceaaaa1" }), { status: 400 }, "강원 밖");
  assert.throws(() => s.accessPins("127,37,128,38"), { status: 400 }, "너무 넓은 범위");
  for (let i = 0; i < 29; i++) s.accessPin({ lat: 37.8 + i * 0.001, lng: 128.9, kind: "ramp", voter: "devicecccc3" });
  s.accessPin({ lat: 37.9, lng: 128.9, kind: "ramp", voter: "devicecccc3" });
  assert.throws(() => s.accessPin({ lat: 37.95, lng: 128.9, kind: "ramp", voter: "devicecccc3" }), { status: 429 }, "하루 30개");
  console.log("ok - 3D 현장 확인 표시 공유 (약 11m 칸, 기기 번호 비공개, 중복·하루 30개·범위 제한, 지우기)");
} finally { rmSync(dir, { recursive: true, force: true }); }
