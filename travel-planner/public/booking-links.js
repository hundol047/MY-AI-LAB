// Only confirmed user-entered offers are ranked. No live availability is implied.
// 제휴: 예약 수수료가 운영자에게 돌아온다. 비어 있으면 일반 검색 링크. 이용자가 내는 가격은 같다. 제휴 링크라는 사실은 숙소 칸에 표시한다(AFFILIATE.on)
// 두 가지 방식 중 받은 것을 넣는다 (docs/affiliate.md)
//  - 번호: Booking.com 직접 제휴의 aid, Agoda Partners의 cid (숫자) → 예약 주소 뒤에 붙인다
//  - 감싸는 링크: CJ·Awin·Travelpayouts 같은 제휴 대행사가 주는 딥링크 주소. 예약 주소가 들어갈 자리를 {url}로 둔다
//    예) "https://www.awin1.com/cread.php?awinmid=XXXX&awinaffid=YYYY&ued={url}"
import { AFFILIATE_CONFIG } from "./affiliate-config.js";
// 값은 affiliate-config.js에서 넣는다 (이 파일은 고치지 않아도 된다)
export const AFFILIATE = { booking: "", agoda: "", bookingWrap: "", agodaWrap: "", ...AFFILIATE_CONFIG };
const okWrap = (w) => typeof w === "string" && /^https:\/\/[^\s"'<>]+$/.test(w) && w.split("{url}").length === 2;
const wrap = (w, url) => (okWrap(w) ? w.replace("{url}", encodeURIComponent(url)) : url);
AFFILIATE.on = () => !!(/^\d{3,10}$/.test(AFFILIATE.booking) || /^\d{3,10}$/.test(AFFILIATE.agoda) || okWrap(AFFILIATE.bookingWrap) || okWrap(AFFILIATE.agodaWrap));
export function bookingPeople(people={}) {
  const integer=(n,lo,hi,fallback)=>Number.isInteger(Number(n))?Math.max(lo,Math.min(hi,Number(n))):fallback;
  const adults=integer(people.adults,1,30,1),kids=integer(people.kids,0,10,0),rooms=integer(people.rooms,1,adults,1);
  const ages=Array.from({length:kids},(_,i)=>{const n=people.ages?.[i];return n!==null&&n!==undefined&&n!==''&&Number.isInteger(Number(n))&&Number(n)>=0&&Number(n)<=17?Number(n):null;});
  return {adults,kids,rooms,ages};
}
export function bookingScope(query,input,people) {return JSON.stringify([query,input.date,input.days,bookingPeople(people)]);}
export function bookingLinks(query, input, people, lang = 'ko') {
  const validDate=/^\d{4}-\d{2}-\d{2}$/.test(input.date||'')&&Number.isFinite(Date.parse(input.date))&&new Date(input.date).toISOString().slice(0,10)===input.date;
  const dates=validDate&&Number.isInteger(input.days)&&input.days>1&&input.days<=30;
  const end=dates?new Date(`${input.date}T00:00:00Z`):null;if(end)end.setUTCDate(end.getUTCDate()+input.days-1);
  const checkout=end?.toISOString().slice(0,10),p=bookingPeople(people);
  const booking=new URL('https://www.booking.com/searchresults.html');
  booking.search=new URLSearchParams({ss:query,lang:({ko:'ko',en:'en-us',ja:'ja',zh:'zh-cn'})[lang]||'ko',group_adults:String(p.adults),group_children:String(p.kids),no_rooms:String(p.rooms),order:'price',...(dates?{checkin:input.date,checkout}:{}),...(/^\d{3,10}$/.test(AFFILIATE.booking)?{aid:AFFILIATE.booking}:{})});
  if(p.ages.every(a=>a!==null))for(const age of p.ages)booking.searchParams.append('age',String(age));
  const agoda=new URL('https://www.agoda.com/search');
  agoda.search=new URLSearchParams({textToSearch:query,adults:String(p.adults),children:String(p.kids),rooms:String(p.rooms),...(p.kids&&p.ages.every(a=>a!==null)?{childages:p.ages.join(',')} : {}),...(dates?{checkIn:input.date,checkOut:checkout}:{}),...(/^\d{3,10}$/.test(AFFILIATE.agoda)?{cid:AFFILIATE.agoda}:{})});
  return [{name:'Booking.com',url:wrap(AFFILIATE.bookingWrap,booking.href),raw:booking.href},{name:'Agoda',url:wrap(AFFILIATE.agodaWrap,agoda.href),raw:agoda.href}];
}
export function recommendBooking(query,input,people,lang='ko',evidence=null,now=Date.now()) {
  const links=bookingLinks(query,input,people,lang),p=bookingPeople(people);
  const valid=evidence?.scope===bookingScope(query,input,people)&&evidence.sameTerms===true&&typeof evidence.roomType==='string'&&evidence.roomType.trim()&&now-evidence.checkedAt>=0&&now-evidence.checkedAt<86400000;
  const offers=valid?(evidence.offers||[]).filter(o=>links.some(l=>l.name===o.platform)&&Number.isSafeInteger(o.total)&&o.total>0&&(!evidence.refundableOnly||o.refundable===true)):[];
  const unique=new Set((evidence?.offers||[]).map(o=>o.platform));
  const comparable=valid&&unique.size===2&&(evidence.offers||[]).length===2&&evidence.offers.every(o=>links.some(l=>l.name===o.platform)&&Number.isSafeInteger(o.total)&&o.total>0);
  offers.sort((a,b)=>a.total-b.total);
  const primary=links.find(l=>comparable&&offers[0]?.platform===l.name)||links[0];
  return {primary,alternatives:links.filter(l=>l!==primary),compared:!!(comparable&&offers.length),
    reason:comparable&&offers.length?'동일 조건으로 입력한 총액과 취소 조건을 비교해 선택했어요.':comparable&&!offers.length?'입력한 요금 중 무료 취소 조건에 맞는 상품이 없습니다.':'실시간 요금 자료가 없어 플랫폼 우열을 판단하지 않았어요.',
    dates:(()=>{const q=new URL(primary.raw||primary.url).searchParams;return {checkin:q.get('checkin')||q.get('checkIn'),checkout:q.get('checkout')||q.get('checkOut')};})(),...p};
}
