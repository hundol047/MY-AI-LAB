import {api,el,labels} from './service-ui.js';
const form=document.getElementById('lookup'),detail=document.getElementById('detail'),msg=document.getElementById('message');
let current=null;
function draw(b) {
 detail.replaceChildren(el('h2',b.request.product),el('p',`상태: ${labels[b.status]}`),el('p',`${b.request.date}${b.request.endDate?' ~ '+b.request.endDate:''} · ${b.request.people}명`));
 if(b.supplierReference) detail.append(el('p',`업체 확인번호: ${b.supplierReference}`));
 const list=el('ol');for(const h of b.history)list.append(el('li',`${new Date(h.at).toLocaleString('ko-KR')} · ${labels[h.status]} · ${h.message}`));detail.append(list);
 if(b.quote) detail.append(el('h3',`견적 ${b.quote.amount.toLocaleString()}원`),el('p',b.quote.description));
 detail.append(el('p','결제 준비 중입니다. 현재 앱에서 결제되거나 카드 정보가 수집되지 않습니다.'));
 if(!['cancelled','rejected','cancel_requested'].includes(b.status)) {
 const button=el('button',b.status==='confirmed'?'예약 취소 확인 요청':'신청 철회');
 button.onclick=async()=>{if(!confirm('신청 취소를 요청하시겠습니까?'))return;button.disabled=true;try{draw(await api(`api/bookings/${encodeURIComponent(current.id)}/cancel`,{method:'POST',token:current.token}));msg.textContent='처리 결과를 확인하세요.';}catch(e){msg.textContent=e.message;button.disabled=false;}};detail.append(button);
 }
}
form.onsubmit=async e=>{e.preventDefault();detail.replaceChildren();msg.textContent='조회 중…';current=Object.fromEntries(new FormData(form));try{draw(await api(`api/bookings/${encodeURIComponent(current.id)}`,{token:current.token}));msg.textContent='현재 처리 상태입니다. 새 소식은 다시 조회해 확인하세요.';}catch(e){msg.textContent=e.message;}};
