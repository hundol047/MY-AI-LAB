// 오프라인에서도 저장된 일정을 볼 수 있도록 앱 화면을 캐시
const CACHE = "ohneul-gangwon-v4";
const SHELL = ["./", "index.html", "style.css", "app.js", "planner.js", "data.js", "ai-local.js", "icon.svg", "manifest.webmanifest", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/pretendard/pretendardvariable-dynamic-subset.css"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.includes("/api/")) return;
  // 네트워크 우선, 실패하면 캐시 (지도 타일·사진 포함)
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: url.origin === location.origin }))
  );
});
