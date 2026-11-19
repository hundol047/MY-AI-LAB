// 반값여행 정산 도우미: 영수증 글자에서 값 뽑기·인정 여부·환급 계산·사진 위치 맞추기
import assert from "node:assert/strict";
import { parseReceipt, checkReceipt, refundOf, nearestPlace, fileNameFor, parseAmount, parsePayment, duplicateReceipts, deadlineOf } from "../public/claim-parse.js";
import { PLACES, BENEFITS } from "../public/data.js";

const card = `[카드매출전표] 고객용
가맹점명: 봉평메밀꽃막국수
사업자번호 123-45-67890 대표 홍길동
주소: 강원특별자치도 평창군 봉평면 이효석길 12
거래일시 2026/11/21 12:41:05
메밀막국수 2 18,000
메밀전병 1 9,000
부가세 2,455
합계 27,000원
신용 승인번호 12345678 일시불`;
const r = parseReceipt(card, 2026);
assert.equal(r.merchant, "봉평메밀꽃막국수");
assert.equal(r.date, "2026-11-21");
assert.equal(r.time, "12:41");
assert.equal(r.amount, 27000, "합계 줄 금액 (부가세 줄 제외)");
assert.equal(r.payment, "card");
assert.equal(r.category, "food");
assert.match(r.address, /평창군 봉평면/);
const rules = { town: "평창", from: "2026-11-21", to: "2026-11-22", payments: ["card", "cashReceipt", "local"] };
assert.equal(checkReceipt(r, rules).ok, true);

// 지역사랑상품권 결제·숙박·금액이 다음 줄
const stay = `더 펜션 대관령
평창군 대관령면 올림픽로 7
26.11.21 15:02
객실 1박
결제금액
120,000
평창사랑상품권(chak) 결제`;
const s = parseReceipt(stay, 2026);
assert.equal(s.amount, 120000); assert.equal(s.date, "2026-11-21"); assert.equal(s.payment, "local"); assert.equal(s.category, "lodging");

// 간이영수증·다른 시군·기간 밖은 걸러야 한다
const bad = checkReceipt({ ...r, payment: "simple" }, rules);
assert.equal(bad.ok, false); assert.equal(bad.hard, true);
assert.equal(checkReceipt({ ...r, address: "강원 강릉시 경포로 1" }, rules).hard, true);
assert.equal(checkReceipt({ ...r, date: "2026-11-25" }, rules).hard, true);
assert.equal(parsePayment("현금영수증 (소득공제)"), "cashReceipt");
assert.equal(parseAmount("과세물품 9,091\n부가세 909\n총 액 10,000"), 10000);
assert.equal(parseAmount("TOTAL 3O,5OO원"), 30500, "OCR의 O를 0으로");

// 환급: 50%, 1명 10만·2명 20만, 단위 내림, 최소 소비
assert.equal(refundOf(147000, { people: 2 }), 73000);
assert.equal(refundOf(147000, { people: 2, unit: 5000 }), 70000);
assert.equal(refundOf(500000, { people: 1 }), 100000);
assert.equal(refundOf(500000, { people: 3 }), 200000);
assert.equal(refundOf(90000, { people: 1, min: 100000 }), 0);

// 사진 위치: 평창 대상 장소 1.5km 안
const hp = BENEFITS.find((b) => b.id === "b-halfprice");
const pcPlaces = hp.placesByTown["평창"].map((id) => PLACES.find((p) => p.id === id)).filter(Boolean);
const wol = PLACES.find((p) => p.id === "woljeongsa");
assert.equal(nearestPlace({ lat: wol.lat + 0.002, lng: wol.lng }, pcPlaces).place.id, "woljeongsa");
assert.equal(nearestPlace({ lat: 37.75, lng: 128.9 }, pcPlaces), null, "강릉 시내는 평창 대상 장소가 아님");
assert.equal(fileNameFor("영수증", 1, { date: "2026-11-21", merchant: "봉평 메밀/막국수", amount: 27000 }), "01_영수증_2026-11-21_봉평메밀막국수_27000원.jpg");
// 반려 방지: 같은 영수증 두 번, 정산 기한
assert.deepEqual(duplicateReceipts([
  { date: "2026-11-21", amount: 27000, merchant: "봉평메밀꽃 막국수" },
  { date: "2026-11-21", amount: 120000, merchant: "더 펜션" },
  { date: "2026-11-21", amount: 27000, merchant: "봉평메밀꽃막국수" },
  { date: "2026-11-22", amount: 27000, merchant: "봉평메밀꽃막국수" },
  { date: "2026-11-21", amount: 120000, merchant: "다른 가게" },
]), [[0, 2]]);
assert.deepEqual(duplicateReceipts([{ date: "2026-11-21", amount: 5000, merchant: "" }, { date: "2026-11-21", amount: 5000, merchant: "카페" }]), [[0, 1]]);
assert.equal(deadlineOf("2026-11-22", 10, "2026-11-25").state, "ok");
assert.equal(deadlineOf("2026-11-22", 10, "2026-11-25").date, "2026-12-02");
assert.equal(deadlineOf("2026-11-22", 10, "2026-12-01").state, "soon");
assert.equal(deadlineOf("2026-11-22", 10, "2026-12-02").left, 0);
assert.equal(deadlineOf("2026-11-22", 10, "2026-12-03").state, "over");
assert.equal(deadlineOf("", 10, "2026-12-03"), null);
console.log("ok - 반값여행 정산 도우미 (영수증 읽기·인정 여부·환급 계산·사진 위치·파일 이름)");

// 여행 경비 나누기: 가장 적은 송금으로 끝나게
import { settle } from "../public/split.js";
{
  const r = settle(["가", "나", "다"], [{ payer: "가", amount: 90000 }, { payer: "나", amount: 30000 }, { payer: "다", amount: 0 }]);
  assert.equal(r.total, 120000); assert.equal(r.perHead, 40000);
  assert.deepEqual(r.moves, [{ from: "다", to: "가", amount: 40000 }, { from: "나", to: "가", amount: 10000 }]);
  const r2 = settle(["가", "나"], [{ payer: "가", amount: 10000, for: ["나"] }]);
  assert.deepEqual(r2.moves, [{ from: "나", to: "가", amount: 10000 }], "나만 먹은 것");
  const r3 = settle(["가", "나", "다"], [{ payer: "가", amount: 10000 }]);
  assert.equal(r3.moves.reduce((a, m) => a + m.amount, 0), 6680, "3,333.3원씩 → 10원 단위로 올림");
  console.log("ok - 여행 경비 나누기 (최소 송금·일부만 나누기·10원 단위)");
}
