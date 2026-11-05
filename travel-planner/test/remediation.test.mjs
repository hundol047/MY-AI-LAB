import {SERVICE_TEXT} from '../public/service-translations.js';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {planTrip,addPlacesToDay,verify} from '../public/planner.js';
import {guideLocal} from '../public/ai-local.js';
import {bookingLinks,bookingScope,recommendBooking} from '../public/booking-links.js';
import {createServices} from '../services.mjs';
import {maintain} from '../maintenance.mjs';
const input={region:'gangneung',date:'2026-11-07',days:3,who:'couple',likes:['sea','food'],move:'car'},opts={};
const trip=planTrip(input,opts),r=guideLocal('2일차에 카페 하나 더 넣어줘',trip,0,{input,opts});
assert.equal(r.targetDay,1);const next=addPlacesToDay(trip,input,opts,r.targetDay,r.add);
assert.notEqual(next,trip);assert.ok(next.days[1].items.some(i=>r.add.includes(i.id)));assert.deepEqual(next.days[0],trip.days[0]);assert.deepEqual(next.days[2],trip.days[2]);assert.equal(verify(next.days),0);
assert.equal(addPlacesToDay(trip,input,opts,1,['nonexistent']),trip);
const people={adults:4,kids:2,rooms:2,ages:[4,8]},links=bookingLinks('Hotel',input,people,'ja'),u=new URL(links[0].url);
assert.equal(u.searchParams.get('no_rooms'),'2');assert.deepEqual(u.searchParams.getAll('age'),['4','8']);assert.equal(new URL(links[1].url).searchParams.get('childages'),'4,8');
assert.deepEqual(new URL(bookingLinks('Hotel',input,{...people,ages:[null,8]})[0].url).searchParams.getAll('age'),[]);
assert.doesNotThrow(()=>bookingLinks('Hotel',{...input,date:'2026-99-99'},people));
const now=Date.now(),evidence={scope:bookingScope('Hotel',input,people),roomType:'Twin',sameTerms:true,checkedAt:now,offers:[{platform:'Booking.com',total:200000,refundable:true},{platform:'Agoda',total:150000,refundable:false}]};
assert.equal(recommendBooking('Hotel',input,people,'ja',evidence,now).primary.name,'Agoda');
assert.equal(recommendBooking('Hotel',input,people,'ja',{...evidence,refundableOnly:true},now).primary.name,'Booking.com');
assert.equal(recommendBooking('Hotel',input,people,'ja',evidence,now+86400001).compared,false);
assert.equal(recommendBooking('Hotel',{...input,days:4},people,'ja',evidence,now).compared,false);
assert.equal(recommendBooking('Other',input,people,'ja',evidence,now).compared,false);
const dir=await mkdtemp('/tmp/remediation-'),store=createServices(dir+'/db.sqlite');
const token='t'.repeat(48),recoveryKey='r'.repeat(48),body={kind:'tour',product:'Tour',date:'2099-01-01',people:2,name:'Test',contact:'test@example.com',consent:true,recoveryKey};
try {
 const b=store.create(body,'k'.repeat(48),token);assert.throws(()=>store.removeBooking(b.id,token),e=>e.status===409);
 assert.throws(()=>store.recover(b.id,'bad'),e=>e.status===404);
 const recovered=store.recover(b.id,recoveryKey);assert.throws(()=>store.get(b.id,token),e=>e.status===404);assert.equal(store.get(b.id,recovered.token).id,b.id);assert.throws(()=>store.recover(b.id,recoveryKey));
 store.cancel(b.id,recovered.token);assert.equal(store.removeBooking(b.id,recovered.token).deleted,true);assert.throws(()=>store.get(b.id,recovered.token));
 for(let i=0;i<205;i++)store.create(body,String(i).padStart(48,'0'),token);
 assert.equal(store.listBookings(200).length,5);assert.equal(store.listBookings(0).length,50);assert.notEqual(store.listBookings(0)[0].id,store.listBookings(50)[0].id);
 const shop={name:'Shop',region:'gangneung',address:'Address',phone:'01012345678',items:[{ko:'Menu',price:'1000'}]};const s=store.addShop(shop);
 assert.equal(store.shops().length,0);assert.equal(store.shops({admin:true}).length,1);assert.throws(()=>store.addShop(shop),e=>e.status===409);
 assert.throws(()=>store.moderateShop(s.id,{state:'published',verified:false}));store.moderateShop(s.id,{state:'published',verified:true});assert.equal(store.shops()[0].id,s.id);store.moderateShop(s.id,{state:'hidden'});assert.equal(store.shops().length,0);
 const old=store.listBookings()[0];store.cancel(old.id,token);
 assert.equal(store.purge(Date.now()+181*86400000).deleted,1);assert.equal(store.listBookings(0,200).length,200);
 await maintain(store,dir+'/backups');const files=await readdir(dir+'/backups');assert.equal(files.length,1);
 const restored=createServices(dir+'/backups/'+files[0]);assert.equal(restored.listBookings(200).length,4);restored.close();
 const directory=JSON.parse(await readFile(new URL('../public/directory.json',import.meta.url)));assert.ok(directory.places.length>200);assert.ok(directory.places.some(p=>p.plannerId));assert.ok(directory.places.some(p=>p.type==='32'));
 console.log('ok - 날짜 고정·요금 근거 비교·객실/아동·복구키 회전·삭제·보관기간·백업 복구·가게 승인·200건 이후 조회·탐색 목록');
} finally{store.close();await rm(dir,{recursive:true,force:true});}

const vars=s=>[...s.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort();
for(const [key,translations] of Object.entries(SERVICE_TEXT))for(const lang of ['en','ja','zh']){assert.ok(translations[lang]);assert.deepEqual(vars(key),vars(translations[lang]));}
console.log('ok - 보조 화면 번역 변수 및 3개 외국어 누락 검사');
