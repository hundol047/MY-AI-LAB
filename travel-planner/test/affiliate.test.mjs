// 제휴 링크: 번호를 넣으면 Booking.com은 aid, Agoda는 cid가 붙고, 이상한 값은 무시한다. 비어 있으면 일반 링크
import assert from "node:assert/strict";
import { bookingLinks, AFFILIATE } from "../public/booking-links.js";
const input = { date: "2026-12-05", days: 2 }, people = { adults: 2 };
const get = () => Object.fromEntries(bookingLinks("강릉 호텔", input, people, "ko").map((l) => [l.name, new URL(l.url)]));
let u = get();
assert.equal(u["Booking.com"].searchParams.get("aid"), null);
assert.equal(u.Agoda.searchParams.get("cid"), null);
assert.equal(AFFILIATE.on(), false);
const saved = { ...AFFILIATE };
AFFILIATE.booking = "1234567"; AFFILIATE.agoda = "1891234";
u = get();
assert.equal(u["Booking.com"].searchParams.get("aid"), "1234567");
assert.equal(u.Agoda.searchParams.get("cid"), "1891234");
assert.equal(u.Agoda.searchParams.get("checkIn"), "2026-12-05");
assert.equal(AFFILIATE.on(), true);
AFFILIATE.booking = "abc<script>"; AFFILIATE.agoda = "12";
u = get();
assert.equal(u["Booking.com"].searchParams.get("aid"), null);
assert.equal(u.Agoda.searchParams.get("cid"), null);
Object.assign(AFFILIATE, saved);
console.log("ok - 제휴 링크 (번호 붙이기·이상한 값 무시·비어 있으면 일반 링크)");
// 제휴 대행사 딥링크(감싸는 링크): 예약 주소가 {url} 자리에 인코딩되어 들어간다. 이상한 값은 무시
{
  const { recommendBooking } = await import("../public/booking-links.js");
  AFFILIATE.bookingWrap = "https://www.awin1.com/cread.php?awinmid=1111&awinaffid=2222&ued={url}";
  const [b, a] = bookingLinks("강릉 호텔", input, people, "ko");
  const w = new URL(b.url);
  assert.equal(w.host, "www.awin1.com");
  assert.equal(new URL(w.searchParams.get("ued")).searchParams.get("checkin"), "2026-12-05");
  assert.equal(new URL(a.url).host, "www.agoda.com");
  assert.equal(AFFILIATE.on(), true);
  assert.equal(recommendBooking("강릉 호텔", input, people, "ko").dates.checkin, "2026-12-05", "감싸도 날짜 표시는 그대로");
  for (const bad of ["http://x.com/?u={url}", "https://x.com/?u=", "https://x.com/{url}{url}", "javascript:alert(1){url}"]) {
    AFFILIATE.bookingWrap = bad;
    assert.equal(new URL(bookingLinks("강릉 호텔", input, people, "ko")[0].url).host, "www.booking.com", bad);
  }
  Object.assign(AFFILIATE, saved);
}
console.log("ok - 제휴 대행사 딥링크 (주소 감싸기·날짜 유지·이상한 값 무시)");
