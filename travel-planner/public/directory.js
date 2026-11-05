const $ = (id) => document.getElementById(id);
let places = [], limit = 30;
function draw() {
  const query = $('query').value.trim().toLowerCase();
  const rows = places.filter(p => (!$('type').value || p.type === $('type').value) && `${p.name} ${p.address}`.toLowerCase().includes(query));
  $('count').textContent = `${rows.length}곳 · ${Math.min(limit, rows.length)}곳 표시`;
  $('places').replaceChildren(...rows.slice(0, limit).map(p => {
    const li = document.createElement('li'); li.className = 'card';
    for (const [tag, text] of [['h2', p.name], ['p', p.address], ['p', `운영: ${p.hours || '제공 정보 없음'}`], ['p', `${p.type === '32' ? '체크아웃' : '휴무'}: ${p.closed || '제공 정보 없음'}`]]) {
      const el = document.createElement(tag); el.textContent = text; li.append(el);
    }
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
  $('status').textContent = data.fetchedAt ? `출처: ${data.source} · 수집: ${new Date(data.fetchedAt).toLocaleString('ko-KR')}` : '공식 관광정보를 아직 동기화하지 않았습니다.';
  draw();
} catch { $('status').textContent = '관광정보를 불러오지 못했습니다. 연결을 확인하고 다시 열어 주세요.'; }
