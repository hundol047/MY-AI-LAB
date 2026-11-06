import {PLACES} from "./data.js";
const $ = (id) => document.getElementById(id);
let places = [], limit = 30;
function draw() {
  const query = $('query').value.trim().toLowerCase();
  const rows = places.filter(p => (!$('type').value || p.type === $('type').value) && `${p.name} ${p.address}`.toLowerCase().includes(query));
  $('count').textContent = `${rows.length}곳 · ${Math.min(limit, rows.length)}곳 표시`;
  $('places').replaceChildren(...rows.slice(0, limit).map(p => {
    const li = document.createElement('li'); li.className = 'card';
    for (const [tag, text] of [['h2', p.name], ['p', p.address], ['p', `운영: ${p.hours || (p.detailPending ? '다음 갱신 때 확인' : '제공 정보 없음')}`], ['p', `${p.type === '32' ? '체크아웃' : '휴무'}: ${p.closed || (p.detailPending ? '다음 갱신 때 확인' : '제공 정보 없음')}`]]) {
      const el = document.createElement(tag); el.textContent = text; if(tag==='h2')el.className='user-content'; li.append(el);
    }
    const planned=PLACES.find(x=>x.id===(p.plannerId||p.id) || (x.name===p.name && Math.abs(x.lat-p.lat)<0.001 && Math.abs(x.lng-p.lng)<0.001));
    const source=document.createElement("small");source.className="user-content";source.textContent=p.source||"한국관광공사 TourAPI";li.append(source);
    if(planned){const link=document.createElement('a');link.href=`index.html?addPlace=${encodeURIComponent(planned.id)}`;link.textContent='일정에 넣기';li.append(link);}
    else {const note=document.createElement('p');note.textContent=p.type==='32'?'숙박 시설: 숙소 검색에서 확인하세요.':'일정 반영 전 운영정보 검토가 필요합니다.';li.append(note);}
    const reviews = document.createElement('a'); reviews.href = `reviews.html?place=${encodeURIComponent(p.id)}`; reviews.textContent = '후기'; li.append(reviews);
    return li;
  }));
  $('more').hidden = rows.length <= limit;
}
for (const id of ['query', 'type']) $(id).addEventListener('input', () => { limit = 30; draw(); });
$('more').onclick = () => { limit += 30; draw(); };
try {
  const res = await fetch('directory.json', { cache: 'no-cache', signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error();
  const data = await res.json();
  if (!Array.isArray(data.places)) throw new Error();
  places = data.places;
  $('status').textContent = data.fetchedAt ? `출처: ${data.source} · 수집: ${new Date(data.fetchedAt).toLocaleString('ko-KR')}` : '새 API 수집 전: 기존 검토 자료를 표시합니다.';
  draw();
} catch { $('status').textContent = '관광정보를 불러오지 못했습니다. 연결을 확인하고 다시 열어 주세요.'; }
