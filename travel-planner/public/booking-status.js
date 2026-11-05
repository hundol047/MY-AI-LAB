import {getLang} from './i18n.js';
import {serviceT} from './service-i18n.js';
import {receiptLink,readReceipt} from './receipt.js';
import {api,el,labels} from './service-ui.js';
const form=document.getElementById('lookup'),detail=document.getElementById('detail'),msg=document.getElementById('message');
let current=null,timer=null,version='',generation=0;
let pushConfig=null;api('api/push-config').then(c=>pushConfig=c).catch(()=>{});
function draw(b) {
 detail.replaceChildren(el('h2',b.request.product,{className:'user-content'}),el('p',`상태: ${labels[b.status]}`),el('p',`${b.request.date}${b.request.endDate?' ~ '+b.request.endDate:''} · ${b.request.people}명`));
 if(b.supplierReference) detail.append(el('p',`업체 확인번호: ${b.supplierReference}`));
 const list=el('ol');for(const h of b.history)list.append(el('li',`${new Date(h.at).toLocaleString('ko-KR')} · ${labels[h.status]} · ${h.message}`));detail.append(list);
 if(b.quote) detail.append(el('h3',`견적 ${b.quote.amount.toLocaleString()}원`),el('p',b.quote.description,{className:'user-content'}));
 detail.append(el('p','결제 준비 중입니다. 현재 앱에서 결제되거나 카드 정보가 수집되지 않습니다.'));
 if(['cancelled','rejected'].includes(b.status)){const del=el('button','신청 개인정보 삭제');del.onclick=async()=>{if(!confirm(serviceT('삭제하면 복구할 수 없습니다. 삭제할까요?')))return;try{await api(`api/bookings/${current.id}`,{method:'DELETE',token:current.token});clearInterval(timer);current=null;generation++;detail.replaceChildren();msg.textContent='삭제했습니다.';}catch(e){msg.textContent=e.message;}};detail.append(del);}
 if(!['cancelled','rejected','cancel_requested'].includes(b.status)) {
 const button=el('button',b.status==='confirmed'?'예약 취소 확인 요청':'신청 철회');
 button.onclick=async()=>{if(!confirm(serviceT('신청 취소를 요청하시겠습니까?')))return;button.disabled=true;try{draw(await api(`api/bookings/${encodeURIComponent(current.id)}/cancel`,{method:'POST',token:current.token}));msg.textContent='처리 결과를 확인하세요.';}catch(e){msg.textContent=e.message;button.disabled=false;}};detail.append(button);
 }
}
async function lookup() {
 clearInterval(timer);const g=++generation;detail.replaceChildren();msg.textContent='조회 중…';current=Object.fromEntries(new FormData(form));
 const credentials={...current};
 try{const b=await api(`api/bookings/${encodeURIComponent(credentials.id)}`,{token:credentials.token});if(g!==generation)return;draw(b);version=JSON.stringify([b.history,b.quote]);msg.textContent='30초마다 상태를 확인합니다.';
 let busy=false;timer=setInterval(async()=>{if(busy)return;busy=true;try{const next=await api(`api/bookings/${encodeURIComponent(credentials.id)}`,{token:credentials.token});if(g!==generation)return;const v=JSON.stringify([next.history,next.quote]);if(v!==version){version=v;draw(next);msg.textContent='신청 상태가 변경되었습니다.';}}catch(e){if(g===generation)msg.textContent=e.message;}finally{busy=false;}},30000);
 }catch(e){if(g===generation)msg.textContent=e.message;}
}
form.onsubmit=e=>{e.preventDefault();lookup();};
document.getElementById('receipt').onchange=async e=>{try{const r=await readReceipt(e.target.files[0]);form.elements.id.value=r.id;form.elements.token.value=r.token;document.getElementById('recover').elements.id.value=r.id;document.getElementById('recover').elements.recoveryKey.value=r.recoveryKey||'';await lookup();}catch(e){msg.textContent=e.message;}};
document.getElementById('recover').onsubmit=async e=>{e.preventDefault();try{const b=Object.fromEntries(new FormData(e.target));const r=await api(`api/bookings/${encodeURIComponent(b.id)}/recover`,{method:'POST',body:{recoveryKey:b.recoveryKey}});form.elements.id.value=r.id;form.elements.token.value=r.token;e.target.reset();msg.after(receiptLink(r));await lookup();msg.textContent='조회키와 복구코드를 재발급했습니다. 새 접수증을 저장하세요.';}catch(e){msg.textContent=e.message;}};
document.getElementById('notify').onclick=async()=>{
 if(!current || !detail.querySelector('h2')){msg.textContent='먼저 신청을 조회하세요.';return;}
 if(!globalThis.Notification || !('serviceWorker' in navigator) || !('PushManager' in window) || !window.isSecureContext){msg.textContent='이 브라우저는 웹 푸시를 지원하지 않습니다. 지원 브라우저 또는 홈 화면에 설치한 웹앱을 이용하세요.';return;}
 if(!pushConfig?.enabled){msg.textContent='웹 푸시 서버 설정이 필요합니다.';return;}
 const credentials={...current};
 try{
  const permission=await Notification.requestPermission();if(permission!=='granted'){msg.textContent='알림 권한이 없습니다. 화면에서 확인하세요.';return;}
  await navigator.serviceWorker.register('sw.js');
  const reg=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('웹 푸시 연결을 완료하지 못했습니다. 다시 시도하세요.')),15000))]);
  const bytes=Uint8Array.from(atob(pushConfig.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  let subscription=await reg.pushManager.getSubscription();
  if(subscription?.options.applicationServerKey && Array.from(new Uint8Array(subscription.options.applicationServerKey)).join(',')!==Array.from(bytes).join(',')){await subscription.unsubscribe();subscription=null;}
  subscription ||= await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  await api(`api/bookings/${encodeURIComponent(credentials.id)}/push`,{method:'POST',token:credentials.token,body:{subscription:subscription.toJSON(),lang:getLang()}});
  msg.textContent='웹 푸시를 등록했습니다. 브라우저가 닫혀 있어도 상태 변경 알림을 보냅니다. 기기 설정에 따라 전달이 제한될 수 있습니다.';
 }catch{msg.textContent='웹 푸시 연결을 완료하지 못했습니다. 다시 시도하세요.';}
};
document.getElementById('unnotify').onclick=async()=>{
 if(!current || !detail.querySelector('h2')){msg.textContent='먼저 신청을 조회하세요.';return;}
 try{const reg=await navigator.serviceWorker?.getRegistration();const sub=await reg?.pushManager?.getSubscription();if(sub)await api(`api/bookings/${encodeURIComponent(current.id)}/push`,{method:'DELETE',token:current.token,body:{endpoint:sub.endpoint}});msg.textContent='이 신청의 웹 푸시 알림을 해제했습니다.';}catch(e){msg.textContent=e.message;}
};
window.addEventListener('pagehide',()=>clearInterval(timer));
