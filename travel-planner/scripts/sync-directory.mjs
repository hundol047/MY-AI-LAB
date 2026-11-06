// 공식 관광정보를 탐색 목록(public/directory.json)으로 동기화한다. 운영시간 원문은 보존하며 추측해 일정에 넣지 않는다.
// 실행: TOUR_API_KEY=Decoding키 node scripts/sync-directory.mjs   (한 번에 불러올 상세정보 수: DIRECTORY_MAX_DETAIL, 기본 500)
//
// 하루 호출 한도(개발 계정은 기능별로 하루 1,000건 안팎)를 넘지 않도록 나눠서 갱신한다.
// - 목록(areaBasedList2)은 매번 전부 받는다 (강원 6개 유형, 100건씩 약 15번).
// - 상세 운영정보(detailIntro2)는 새 장소와 관광공사 수정일(modifiedtime)이 바뀐 장소만 다시 부른다.
//   한 번에 DIRECTORY_MAX_DETAIL곳까지만 부르고, 남은 곳은 detailPending으로 표시해 다음 실행에서 이어 간다.
// - 한도 초과 응답(오류 코드 22)을 받으면 거기서 멈추고 그때까지 받은 것을 저장한다.
// - 앱이 직접 검토한 항목(관광공사 목록에 없는 id)은 그대로 둔다.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { tour } from './tour-api.mjs';

if (!process.env.TOUR_API_KEY) throw new Error('TOUR_API_KEY가 필요합니다. 기존 데이터는 변경하지 않았습니다.');
const MAX_DETAIL = Math.max(0, Number(process.env.DIRECTORY_MAX_DETAIL ?? 500) || 0);
const SOURCE = '한국관광공사 TourAPI KorService2';
const file = new URL('../public/directory.json', import.meta.url);

let current = {};
try { current = JSON.parse(await readFile(file, 'utf8')); } catch { current = {}; }
const previous = new Map((Array.isArray(current.places) ? current.places : []).map((p) => [String(p.id), p]));

// 1) 목록
const listed = new Map();
for (const type of ['12', '14', '28', '32', '38', '39']) {
  let complete = false;
  for (let page = 1; page <= 100; page++) {
    const rows = await tour('KorService2', 'areaBasedList2', { lDongRegnCd: '51', contentTypeId: type, numOfRows: '100', pageNo: String(page), arrange: 'C' });
    for (const p of rows) {
      if (!p.contentid || !p.title || !(Number(p.mapy) > 0 && Number(p.mapx) > 0)) continue;
      listed.set(String(p.contentid), { id: String(p.contentid), type, name: p.title, address: p.addr1 || '', lat: Number(p.mapy), lng: Number(p.mapx), sourceModified: p.modifiedtime || null });
    }
    if (rows.length < 100) { complete = true; break; }
  }
  if (!complete) throw new Error('페이지 한도 초과: 불완전한 목록으로 교체하지 않습니다.');
}
if (!listed.size) throw new Error('빈 응답: 기존 목록을 유지합니다.');

// 2) 상세 운영정보: 이전 값을 다시 쓸 수 있는 곳은 그대로, 새로 받을 곳은 새 장소 → 수정된 장소 순
const fields = { '12': ['usetime', 'restdate'], '14': ['usetimeculture', 'restdateculture'], '28': ['usetimeleports', 'restdateleports'], '32': ['checkintime', 'checkouttime'], '38': ['opentime', 'restdateshopping'], '39': ['opentimefood', 'restdatefood'] };
const queue = [];
for (const p of listed.values()) {
  const old = previous.get(p.id);
  const fresh = old && old.source === SOURCE && !old.detailPending && old.sourceModified === p.sourceModified && old.type === p.type;
  if (fresh) Object.assign(p, { hours: old.hours || '', closed: old.closed || '', source: SOURCE });
  else queue.push({ p, old, isNew: !old || old.source !== SOURCE });
}
queue.sort((a, b) => Number(b.isNew) - Number(a.isNew));

let fetched = 0, failed = 0, stoppedBy = '';
for (const { p, old } of queue) {
  if (stoppedBy || fetched >= MAX_DETAIL) {
    // 이번에 못 부른 곳: 이전 운영정보가 있으면 유지하고 다음 실행에서 다시 확인
    Object.assign(p, { hours: old?.hours || '', closed: old?.closed || '', source: SOURCE, detailPending: true });
    continue;
  }
  try {
    const [intro] = await tour('KorService2', 'detailIntro2', { contentId: p.id, contentTypeId: p.type });
    fetched++;
    const [hours, closed] = fields[p.type];
    Object.assign(p, { hours: String(intro?.[hours] || ''), closed: String(intro?.[closed] || ''), source: SOURCE });
  } catch (e) {
    if (e.code === '22') stoppedBy = '하루 호출 한도 초과(오류 코드 22)';
    else failed++;
    Object.assign(p, { hours: old?.hours || '', closed: old?.closed || '', source: SOURCE, detailPending: true });
  }
}

// 3) 합치기: 관광공사 목록 + 관광공사 목록에 없는 앱 검토 항목. 관광공사에서 사라진 관광공사 항목은 뺀다.
const places = [...listed.values()];
for (const p of previous.values()) if (!listed.has(String(p.id)) && p.source !== SOURCE) places.push(p);
const pending = places.filter((p) => p.detailPending).length;

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
const tmp = new URL('../public/directory.json.tmp', import.meta.url);
await writeFile(tmp, JSON.stringify({ fetchedAt: new Date().toISOString(), source: SOURCE, places }, null, 2) + '\n');
await rename(tmp, file);
console.log(`공식 장소 ${listed.size}곳 저장 (상세 새로 받음 ${fetched}곳, 이전 값 재사용 ${listed.size - queue.length}곳, 다음에 이어 받을 곳 ${pending}곳${failed ? `, 실패 ${failed}곳` : ''})${stoppedBy ? ` — ${stoppedBy}로 멈춤` : ''}`);
