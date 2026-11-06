import {PLACES} from './data.js';
import {api,el} from './service-ui.js';
import {getLang,loadLang,placeName} from './i18n.js';
const $=id=>document.getElementById(id);let sequence=0;
// 장소 목록: 일정에 쓰는 장소만 (관광공사 탐색 목록 4,000여 곳을 다 넣으면 고르기 어렵다). 탐색 화면에서 넘어온 장소는 그 한 곳만 더한다
const chosen=new URLSearchParams(location.search).get('place');
const unique=new Map(PLACES.map(p=>[p.id,p]));
if(chosen&&!unique.has(chosen)){try{const r=await fetch('directory.json',{signal:AbortSignal.timeout(8000)});if(r.ok){const hit=(await r.json()).places.find(p=>String(p.id)===chosen);if(hit)unique.set(chosen,hit);}}catch{}}
// 외국어 화면에서는 번역 이름 + 한국어 원명 (간판·지도와 맞추도록)
function drawPlaces(){const keep=$('place').value||chosen;const lang=getLang();$('place').replaceChildren(...[...unique.values()].map(p=>{const n=PLACES.includes(p)?placeName(p):p.name;return el('option',lang==='ko'||n===p.name?p.name:`${n} (${p.name})`,{value:p.id});}));if(unique.has(keep))$('place').value=keep;}
drawPlaces();loadLang().then(drawPlaces).catch(()=>{});
// 화면 언어를 바꾸면 다시 그린다. 번역 스크립트가 같은 lang 값을 다시 써도 반응하지 않도록 실제로 바뀐 경우만 (서로 부르며 멈추지 않던 문제)
let shownLang=getLang();
new MutationObserver(()=>{if(getLang()===shownLang)return;shownLang=getLang();loadLang().then(drawPlaces).catch(()=>{});}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
async function load(){const n=++sequence;$('list').replaceChildren();$('summary').textContent='불러오는 중…';try{const rows=await api(`api/reviews?place=${encodeURIComponent($('place').value)}`);if(n!==sequence)return;$('summary').textContent=rows.length?`공개 후기 ${rows.length}개 · 평균 ${(rows.reduce((s,r)=>s+r.rating,0)/rows.length).toFixed(1)}점`:'아직 공개된 후기가 없습니다.';for(const r of rows){const c=el('article',undefined,{className:'card'});c.append(el('h3',`${r.nickname} · ${r.rating}점`),el('p',r.text,{className:'user-content'}),el('small',new Date(r.createdAt).toLocaleDateString('ko-KR')));const report=el('form'),reason=el('input',undefined,{required:true,minLength:3,maxLength:500,placeholder:'신고 사유 (3자 이상)'}),button=el('button','신고');report.append(reason,button);report.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await api(`api/reviews/${r.id}/report`,{method:'POST',body:{reason:reason.value}});$('message').textContent='신고가 접수됐습니다.';}catch(e){$('message').textContent=e.message;button.disabled=false;}};c.append(report);$('list').append(c);}}catch(e){if(n===sequence)$('summary').textContent=e.message;}}
$('place').onchange=load;load();
$('review').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;const b=Object.fromEntries(new FormData(e.target));b.place=$('place').value;b.rating=Number(b.rating);try{await api('api/reviews',{method:'POST',body:b});e.target.reset();$('message').textContent='후기를 접수했습니다. 운영자 검토 후 공개됩니다.';}catch(e){$('message').textContent=e.message;}finally{button.disabled=false;}};
