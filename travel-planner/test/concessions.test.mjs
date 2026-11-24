// 입장료 감면(65세 이상·장애인·보호자) 읽기와 일행 요금, 할인 입장권 링크
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseConcession, partyFee, concessionPrice } from "../public/concessions.js";
import { ticketLinks, AFFILIATE } from "../public/booking-links.js";
const fees = JSON.parse(await readFile(new URL("../public/fees.json", import.meta.url), "utf8"));
const F = fees.places || fees;
// 실제 관광공사 원문에서 읽은 값 (원문과 대조해 확인한 곳)
const expect = {
  parksookeun: { senior: { free: true }, disabled: { free: true, companion: true } },
  gossigul: { senior: { price: 1000 } },
  byeolmaro: { senior: { price: 3500 } },
  "hwaam-cave": { senior: { free: true }, proof: true },
  "yongyeon-cave": { senior: { free: true }, disabled: { free: true, companion: true, cond: true } },
  mureung: { senior: { price: 1500 }, disabled: { price: 1500 } },
  "cw-peace-observatory": { senior: { price: 2000 }, disabled: { pct: 50 } },
  cheongnyeongpo: { senior: { price: 1000 } },
  samyang: { senior: { price: 9000 }, disabled: { price: 9000, cond: true } },
};
for (const [id, want] of Object.entries(expect)) assert.deepEqual(parseConcession(F[id]?.text), want, id);
// "65세 미만"은 감면이 아니다, 무료 장소는 비운다, 단체 요금은 쓰지 않는다
assert.deepEqual(parseConcession("[입장료] - 어른(65세 미만) 3,000원"), {});
assert.deepEqual(parseConcession("입장료: 무료"), {});
assert.deepEqual(parseConcession("[단체(30인 이상)] - 경로 800원"), {});
// 읽은 곳 수가 갑자기 줄면(원문 형식 변경) 알 수 있게
const n = Object.values(F).filter((v) => { const c = parseConcession(v.text); return c.senior || c.disabled; }).length;
assert.ok(n >= 18, `감면 읽은 곳 ${n}`);

// 일행 요금: 장애인 → 보호자 1인 무료 → 65세 이상 → 나머지
const f = { adult: 6000, child: 3000, text: F.parksookeun.text };
assert.equal(partyFee(f, { adults: 3, kids: 1 }), 21000);
assert.equal(partyFee(f, { adults: 3, kids: 1, seniors: 2 }), 9000);
assert.equal(partyFee(f, { adults: 3, kids: 0, disabled: 1 }), 6000, "장애인·보호자 무료, 1명만 유료");
assert.equal(partyFee({ adult: 4000, child: 2000, text: F.gossigul.text }, { adults: 2, kids: 0, seniors: 2 }), 2000);
assert.equal(partyFee({ adult: 5000, child: 0, text: "" }, { adults: 2, kids: 0, seniors: 5 }), 10000, "감면 없는 곳은 그대로");
assert.equal(concessionPrice(4000, { pct: 50 }), 2000);

// 할인 입장권: 설정이 비면 네이버 검색, 넣으면 그 사이트(장소 이름이 {q}에), 이상한 값은 무시
const nav = ticketLinks("삼양목장");
assert.equal(nav.length, 1); assert.equal(new URL(nav[0].url).host, "search.naver.com"); assert.equal(nav[0].affiliate, false);
const saved = AFFILIATE.tickets;
AFFILIATE.tickets = [{ name: "클룩", url: "https://example-partner.test/search?query={q}&aid=1234" }, { name: "나쁨", url: "http://x.test/?q={q}" }, { name: "없음", url: "https://x.test/" }];
const l = ticketLinks("삼양목장");
assert.equal(l.length, 1); assert.equal(l[0].name, "클룩"); assert.equal(new URL(l[0].url).searchParams.get("query"), "삼양목장"); assert.equal(AFFILIATE.ticketsOn(), true);
AFFILIATE.tickets = saved;
const { AFFILIATE_CONFIG } = await import("../public/affiliate-config.js");
assert.ok(Array.isArray(AFFILIATE_CONFIG.tickets));
console.log(`ok - 입장료 감면 ${n}곳 읽기 · 일행 요금 · 할인 입장권 링크`);
// 환급 상품권: 감면으로 무료 입장한 사람은 받지 않는다 (소양강 스카이워크: 65세 이상 무료)
{
  const { freeAdults } = await import("../public/concessions.js");
  const sky = F["soyang-skywalk"];
  assert.equal(freeAdults(sky, { adults: 3, kids: 0, seniors: 2 }), 2);
  assert.equal(freeAdults(sky, { adults: 3, kids: 0 }), 0);
  assert.equal(freeAdults(F.gossigul, { adults: 2, seniors: 2 }), 0, "할인이지 무료는 아님");
}
console.log("ok - 감면 무료 입장자는 환급에서 빼기");
