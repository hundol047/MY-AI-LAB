import { api } from './service-ui.js';
const form = document.getElementById('booking'), status = document.getElementById('status');
const params = new URLSearchParams(location.search);
form.elements.product.value = (params.get('product') || '').slice(0,120);
if (params.get('kind') === 'tour') form.elements.kind.value = 'tour';
function toggle() { const lodging = form.elements.kind.value === 'lodging'; document.getElementById('endLabel').hidden = !lodging; form.elements.endDate.required = lodging; }
form.elements.kind.onchange = toggle; toggle();
let sending = false;
const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
let requestKey = randomKey(), lookupKey = randomKey();
form.addEventListener('input', () => { if (!sending) { requestKey=randomKey(); lookupKey=randomKey(); } });
form.onsubmit = async e => {
  e.preventDefault(); if (sending) return;
  const body = Object.fromEntries(new FormData(form)); body.people = Number(body.people); body.consent = form.elements.consent.checked;
  sending = true; const button = form.querySelector('button'); button.disabled = true; status.textContent = '접수 중…';
  try {
    const data = await api('api/bookings', {method:'POST',body,token:lookupKey,headers:{'idempotency-key':requestKey}});
    status.textContent = `접수번호: ${data.id} / 조회키: ${lookupKey}. 두 값을 보관하세요. 조회키를 아는 사람은 신청을 조회·취소할 수 있습니다.`;
    const link=document.createElement('a');link.href='booking-status.html';link.textContent='신청 상태 확인';status.after(link);
    form.hidden = true;
  } catch (err) { status.textContent = err.name === 'TimeoutError' ? '접수 결과를 확인하지 못했습니다. 중복 신청 전에 운영자에게 확인해 주세요.' : err.message; }
  finally { sending = false; button.disabled = false; }
};
