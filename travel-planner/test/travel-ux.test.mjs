import assert from 'node:assert/strict';
import {bookingLinks,recommendBooking} from '../public/booking-links.js';
import {guideLocal} from '../public/ai-local.js';
import {planTrip,swapItem,verify} from '../public/planner.js';
import {PLACES} from '../public/data.js';
const input={region:'gangneung',date:'2026-11-07',days:2,who:'couple',likes:['sea','food'],move:'car'};
const trip=planTrip(input,{}),ctx={input,opts:{},forceLang:'ko'};
let r=guideLocal('바꿔줘',trip,0,ctx);assert.equal(r.changed,true);assert.ok(r.swap);
const changed=swapItem(trip,input,{},r.swap.dayIdx,r.swap.itemIdx);assert.notEqual(changed.days[0].items[0].id,trip.days[0].items[0].id);assert.equal(verify(changed.days),0);assert.deepEqual(changed.days[1],trip.days[1]);
r=guideLocal('그렇게 바꿔줘',trip,0,{...ctx,history:[{q:'계단 많아?',a:'덜 걷도록 조정할 수 있어요.'}]});assert.equal(r.lessWalk,'on');
r=guideLocal('바꾸지 마',trip,0,ctx);assert.equal(r.changed,false);
r=guideLocal('카페로 바꿔줘',trip,0,ctx);assert.equal(r.swap.cat,'cafe');
r=guideLocal('운영시간 알려줘',trip,0,{...ctx,forceLang:'ja'});assert.equal(r.lang,'ja');assert.match(r.answer,/営業時間/);
const candidates=PLACES.filter(p=>!trip.days.some(d=>d.items.some(i=>i.id===p.id))&&p.region===input.region);
let replacement;
for(const p of candidates){const result=swapItem(trip,input,{},0,1,p.id);if(result!==trip){replacement=result;assert.equal(result.days[0].items[1].id,p.id);assert.equal(result.days[0].items[0].id,trip.days[0].items[0].id);assert.equal(verify(result.days),0);break;}}
assert.ok(replacement);
for(const l of bookingLinks('A & B 호텔',input,{adults:3,kids:1},'ja')) {const url=new URL(l.url);assert.ok(['www.booking.com','www.agoda.com'].includes(url.host));assert.ok(url.searchParams.get('ss')||url.searchParams.get('textToSearch'));}
const u=new URL(bookingLinks('호텔',input,{adults:3,kids:1},'ja')[0].url);assert.equal(u.searchParams.get('checkin'),'2026-11-07');assert.equal(u.searchParams.get('checkout'),'2026-11-08');assert.equal(u.searchParams.get('group_adults'),'3');assert.equal(u.searchParams.get('lang'),'ja');
console.log('ok - 예약 플랫폼 조건 전달·짧은 변경·대화 맥락·변경 거부·언어 재표시·정확한 장소 교체');

for(const lang of ['ko','en','ja','zh']) {
 const choice=recommendBooking('숙소 & 호텔',input,{adults:3,kids:2},lang);
 const url=new URL(choice.primary.url);
 assert.equal(choice.primary.name,'Booking.com');assert.equal(url.searchParams.get('order'),'price');
 assert.equal(url.searchParams.get('ss'),'숙소 & 호텔');assert.equal(choice.kids,2);
 assert.equal(choice.dates.checkout,'2026-11-08');assert.equal(choice.alternatives[0].name,'Agoda');
}
console.log('ok - 가격순·언어 전달 기반 플랫폼 추천과 대안 보존');
