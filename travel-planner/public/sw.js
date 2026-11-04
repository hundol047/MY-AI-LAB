// 오프라인 지원 + 빠른 재방문
// - 앱 파일: 캐시에서 바로 보여주고 뒤에서 새 버전으로 갱신 (stale-while-revalidate)
// - 지도 타일·사진: 한 번 받으면 캐시에서 (cache-first)
// - AI·날씨·경로 등 API: 항상 네트워크
const CACHE = "ohneul-gangwon-v12";
const SHELL = ["./", "index.html", "style.css", "app.js", "planner.js", "data.js", "i18n.js", "data-en.json", "photos.json", "lodging-places.json", "ai-local.js", "icon.svg", "icon-192.png", "apple-touch-icon.png", "manifest.webmanifest", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/pretendard/pretendardvariable-dynamic-subset.css"];
const MEDIA = /tile\.openstreetmap\.org|upload\.wikimedia\.org|tong\.visitkorea\.or\.kr|\.woff2$/;
const LIVE = /\/api\/|open-meteo|project-osrm|wikipedia\.org\/api/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;
  if (LIVE.test(url)) return; // 브라우저 기본 동작(네트워크)
  if (MEDIA.test(url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (new URL(url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
