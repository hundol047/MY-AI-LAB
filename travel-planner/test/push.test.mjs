import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import webpush from 'web-push';
import {createPushSender,startPushWorker,validateSubscription} from '../web-push.mjs';
import {createServices} from '../services.mjs';
const dir=await mkdtemp('/tmp/push-test-'),token='t'.repeat(48),key='k'.repeat(48);
const clientKey=webpush.generateVAPIDKeys().publicKey;
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test-only-not-sent',keys:{p256dh:clientKey,auth:Buffer.alloc(16,1).toString('base64url')}};
let store=createServices(dir+'/db.sqlite'),worker;
try{
 for(const endpoint of ['http://fcm.googleapis.com/fcm/send/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.example/x','https://fcm.googleapis.com@evil.example/x','https://fcm.googleapis.com:444/x'])assert.throws(()=>validateSubscription({...subscription,endpoint}));
 assert.throws(()=>validateSubscription({...subscription,keys:{...subscription.keys,auth:'invalid'}}));
 assert.equal(await createPushSender({keyFile:dir+'/vapid.json'}),null);
 const sent=[];
 const sender=await createPushSender({keyFile:dir+'/vapid.json',appURL:'https://app.example.test',send:async(sub,payload,options)=>{sent.push({sub,payload:JSON.parse(payload),options});return {statusCode:201};}});
 const same=await createPushSender({keyFile:dir+'/vapid.json',appURL:'https://app.example.test',send:async()=>{}});assert.equal(same.publicKey,sender.publicKey);
 const b=store.create({kind:'tour',product:'private-product',date:'2099-01-01',people:2,name:'private-name',contact:'private@example.test',consent:true,recoveryKey:'r'.repeat(48)},key,token);
 assert.throws(()=>store.subscribePush(b.id,'bad',subscription,'ja'));
 store.subscribePush(b.id,token,subscription,'ja');store.update(b.id,{status:'reviewing'});assert.equal(store.pushStats().pending,1);
 const pending=store.duePush()[0];store.failPush(pending.id,500);assert.equal(store.duePush().length,0);assert.equal(store.duePush(Date.now()+61000).length,1);
 store.close();store=createServices(dir+'/db.sqlite');assert.equal(store.pushStats().pending,1);
 store.quote(b.id,{amount:20000,description:'private-quote'});assert.equal(store.pushStats().pending,1,'latest event coalesces previous queued event');
 worker=startPushWorker(store,sender,{interval:60000});await new Promise(r=>setTimeout(r,20));await worker.run();assert.equal(store.pushStats().pending,0);assert.equal(sent.length,1);assert.match(sent[0].payload.title,/予約/);
 assert.ok(!JSON.stringify(sent[0].payload).includes(b.id));assert.ok(!JSON.stringify(sent[0].payload).includes('private'));assert.ok(!JSON.stringify(sent[0].payload).includes(token));assert.equal(sent[0].options.TTL,86400);const wire=webpush.generateRequestDetails(sent[0].sub,JSON.stringify(sent[0].payload),sent[0].options);assert.ok(Buffer.isBuffer(wire.body));assert.equal(wire.headers['Content-Encoding'],'aes128gcm');worker.stop();
 store.quote(b.id,{amount:21000,description:'update'});const expired=store.duePush()[0];store.failPush(expired.id,410);assert.equal(store.pushStats().subscriptions,0);assert.equal(store.pushStats().pending,0);
 store.subscribePush(b.id,token,subscription);store.quote(b.id,{amount:22000,description:'update'});store.recover(b.id,'r'.repeat(48));assert.equal(store.pushStats().subscriptions,0);assert.equal(store.pushStats().pending,0);
 const text=await readFile(dir+'/vapid.json','utf8');assert.ok(JSON.parse(text).privateKey);
 console.log('ok - HTTPS 푸시 목적지 검증·키 유지·조회 인증·영속 큐·재시도·만료 제거·복구 시 해제·개인정보 없는 암호화 발송 경로 (발송 API 모의 검증)');
}finally{worker?.stop();store.close();await rm(dir,{recursive:true,force:true});}
// Service-worker notification handlers are exercised without contacting a push service.
const {runInNewContext}=await import('node:vm');
const handlers={},notifications=[],opened=[];
const self={registration:{scope:'https://app.example.test/travel/',showNotification:async(title,options)=>notifications.push({title,options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},addEventListener:(name,handler)=>handlers[name]=handler};
runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,console});
let finished;
handlers.push({data:{json:()=>({title:'Update',body:'Status changed',url:'https://untrusted.example'})},waitUntil:p=>finished=p});await finished;
assert.equal(notifications[0].options.tag,'booking-update');
handlers.notificationclick({notification:{close(){}},waitUntil:p=>finished=p});await finished;assert.equal(opened[0],'https://app.example.test/travel/booking-status.html');
console.log('ok - 서비스 워커 알림 표시·동일 출처 조회 화면 이동');
