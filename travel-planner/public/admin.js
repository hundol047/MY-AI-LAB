import {api,el,labels} from './service-ui.js';
let offset=0;let token='';const $=id=>document.getElementById(id), msg=$('message');
const call=(path,body)=>api(path,{token,...(body?{method:'POST',body}:{})});
async function action(path,body,button){button.disabled=true;try{await call(path,body);await load();msg.textContent='저장했습니다.';}catch(e){msg.textContent=e.message;button.disabled=false;}}
async function load(){
 const [bookings,reviews,reports,shops,push]=await Promise.all([call(`api/admin/bookings?offset=${offset}`),call(`api/admin/reviews?offset=${offset}`),call(`api/admin/reports?offset=${offset}`),call(`api/admin/shops?offset=${offset}`),call("api/admin/push")]);
 for(const id of ['bookings','reviews','reports','shops'])$(id).replaceChildren();
 $('pushStatus').textContent=`웹 푸시 ${push.enabled?'켜짐':'설정 필요'} · 구독 ${push.subscriptions} · 대기 ${push.pending} · 실패 ${push.failed}`;
 $('previous').disabled=offset===0;$('next').disabled=Math.max(bookings.length,reviews.length,reports.length,shops.length)<50;$('page').textContent=String(offset/50+1);
 for(const shop of shops){const c=el('article',undefined,{className:'card'});c.append(el('h3',`${shop.name} · ${shop.state}`),el('p',`${shop.address} · ${shop.phone}`),el('p',shop.items.map(i=>`${i.ko} ${i.price}`).join(' / ')));const verified=el('input',undefined,{type:'checkbox'}),label=el('label','업체 연락처와 메뉴를 직접 확인했습니다.');label.prepend(verified);c.append(label);for(const [state,text] of [['published','승인'],['hidden','숨김'],['rejected','거절']]){const button=el('button',text);button.onclick=()=>action(`api/admin/shops/${shop.id}`,{state,verified:verified.checked},button);c.append(button);}$('shops').append(c);}
 for(const b of bookings){
 const c=el('article',undefined,{className:'card'});c.append(el('h3',b.request.product),el('p',`${b.id} · ${labels[b.status]}`),el('p',`${b.request.name} · ${b.request.contact} · ${b.request.date} · ${b.request.people}명`));
 const form=el('form'),select=el('select');const next={received:['reviewing','rejected','cancelled'],reviewing:['confirmed','rejected','cancelled'],confirmed:['cancel_requested'],cancel_requested:['cancelled','confirmed']}[b.status]||[];
 for(const s of next)select.append(el('option',labels[s],{value:s}));
 const ref=el('input',undefined,{placeholder:'업체에서 확인한 예약번호 (확정 시 필수)',maxLength:120});const note=el('input',undefined,{placeholder:'신청자에게 표시할 안내',maxLength:500});const save=el('button','상태 변경');
 form.append(select,ref,note,save);form.onsubmit=e=>{e.preventDefault();action(`api/admin/bookings/${b.id}/status`,{status:select.value,reference:ref.value,message:note.value},save);};if(next.length)c.append(form);
 if(['reviewing','confirmed'].includes(b.status)){const q=el('form'),amount=el('input',undefined,{type:'number',min:'1',max:'100000000',required:true,placeholder:'견적 금액 (원)'}),desc=el('input',undefined,{required:true,maxLength:500,placeholder:'포함 내역·취소 조건'}),button=el('button','견적 등록');q.append(amount,desc,button);q.onsubmit=e=>{e.preventDefault();action(`api/admin/bookings/${b.id}/quote`,{amount:Number(amount.value),description:desc.value},button);};c.append(q);}
 $('bookings').append(c);
 }
 for(const r of reviews){const c=el('article',undefined,{className:'card'});c.append(el('h3',`${r.nickname} · ${r.rating}점 · ${r.state}`),el('p',`장소 ${r.place} · 후기 ${r.id}`),el('p',r.text));for(const [state,label] of [['published','공개'],['hidden','숨김']]){const b=el('button',label);b.onclick=()=>action(`api/admin/reviews/${r.id}`,{state},b);c.append(b);}$('reviews').append(c);}
 for(const r of reports)$('reports').append(el('p',`${r.review} · ${r.reason} · ${r.createdAt}`));
 msg.textContent='최근 항목을 불러왔습니다.';
}
$('login').onsubmit=async e=>{e.preventDefault();offset=0;token=e.target.elements.token.value;try{await load();e.target.elements.token.value='';}catch(e){msg.textContent=e.message;}};
$('logout').onclick=()=>{token='';$('pushStatus').textContent='';$('login').reset();for(const id of ['bookings','reviews','reports','shops'])$(id).replaceChildren();msg.textContent='로그아웃했습니다.';};

$('previous').onclick=()=>{offset=Math.max(0,offset-50);load().catch(e=>msg.textContent=e.message);};
$('next').onclick=()=>{offset+=50;load().catch(e=>msg.textContent=e.message);};
