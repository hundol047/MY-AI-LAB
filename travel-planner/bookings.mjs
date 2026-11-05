import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
export function validateBooking(b, today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0,10)) {
  if (!b || !['lodging','tour'].includes(b.kind)) throw new Error('숙소 또는 투어를 선택하세요.');
  const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
  if (!text(b.product,120) || !text(b.name,60) || !text(b.contact,120)) throw new Error('상품명, 신청자 이름과 연락처를 확인하세요.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.contact) && !/^\+?[0-9 ()-]{8,25}$/.test(b.contact)) throw new Error('이메일 또는 전화번호를 입력하세요.');
  const date = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
  if (!date(b.date) || b.date < today || (b.kind === 'lodging' && (!date(b.endDate) || b.endDate <= b.date))) throw new Error('이용 날짜를 확인하세요.');
  if (!Number.isInteger(b.people) || b.people < 1 || b.people > 30 || b.consent !== true) throw new Error('인원과 개인정보 수집 동의를 확인하세요.');
  return { kind:b.kind, product:b.product.trim(), name:b.name.trim(), contact:b.contact.trim(), date:b.date, endDate:b.kind === 'lodging' ? b.endDate : null, people:b.people, consent:true };
}
export async function receiveBooking(body, directory) {
  const booking = { ...validateBooking(body), id:randomUUID(), status:'received', createdAt:new Date().toISOString() };
  await mkdir(directory, {recursive:true,mode:0o700});
  await writeFile(new URL(`${booking.id}.json`, directory), JSON.stringify(booking), {flag:'wx',mode:0o600});
  return {id:booking.id,status:booking.status,createdAt:booking.createdAt};
}
