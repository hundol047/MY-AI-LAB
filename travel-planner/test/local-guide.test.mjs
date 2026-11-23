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

// 걷기·무장애 질문: 내려받은 공식 자료(건물 편의시설·공중화장실·열린관광지·공식 누리집·무장애나눔길)도 출처와 함께 답한다
{
  const { PLACES } = await import('../public/data.js');
  const P = (id) => PLACES.find((p) => p.id === id);
  const t2 = { days: [{ items: [{ place: P('gyeongpo-beach'), start: 600, end: 660 }, { place: P('hajodae'), start: 700, end: 760 }] }] };
  const official = {
    fac: { 'gyeongpo-beach': { name: '경포해변중앙통로 공중화장실', items: ['장애인사용가능화장실', '주출입구 접근로'] } },
    toilets: { 'gyeongpo-beach': [{ name: '경포해변중앙통로', acc: true, addr: '강릉시 창해로 514' }] },
    open: { 'gyeongpo-beach': { title: '강릉 경포해변' } },
    web: { hajodae: [{ k: '접근로', text: '데크길을 따라 가보면 계단길이 나오는데', url: 'https://tour.yangyang.go.kr/' }] },
    trailNear: (p) => (p.id === 'hajodae' ? { tr: { name: '시험 무장애나눔길', len: 500 } } : null),
  };
  const ko = guideLocal('경포해변 장애인 화장실 있어?', t2, 0, { input: { region: 'gangneung' }, opts: {}, forceLang: 'ko', official }).answer;
  assert.match(ko, /열린관광지/); assert.match(ko, /건물 편의시설\(사회보장정보원, 경포해변중앙통로 공중화장실\)/); assert.match(ko, /장애인용 변기: 경포해변중앙통로/);
  const hj = guideLocal('하조대 계단 있어?', t2, 0, { input: { region: 'gangneung' }, opts: {}, forceLang: 'ko', official }).answer;
  assert.match(hj, /공식 누리집: 데크길을 따라 가보면 계단길이 나오는데/); assert.match(hj, /근처 무장애나눔길: 시험 무장애나눔길/);
  // 자료가 없으면 지어내지 않는다
  const none = guideLocal('하조대 계단 있어?', t2, 0, { input: { region: 'gangneung' }, opts: {}, forceLang: 'ko' }).answer;
  assert.doesNotMatch(none, /공식 누리집|열린관광지|건물 편의시설|무장애나눔길/);
  console.log('ok - 무장애 질문에 공식 공공데이터·누리집 자료를 출처와 함께 답함');
}
