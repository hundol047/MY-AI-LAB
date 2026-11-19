// 반값여행 정산 도우미: 영수증 글자(OCR 결과)에서 날짜·가게·금액·결제수단·주소를 뽑고, 인정 여부를 따진다.
// 화면(claim.js)과 테스트(test/claim.test.mjs)가 같이 쓴다. 글자 읽기가 틀릴 수 있으므로 결과는 언제나 사람이 고칠 수 있는 초안이다.

const num = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;
// OCR이 자주 헷갈리는 글자 (O→0, l·I→1, ,→.) 를 숫자 자리에서만 고친다
const fixDigits = (s) => { let prev; do { prev = s; s = s.replace(/(?<=[\d,])[Oo](?=[\dOo,]|원|\b)/g, "0").replace(/(?<=\d)[lI|](?=\d)/g, "1"); } while (s !== prev); return s; };

export function parseAmount(text) {
  const lines = fixDigits(String(text || "")).split(/\n/);
  // 1) 합계·결제금액 같은 말이 있는 줄의 금액 (여러 개면 가장 큰 것: 합계 ≥ 부가세·과세 금액)
  const KEY = /(합\s*계|총\s*액|총\s*금\s*액|결\s*제\s*금\s*액|받\s*을\s*금\s*액|승\s*인\s*금\s*액|청\s*구\s*금\s*액|판\s*매\s*금\s*액|이용\s*금\s*액|TOTAL|Total)/;
  const money = /(\d{1,3}(?:[,.]\d{3})+|\d{4,7})\s*원?/g;
  const near = [];
  lines.forEach((l, i) => {
    if (!KEY.test(l) || /부\s*가\s*세|과\s*세|면\s*세|봉사료|할\s*인/.test(l)) return;
    const pick = [...l.matchAll(money)].map((m) => num(m[1]));
    if (!pick.length && lines[i + 1]) pick.push(...[...lines[i + 1].matchAll(money)].map((m) => num(m[1]))); // 금액이 다음 줄에
    near.push(...pick.filter((v) => v >= 500 && v <= 5000000));
  });
  if (near.length) return Math.max(...near);
  // 2) 없으면 "원"이 붙은 금액 중 가장 큰 것
  const won = [...fixDigits(String(text || "")).matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,7})\s*원/g)].map((m) => num(m[1])).filter((v) => v >= 500 && v <= 5000000);
  return won.length ? Math.max(...won) : null;
}

export function parseDate(text, year = new Date().getFullYear()) {
  const s = fixDigits(String(text || ""));
  let m = s.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!m) { const y = s.match(/(?<!\d)(\d{2})[.\-/](\d{2})[.\-/](\d{2})(?!\d)/); if (y) m = [y[0], "20" + y[1], y[2], y[3]]; }
  if (!m) { const md = s.match(/(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/); if (md) m = [md[0], String(year), md[1], md[2]]; }
  if (!m) return null;
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseTime(text) {
  const m = String(text || "").match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?!\d)/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

// 가게 이름: "가맹점명·상호·매장명" 줄, 없으면 위쪽 몇 줄 중 글자가 많은 줄
export function parseMerchant(text) {
  const lines = String(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:가\s*맹\s*점\s*명?|상\s*호\s*명?|매\s*장\s*명|업\s*소\s*명|가게)\s*[:：]?\s*(.+)/);
    if (m && m[1].replace(/[^가-힣A-Za-z]/g, "").length >= 2) return m[1].replace(/\s*(사업자|대표|TEL|전화).*$/i, "").trim().slice(0, 30);
    if (m && lines[i + 1]) return lines[i + 1].slice(0, 30);
  }
  const top = lines.slice(0, 5).filter((l) => !/영수증|receipt|카드|매출|전표|고객용|가맹점용|사업자|\d{3}-\d{2}-\d{5}/i.test(l) && /[가-힣]{2,}/.test(l));
  return top[0]?.slice(0, 30) || "";
}

export function parseAddress(text) {
  const lines = String(text || "").split(/\n/).map((l) => l.trim());
  return lines.find((l) => /(강원|평창군|영월군|횡성군|[가-힣]+(시|군)\s)/.test(l) && /(읍|면|동|로|길|리)\s*\d|(읍|면)\s/.test(l))?.replace(/^(주\s*소|소재지)\s*[:：]?\s*/, "").slice(0, 60) || "";
}

// 결제수단: 반값여행은 대개 카드·현금영수증·모바일 지역사랑상품권만 인정하고 간이영수증·계좌이체는 인정하지 않는다
export function parsePayment(text) {
  const s = String(text || "");
  if (/간\s*이\s*영\s*수\s*증/.test(s)) return "simple";
  if (/(지역\s*사랑|상품권|지역\s*화폐|강원\s*상품권|평창\s*사랑|영월\s*사랑|횡성\s*사랑|chak|착|모바일\s*상품권)/i.test(s)) return "local";
  if (/현\s*금\s*영\s*수\s*증|현\s*금\s*\(\s*소\s*득\s*공\s*제/.test(s)) return "cashReceipt";
  if (/(신\s*용|체\s*크|카\s*드|승\s*인\s*번\s*호|할\s*부|일\s*시\s*불|VISA|MASTER|BC|KB|신한|삼성|현대|롯데|하나|우리|NH|농협)/i.test(s)) return "card";
  if (/계\s*좌\s*이\s*체|무\s*통\s*장/.test(s)) return "transfer";
  return "unknown";
}
export const PAYMENT_LABEL = { card: "카드", cashReceipt: "현금영수증", local: "지역사랑상품권", simple: "간이영수증", transfer: "계좌이체", unknown: "확인 필요" };

export function parseCategory(text, merchant = "") {
  const s = `${merchant}\n${text || ""}`;
  if (/호텔|모텔|펜션|리조트|콘도|게스트\s*하우스|숙박|민박|스테이|객실|체크\s*인/.test(s)) return "lodging";
  if (/카페|커피|coffee|아메리카노|라떼|베이커리|빵/i.test(s)) return "cafe";
  if (/입장|매표|관람|체험|이용권|케이블카|레일바이크|루지|리프트|티켓|천문대|박물관|미술관|동굴/.test(s)) return "sight";
  if (/식당|막국수|한우|정식|탕|찌개|국밥|구이|횟집|순두부|송어|곤드레|메밀|공기밥|음료|주류|소주|맥주/.test(s)) return "food";
  if (/주유|휘발유|경유|충전/.test(s)) return "fuel";
  return "etc";
}
export const CATEGORY_LABEL = { lodging: "숙박", food: "식당", cafe: "카페", sight: "관광지·체험", fuel: "주유", etc: "기타" };

export function parseReceipt(text, year) {
  const merchant = parseMerchant(text);
  return { merchant, date: parseDate(text, year), time: parseTime(text), amount: parseAmount(text), payment: parsePayment(text), address: parseAddress(text), category: parseCategory(text, merchant) };
}

// 인정 여부: 여행 기간 안, 대상 시군 주소(읽힌 경우), 인정 결제수단
// rules: { town, from, to, payments: ["card","cashReceipt","local"] }
export function checkReceipt(r, rules) {
  const why = [];
  if (!r.amount) why.push("금액을 확인하세요");
  if (!r.date) why.push("날짜를 확인하세요");
  else if (rules.from && (r.date < rules.from || r.date > rules.to)) why.push("여행 기간 밖의 결제");
  if (r.address && rules.town && !r.address.includes(rules.town)) why.push(`${rules.town} 밖의 가게일 수 있어요`);
  if (!r.address) why.push(`${rules.town || "대상 시군"} 안의 가게인지 확인하세요`);
  if (r.payment === "unknown") why.push("결제수단을 확인하세요");
  else if (!rules.payments.includes(r.payment)) why.push(`${PAYMENT_LABEL[r.payment]}은 인정되지 않을 수 있어요`);
  if (r.category === "fuel") why.push("주유비는 대상이 아닌 경우가 많아요");
  const hard = why.some((w) => /기간 밖|밖의 가게|인정되지|주유/.test(w));
  return { ok: !why.length, hard, why };
}

// 환급 예상: 인정 금액의 rate(50%), 1명 cap.one·2명 이상 cap.group, 단위(unit)로 내림, 최소 소비(min) 미만이면 0
export function refundOf(total, { people = 1, rate = 0.5, caps = { one: 100000, group: 200000 }, unit = 1000, min = 0 } = {}) {
  if (!total || total < min) return 0;
  const cap = people >= 2 ? caps.group : caps.one;
  return Math.floor(Math.min(cap, total * rate) / unit) * unit;
}

// 사진 위치 → 가장 가까운 대상 장소 (1.5km 안)
export function nearestPlace(pt, places, maxKm = 1.5) {
  if (!pt || !Number.isFinite(pt.lat)) return null;
  let best = null, bd = Infinity;
  for (const p of places) {
    const d = km(pt, p);
    if (d < bd) { bd = d; best = p; }
  }
  return best && bd <= maxKm ? { place: best, km: Math.round(bd * 100) / 100 } : null;
}
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * R;
}

// 제출용 파일 이름: 01_영수증_2026-11-21_식당이름_32000원.jpg
export function fileNameFor(kind, idx, { date, merchant, amount, place } = {}, ext = "jpg") {
  const safe = (s) => String(s || "").replace(/[\\/:*?"<>|\s]+/g, "").slice(0, 20);
  const parts = [String(idx).padStart(2, "0"), kind, date || "날짜확인", safe(merchant || place) || "이름확인"];
  if (amount) parts.push(`${amount}원`);
  return parts.join("_") + "." + ext;
}

// 같은 영수증을 두 번 올린 것으로 보이는 것: 같은 날짜·같은 금액이고 가게 이름이 같거나(공백 무시) 한쪽이 비어 있음
// 반려 사유 1순위라 미리 알려 준다. 돌려주는 값: 겹치는 영수증 묶음들(각 묶음은 받은 배열의 번호)
export function duplicateReceipts(list) {
  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const groups = [], used = new Set();
  list.forEach((a, i) => {
    if (used.has(i) || !a?.date || !a?.amount) return;
    const g = [i];
    list.forEach((b, j) => {
      if (j <= i || used.has(j) || b?.date !== a.date || b?.amount !== a.amount) return;
      const ma = norm(a.merchant), mb = norm(b.merchant);
      if (!ma || !mb || ma === mb) g.push(j);
    });
    if (g.length > 1) { g.forEach((k) => used.add(k)); groups.push(g); }
  });
  return groups;
}
// 정산 기한: 여행 마지막 날 + N일. today는 "YYYY-MM-DD" (한국 날짜)
export function deadlineOf(to, days, today) {
  if (!to) return null;
  const d = new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  const date = d.toISOString().slice(0, 10);
  const left = Math.round((d - new Date(today + "T00:00:00Z")) / 86400000);
  return { date, left, state: left < 0 ? "over" : left <= 2 ? "soon" : "ok" };
}
