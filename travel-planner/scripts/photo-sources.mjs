// 장소 사진 찾기: 한국관광공사 TourAPI(공식, 가게 사진 포함) → 위키백과 → 위키미디어 공용
const TOUR = "https://apis.data.go.kr/B551011/KorService2/searchKeyword2";

function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
async function getJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": "ohneul-gangwon/1.0" } });
  if (!res.ok) return null;
  return res.json();
}

// 이름으로 검색한 뒤, 좌표가 2km 안에 있고 사진이 있는 결과 중 가장 가까운 것을 고른다 (동명 가게 오인 방지)
export async function tourPhoto(place, key) {
  if (!key) return "";
  const keyword = place.name.replace(/[·()]/g, " ").replace(/\s+/g, " ").trim();
  const q = new URLSearchParams({ serviceKey: key, MobileOS: "ETC", MobileApp: "ohneul-gangwon", _type: "json", numOfRows: "20", pageNo: "1", keyword });
  const j = await getJSON(`${TOUR}?${q}`);
  let items = j?.response?.body?.items?.item || [];
  if (!Array.isArray(items)) items = [items];
  const near = items
    .filter((it) => it.firstimage && it.mapx && it.mapy)
    .map((it) => ({ url: it.firstimage, d: km(place, { lat: Number(it.mapy), lng: Number(it.mapx) }) }))
    .filter((it) => it.d <= 2)
    .sort((a, b) => a.d - b.d);
  return near[0]?.url.replace(/^http:/, "https:") || "";
}

export async function wikiPhoto(place) {
  if (!place.wiki) return "";
  const j = await getJSON(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(place.wiki)}`);
  return j?.thumbnail?.source || "";
}

export async function commonsPhoto(place) {
  const q = encodeURIComponent(place.name.replace(/[·()]/g, " "));
  const j = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=1&gsrsearch=${q}&prop=imageinfo&iiprop=url&iiurlwidth=480&format=json`);
  const page = j?.query?.pages && Object.values(j.query.pages)[0];
  return page?.imageinfo?.[0]?.thumburl || "";
}

export async function findPhoto(place, key) {
  for (const fn of [() => tourPhoto(place, key), () => wikiPhoto(place), () => commonsPhoto(place)]) {
    try { const url = await fn(); if (url) return url; } catch { /* 다음 출처 */ }
  }
  return "";
}
