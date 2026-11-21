// 장소 3D 걷기 정보: 경사 등급(편의법 1/12·1/18), 산책로 경사 나누기, 고도 모름 구간, 중복 제거, 현장 표시 저장
import assert from "node:assert/strict";
import { gradeClass, slopeSegments, resample, dedupe, distM, loadPins, savePins, toiletsNear, lineLengthM } from "../public/view3d-data.js";

assert.equal(gradeClass(0.03), 0); assert.equal(gradeClass(1 / 18), 0);
assert.equal(gradeClass(0.07), 1); assert.equal(gradeClass(1 / 12), 1);
assert.equal(gradeClass(0.09), 2); assert.equal(gradeClass(0.3), 2);

// 동쪽으로 400m 곧은 길 (위도 37.8에서 경도 0.001° ≈ 87.9m)
const line = [[128.9, 37.8], [128.90455, 37.8]];
const len = lineLengthM(line);
assert.ok(len > 395 && len < 405, `길이 ${len}`);
const pts = resample(line, 20);
assert.ok(pts.length >= 20 && pts.length <= 22);
for (let i = 1; i < pts.length - 1; i++) assert.ok(Math.abs(distM(pts[i - 1], pts[i]) - 20) < 0.5, "20m 간격");

const x = (lng) => distM([128.9, 37.8], [lng, 37.8]); // 출발점에서 거리(m)
// 평지
let seg = slopeSegments(line, () => 10);
assert.deepEqual(seg.map((s) => s.g), [0]);
// 전체 10% 오르막 → 가파름
seg = slopeSegments(line, (lng) => x(lng) * 0.10);
assert.deepEqual(seg.map((s) => s.g), [2]);
// 내리막도 같은 등급 (내려가는 것도 위험)
seg = slopeSegments(line, (lng) => 100 - x(lng) * 0.07);
assert.deepEqual(seg.map((s) => s.g), [1]);
// 앞 200m 평지, 뒤 200m 12% 오르막 → 완만 … 가파름 순서, 조각이 이어져 있다
seg = slopeSegments(line, (lng) => Math.max(0, x(lng) - 200) * 0.12);
assert.equal(seg[0].g, 0); assert.equal(seg[seg.length - 1].g, 2);
for (let i = 1; i < seg.length; i++) assert.deepEqual(seg[i].coords[0], seg[i - 1].coords[seg[i - 1].coords.length - 1], "조각이 끊기지 않음");
assert.ok(lineLengthM(seg[0].coords) > 140 && lineLengthM(seg[0].coords) < 220, "평지 구간 길이");
// 고도를 못 읽으면 '완만'이라고 하지 않고 모름(-1)
seg = slopeSegments(line, () => null);
assert.deepEqual(seg.map((s) => s.g), [-1]);
seg = slopeSegments(line, (lng) => (x(lng) > 200 ? null : 5));
assert.ok(seg.some((s) => s.g === -1) && seg[0].g === 0);
assert.deepEqual(slopeSegments([[128.9, 37.8]], () => 0), []);

// 같은 계단이 지도 조각마다 잘려 나와도 하나로
const d = dedupe([{ at: [128.9, 37.8] }, { at: [128.90005, 37.8] }, { at: [128.901, 37.8] }]);
assert.equal(d.length, 2);

// 현장 표시: 모르는 종류·깨진 값은 버린다
const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
savePins([{ kind: "steps", lat: 37.8, lng: 128.9, date: "2026-11-21" }, { kind: "bogus", lat: 1, lng: 1 }, { kind: "toilet", lat: "x", lng: 1 }], storage);
assert.deepEqual(loadPins(storage).map((p) => p.kind), ["steps"]);
mem.set("v3d:pins", "{깨짐"); assert.deepEqual(loadPins(storage), []);

const T = { items: [{ name: "가", lat: 37.8, lng: 128.9 }, { name: "나", lat: 37.82, lng: 128.9 }] };
assert.deepEqual(toiletsNear(T, [128.9005, 37.8]).map((t) => t.name), ["가"]);
assert.deepEqual(toiletsNear(null, [128.9, 37.8]), []);
console.log("ok - 장소 3D 걷기 정보 (경사 등급 1/18·1/12, 경사 구간 나누기, 고도 모름은 모름으로, 중복 제거, 현장 표시)");

// 공식 화장실 자료 한 줄 읽기: 장애인용 변기 수가 있어야 '장애인 화장실', 칸이 없으면 모름, 강원 밖·좌표 없음은 버림
const { toToilet, nearPlaces } = await import("../scripts/bake-toilets.mjs");
const row = { toiletNm: "경포해변 화장실", rdnmadr: "강원특별자치도 강릉시 창해로 514", latitude: "37.8051", longitude: "128.9080", menHandicapToiletBowlNumber: "1", ladiesHandicapToiletBowlNumber: "0", openTime: "24시간", referenceDate: "2026-06-30" };
assert.deepEqual(toToilet(row), { name: "경포해변 화장실", lat: 37.8051, lng: 128.908, acc: true, open: "24시간", ref: "2026-06-30" });
assert.equal(toToilet({ ...row, menHandicapToiletBowlNumber: "0" }).acc, false);
const { menHandicapToiletBowlNumber, ladiesHandicapToiletBowlNumber, ...noAcc } = row;
assert.equal("acc" in toToilet(noAcc), false, "장애인용 칸 정보가 없으면 모름");
assert.equal(toToilet({ ...row, latitude: "", longitude: "" }), null);
assert.equal(toToilet({ ...row, rdnmadr: "서울특별시 중구", latitude: "37.56", longitude: "126.97" }), null);
assert.equal(toToilet({ ...row, toiletNm: " " }), null);
assert.equal(nearPlaces([toToilet(row)], [{ lat: 37.8055, lng: 128.9085 }]).length, 1);
assert.equal(nearPlaces([toToilet(row)], [{ lat: 37.75, lng: 128.9 }]).length, 0);
console.log("ok - 공식 화장실 자료 읽기 (장애인 화장실은 변기 수가 있을 때만, 모름은 모름으로)");
