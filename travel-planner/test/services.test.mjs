import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServices} from '../services.mjs';
const dir=await mkdtemp(`${tmpdir()}/service-test-`), file=dir+'/app.sqlite';let s=createServices(file);
const token='t'.repeat(48),key='k'.repeat(48),body={kind:'tour',product:'Tour',date:'2099-01-01',people:2,name:'Test',contact:'test@example.com',consent:true};
try{
 assert.throws(()=>s.create({...body,people:0},key,token));
 const b=s.create(body,key,token);assert.equal(s.create(body,key,token).id,b.id);assert.equal(s.listBookings().length,1);
 assert.throws(()=>s.create({...body,people:3},key,token),e=>e.status===409);
 assert.throws(()=>s.get(b.id,'wrong'),e=>e.status===404);
 assert.throws(()=>s.update(b.id,{status:'confirmed',reference:'abc'}),e=>e.status===409);
 s.update(b.id,{status:'reviewing'});
 assert.throws(()=>s.quote(b.id,{amount:-1,description:'x'}));
 s.quote(b.id,{amount:10000,description:'투어 2명'});
 assert.throws(()=>s.update(b.id,{status:'confirmed'}));
 s.update(b.id,{status:'confirmed',reference:'supplier-123'});
 assert.equal(s.cancel(b.id,token).status,'cancel_requested');
 s.update(b.id,{status:'cancelled'});assert.equal(s.cancel(b.id,token).status,'cancelled');
 assert.throws(()=>s.update(b.id,{status:'confirmed',reference:'abc'}));
 const r=s.addReview({place:'ojukheon',nickname:'Traveler',rating:4,text:'직접 방문한 경험을 적은 후기입니다.'});assert.equal(s.reviews('ojukheon').length,0);
 s.moderate(r.id,'published');assert.equal(s.reviews('ojukheon').length,1);s.report(r.id,'잘못된 내용입니다');assert.equal(s.reports().length,1);
 s.moderate(r.id,'hidden');assert.equal(s.reviews('ojukheon').length,0);
 s.close();s=createServices(file);assert.equal(s.get(b.id,token).status,'cancelled');assert.equal(s.get(b.id,token).quote.amount,10000);
 console.log('ok - 조회 권한·중복 접수·상태 전이·견적·취소·후기 검토·신고·재시작 보존');
}finally{s.close();await rm(dir,{recursive:true,force:true});}
