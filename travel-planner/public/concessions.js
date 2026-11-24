// 입장료 감면 읽기: 한국관광공사 입장료 원문(fees.json의 text)에서 65세 이상·장애인(보호자) 무료·할인을 찾는다.
// 원문에 적힌 것만 읽는다. 애매하면 비워 둔다(지어내지 않는다).
// 돌려주는 값: { senior?: {free:true} | {price:n} | {pct:n}, disabled?: {free:true, companion?:bool} | {price:n} | {pct:n}, proof?:true }
const num = (s) => Number(String(s).replace(/,/g, ""));

// "※ 무료 : 6세 이하, 만 65세 이상, 장애인 및 보호자 1인" 같은 무료 대상 묶음
function freeParts(text) {
  const out = [];
  const re = /(?:무료\s*(?:입장|대상)?\s*[:：]|무료\s*[-–]\s*)([^※\[\]]{0,160})/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  // "만 65세 이상 무료", "장애인 무료" 처럼 뒤에 붙는 경우
  const tail = /([^※\[\]\n]{0,60}?)\s*(?:은|는)?\s*무료(?!\s*[:：-])/g;
  while ((m = tail.exec(text))) out.push(m[1]);
  return out;
}

// 요금 목록을 "- 항목" 단위로 나눈다. [단체] 칸의 항목은 뺀다
function priceItems(t) {
  const out = [];
  for (const part of t.split(/(?=\[[^\]]*\])/)) {
    if (/^\[[^\]]*단체/.test(part)) continue;
    for (const seg of part.replace(/^\[[^\]]*\]/, "").split(/-\s+|※/)) {
      const m = seg.match(/(\d{1,3}(?:,\d{3})+|\d{3,6})\s*원/);
      if (m && !/단체/.test(seg)) out.push({ seg, price: num(m[1]) });
    }
  }
  return out;
}
const SENIOR = /(?:만\s*)?6[05]\s*세\s*이상|경로(?!당)|어르신/;
const DISABLED = /장애/;
// 장애 정도에 따라 다른 경우(1~3급만, 중증만 등): 화면에 "조건 있음"으로 알린다
const COND = /등급|급\)|중증|경증|심한|정도/;

export function parseConcession(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  if (!t || /^입장료\s*[:：]?\s*무료\s*$/.test(t.trim())) return {};
  const r = {};
  const frees = freeParts(t), items = priceItems(t);
  const pct = (re) => { const m = t.match(new RegExp(re.source + "[^※\\[]{0,48}?(\\d{2})\\s*%\\s*(?:할인|감면)")); return m ? Number(m[1]) : null; };
  // 65세 이상
  if (frees.some((f) => SENIOR.test(f))) r.senior = { free: true };
  else {
    const it = items.find((x) => SENIOR.test(x.seg) && x.price > 0);
    if (it) r.senior = { price: it.price };
    else { const p = pct(SENIOR); if (p) r.senior = { pct: p }; }
  }
  // 장애인 (보호자)
  const dis = frees.find((f) => DISABLED.test(f));
  if (dis) r.disabled = { free: true, ...(/보호자|동반/.test(dis) ? { companion: true } : {}), ...(COND.test(dis) ? { cond: true } : {}) };
  else {
    const it = items.find((x) => DISABLED.test(x.seg) && x.price > 0);
    if (it) r.disabled = { price: it.price, ...(COND.test(it.seg) ? { cond: true } : {}) };
    else { const p = pct(DISABLED); if (p) r.disabled = { pct: p }; }
  }
  if ((r.senior || r.disabled) && /증빙|신분증|증명|등록증|복지카드|지참/.test(t)) r.proof = true;
  return r;
}

// 한 사람 요금: 어른 요금 기준으로 감면을 적용
export function concessionPrice(adult, c) {
  if (!c) return adult;
  if (c.free) return 0;
  if (Number.isFinite(c.price)) return Math.min(adult, c.price);
  if (Number.isFinite(c.pct)) return Math.round((adult * (100 - c.pct)) / 100 / 10) * 10;
  return adult;
}

// 일행 입장료: 장애인 → (보호자 1인 무료면) 보호자 → 65세 이상 → 나머지 어른 순서로 센다
export function partyFee(f, people, c = parseConcession(f?.text)) {
  if (!f) return 0;
  const adults = Math.max(0, people.adults || 0), kids = Math.max(0, people.kids || 0);
  let left = adults, sum = 0;
  const d = Math.min(Math.max(0, people.disabled || 0), left);
  sum += d * (c.disabled ? concessionPrice(f.adult, c.disabled) : f.adult); left -= d;
  if (c.disabled?.companion) left -= Math.min(d, left); // 보호자 1인 무료 (장애인 1명당 1명)
  const s = Math.min(Math.max(0, people.seniors || 0), left);
  sum += s * (c.senior ? concessionPrice(f.adult, c.senior) : f.adult); left -= s;
  return sum + left * f.adult + kids * (f.child || 0);
}

// 감면으로 입장료를 한 푼도 내지 않는 어른 수 (입장료 환급 상품권은 돈을 낸 사람만 받는다)
export function freeAdults(f, people, c = parseConcession(f?.text)) {
  if (!f) return 0;
  let left = Math.max(0, people.adults || 0), free = 0;
  const d = Math.min(Math.max(0, people.disabled || 0), left);
  if (c.disabled && concessionPrice(f.adult, c.disabled) === 0) free += d;
  left -= d;
  if (c.disabled?.companion) { const k = Math.min(d, left); free += k; left -= k; }
  const s = Math.min(Math.max(0, people.seniors || 0), left);
  if (c.senior && concessionPrice(f.adult, c.senior) === 0) free += s;
  return free;
}
