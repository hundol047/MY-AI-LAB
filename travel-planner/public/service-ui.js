export const labels={received:'접수',reviewing:'확인 중',confirmed:'업체 예약 확인 완료',rejected:'거절',cancel_requested:'취소 확인 중',cancelled:'취소 완료'};
export async function api(path,{method='GET',body,token,headers={}}={}) {
 const r=await fetch(path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`} : {}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),cache:'no-store'});
 let d;try{d=await r.json();}catch{throw new Error('서버에 연결할 수 없습니다. 서버로 실행한 앱에서 이용하세요.');}
 if(!r.ok) throw new Error(d.error||'요청에 실패했습니다.');return d;
}
export function el(tag,text,attrs={}) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;Object.assign(e,attrs);return e;}
