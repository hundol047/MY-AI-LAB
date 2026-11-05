import assert from 'node:assert/strict';
import {guideLocal,startLocal} from '../public/ai-local.js';
import {planTrip} from '../public/planner.js';
import {GUIDE_TOPICS} from '../public/guide-topics.js';
const input={region:'gangneung',date:'2026-11-07',days:2,who:'couple',likes:['sea','food'],move:'car'};
const trip=planTrip(input,{}),ctx={input,opts:{},forceLang:'ko'};
for(const [q,kind] of [['준비물 뭐 챙길까','packing'],['환불 어떻게 해','booking'],['강아지 동반 가능해','pets'],['휠체어 갈 수 있어','walk'],['긴급 연락처','emergency'],['기온 알려줘','liveWeather']]) {
 for(const forceLang of ['ko','en','ja','zh']) {
  const r=guideLocal(q,trip,0,{...ctx,forceLang});assert.equal(r.kind,kind);assert.equal(r.changed,false);assert.equal(r.answer,GUIDE_TOPICS.find(t=>t.kind===kind).answers[forceLang]);
 }
}
assert.match(guideLocal('휠체어 갈 수 있어',trip,0,ctx).answer,/보장할 수는 없/);
assert.match(guideLocal('최저가 예약',trip,0,ctx).answer,/실시간 최저가나 빈방을 확인하지/);
const history=[{q:'갈 곳 추천해줘',a:'선교장, 오죽헌을 추천해요.'}];
assert.equal(guideLocal('두 번째 곳 넣어줘',trip,0,{...ctx,history}).kind,'add');
const h=guideLocal('거기는 몇 시까지?',trip,0,{...ctx,history});assert.equal(h.kind,'hours');assert.match(h.answer,/선교장/);assert.doesNotMatch(h.answer,/오죽헌/);
const add=guideLocal('첫 번째 곳 넣어줘',trip,0,{...ctx,history});if(add.changed)assert.deepEqual(add.add,['seongyojang']);
for(const q of ['주말에 부모님이랑 속초 1박','Sokcho with my parents this weekend, 1 night','週末に両親と束草へ1泊','周末和父母去束草住一晚']) {
 const r=startLocal(q,'2026-11-05');assert.equal(r.region,'seorak');assert.equal(r.days,2);assert.equal(r.who,'parents');assert.equal(r.date,'2026-11-07');
}
console.log('ok - 무료 지식 6개 주제 × 4개 언어·앞선 장소 참조·다국어 한 줄 시작');
