// 공식 관광정보를 탐색 목록으로 동기화. 운영시간 원문은 보존하며 추측해 일정에 넣지 않는다.
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { tour } from './tour-api.mjs';
if (!process.env.TOUR_API_KEY) throw new Error('TOUR_API_KEY가 필요합니다. 기존 데이터는 변경하지 않았습니다.');
const places = new Map();
for (const type of ['12', '14', '28', '32', '38', '39']) {
  let complete = false;
  for (let page = 1; page <= 100; page++) {
    const rows = await tour('KorService2', 'areaBasedList2', { lDongRegnCd: '51', contentTypeId: type, numOfRows: '100', pageNo: String(page), arrange: 'C' });
    for (const p of rows) {
      if (!p.contentid || !p.title || !(Number(p.mapy) > 0 && Number(p.mapx) > 0)) continue;
      places.set(String(p.contentid), { id: String(p.contentid), type, name: p.title, address: p.addr1 || '', lat: Number(p.mapy), lng: Number(p.mapx), sourceModified: p.modifiedtime || null });
    }
    if (rows.length < 100) { complete = true; break; }
  }
  if (!complete) throw new Error('페이지 한도 초과: 불완전한 목록으로 교체하지 않습니다.');
}
if (!places.size) throw new Error('빈 응답: 기존 목록을 유지합니다.');
const fields = { '12': ['usetime', 'restdate'], '14': ['usetimeculture', 'restdateculture'], '28': ['usetimeleports', 'restdateleports'], '32': ['checkintime', 'checkouttime'], '38': ['opentime', 'restdateshopping'], '39': ['opentimefood', 'restdatefood'] };
for (const p of places.values()) {
  const [intro] = await tour('KorService2', 'detailIntro2', { contentId: p.id, contentTypeId: p.type });
  if (!intro) throw new Error(`상세 응답 없음: ${p.id}. 기존 목록 유지`);
  const [hours, closed] = fields[p.type];
  p.hours = String(intro[hours] || '');
  p.closed = String(intro[closed] || '');

}
const file = new URL('../public/directory.json', import.meta.url);
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/directory.json.tmp', import.meta.url), JSON.stringify({ fetchedAt: new Date().toISOString(), source: '한국관광공사 TourAPI KorService2', places: [...places.values()] }, null, 2) + '\n');
await rename(new URL('../public/directory.json.tmp', import.meta.url), file);
console.log(`공식 장소 ${places.size}개와 운영정보 저장 완료`);
