export function receiptLink(receipt,label='접수증 저장') {
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:1,...receipt})],{type:'application/json'}));
  a.download=`booking-${receipt.id}.json`;a.textContent=label;
  a.addEventListener('click',()=>setTimeout(()=>URL.revokeObjectURL(a.href),60000),{once:true});return a;
}
export async function readReceipt(file) {
  if(!file || file.size>4096)throw Error('올바른 접수증 파일을 선택하세요.');
  const r=JSON.parse(await file.text());
  if(r.version!==1 || !/^[a-f0-9-]{36}$/.test(r.id)||!/^\w{32,100}$/.test(r.token))throw Error('올바른 접수증 파일을 선택하세요.');
  return r;
}
