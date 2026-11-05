import webpush from 'web-push';
import {readFile,mkdir,writeFile,chmod} from 'node:fs/promises';
import path from 'node:path';
export function validateSubscription(subscription) {
  const fail=()=>{throw Object.assign(new Error('올바른 푸시 구독 정보가 필요합니다.'),{status:400});};
  if(!subscription || typeof subscription.endpoint!=='string' || subscription.endpoint.length>2048)fail();
  let url;try{url=new URL(subscription.endpoint);}catch{fail();}
  const host=url.hostname;
  const trusted=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com';
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!trusted||url.pathname==='/')fail();
  const keys=subscription.keys;
  if(!keys || !/^[\w-]+$/.test(keys.p256dh||'') || !/^[\w-]+$/.test(keys.auth||'') || Buffer.from(keys.p256dh,'base64url').length!==65 || Buffer.from(keys.p256dh,'base64url')[0]!==4 || Buffer.from(keys.auth,'base64url').length!==16)fail();
  return {endpoint:url.href,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
export async function createPushSender({keyFile,appURL,send=webpush.sendNotification}={}) {
  let url;try{url=new URL(appURL);}catch{return null;}
  if(url.protocol!=='https:' || url.username || url.password || url.hostname==='localhost' || url.hostname==='127.0.0.1')return null;
  let keys;
  await mkdir(path.dirname(keyFile),{recursive:true,mode:0o700});
  try{keys=JSON.parse(await readFile(keyFile,'utf8'));}
  catch(e){if(e.code!=='ENOENT')throw Error('푸시 키 파일을 읽을 수 없습니다.');keys=webpush.generateVAPIDKeys();try{await writeFile(keyFile,JSON.stringify(keys),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;keys=JSON.parse(await readFile(keyFile,'utf8'));}}
  await chmod(keyFile,0o600);
  webpush.setVapidDetails(url.origin,keys.publicKey,keys.privateKey);
  const messages={ko:['예약 상태 알림','신청 상태나 견적이 변경되었습니다. 조회 화면에서 확인하세요.'],en:['Booking update','Your request or quote changed. Open the status page to check.'],ja:['予約状況のお知らせ','申請状態または見積りが変わりました。照会画面でご確認ください。'],zh:['预订状态提醒','申请状态或报价已更改，请打开查询页面查看。']};
  return {publicKey:keys.publicKey,async send(subscription,lang){
    const [title,body]=messages[lang]||messages.ko;
    return send(validateSubscription(subscription),JSON.stringify({title,body,url:'booking-status.html'}),{TTL:86400,timeout:10000,vapidDetails:{subject:url.origin,publicKey:keys.publicKey,privateKey:keys.privateKey},...(process.env.HTTPS_PROXY?{proxy:process.env.HTTPS_PROXY}:{})});
  }};
}
export function startPushWorker(store,sender,{interval=15000}={}) {
  let busy=false,stopped=false;
  async function run(){if(busy||stopped)return;busy=true;try{
    for(const item of store.duePush()){
      try{await sender.send(JSON.parse(item.subscription),item.lang);store.completePush(item.id);}
      catch(e){store.failPush(item.id,Number(e.statusCode)||0);}
    }
  }finally{busy=false;}}
  const timer=setInterval(()=>run().catch(()=>console.error('푸시 처리 실패: 운영 상태를 확인하세요.')),interval);timer.unref();
  run().catch(()=>console.error('푸시 처리 실패: 운영 상태를 확인하세요.'));
  return {run,stop(){stopped=true;clearInterval(timer);}};
}
