import {getLang,setLang} from './i18n.js';
import {SERVICE_TEXT} from './service-translations.js';
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const templates=Object.keys(SERVICE_TEXT).filter(k=>k.includes('{')).map(key=>{
 const vars=[];let at=0,pattern='';for(const m of key.matchAll(/\{(\w+)\}/g)){pattern+=escape(key.slice(at,m.index))+'(.+?)';vars.push(m[1]);at=m.index+m[0].length;}pattern+=escape(key.slice(at));return {key,vars,re:new RegExp('^'+pattern+'$')};
});
export function serviceT(text,depth=0) {
 text=String(text??'');const lang=getLang();if(lang==='ko'||depth>3)return text;
 if(SERVICE_TEXT[text]?.[lang])return SERVICE_TEXT[text][lang];
 for(const {key,vars,re} of templates){const m=text.match(re);if(m){const values=Object.fromEntries(vars.map((v,i)=>[v,serviceT(m[i+1],depth+1)]));return SERVICE_TEXT[key][lang].replace(/\{(\w+)\}/g,(_,k)=>values[k]);}}
 if(text.includes(' · '))return text.split(' · ').map(t=>serviceT(t,depth+1)).join(' · ');
 return text;
}
const memory=new WeakMap();let pending=false;
function update(node,key,value) {
 let map=memory.get(node);if(!map){map={};memory.set(node,map);}const last=map[key];const raw=last&&last.translated===value?last.raw:value;
 const trimmed=raw.trim(),translated=trimmed?raw.replace(trimmed,serviceT(trimmed)):raw;map[key]={raw,translated};return translated;
}
function render() {
 document.documentElement.lang=({zh:'zh-Hans'})[getLang()]||getLang();
 const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
 while(n=walk.nextNode()){
   if(n.parentElement?.closest('script,style,textarea,.user-content,[data-no-translate]'))continue;
   const text=update(n,'text',n.textContent);if(text!==n.textContent)n.textContent=text;
 }
 for(const el of document.querySelectorAll('[placeholder]')){const current=el.getAttribute('placeholder'),value=update(el,'placeholder',current);if(current!==value)el.setAttribute('placeholder',value);}
 document.title=update(document.querySelector('title'),'title',document.title);
}
const select=document.createElement('select');select.setAttribute('aria-label','Language');select.className='service-language';
for(const [value,text] of [['ko','한국어'],['en','English'],['ja','日本語'],['zh','中文']])select.add(new Option(text,value));select.value=getLang();
select.onchange=()=>{setLang(select.value);render();};document.querySelector('main')?.prepend(select);
new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;render();});}).observe(document.body,{subtree:true,childList:true,characterData:true});
render();
