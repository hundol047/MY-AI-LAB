// 실시간 버스: 국토교통부 TAGO 버스도착정보(ArvlInfoInqireService)·버스위치정보(BusLcInfoInqireService)를 서버 키로 받아
// 앱에 필요한 값만 돌려준다. 키는 브라우저로 보내지 않는다. 같은 정류장·노선은 20초 동안 다시 쓰고, 한 사람(IP)당 1분 30번까지.
// 공공데이터포털에서 두 서비스를 "활용신청"해야 동작한다 (안 되어 있으면 503 BUS_LIVE_UNAVAILABLE).
const BASE = "https://apis.data.go.kr/1613000";
const TTL = 20e3, MAX_CACHE = 500;
const cache = new Map();
const hits = new Map();

export const validCity = (s) => /^\d{5}$/.test(String(s || ""));
export const validId = (s) => /^[A-Z]{2,5}\d{5,12}$/.test(String(s || ""));

export function allow(ip, now = Date.now(), limit = 30) {
  const h = (hits.get(ip) || []).filter((t) => now - t < 60e3);
  if (h.length >= limit) { hits.set(ip, h); return false; }
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return true;
}

async function tago(svc, op, params, key, fetchImpl = fetch) {
  const q = new URLSearchParams({ serviceKey: key, _type: "json", numOfRows: "50", pageNo: "1", ...params });
  const res = await fetchImpl(`${BASE}/${svc}/${op}?${q}`, { signal: AbortSignal.timeout(8000) });
  const j = await res.json().catch(() => null);
  const code = j?.response?.header?.resultCode;
  if (!res.ok || !j?.response || (code && code !== "00" && code !== "0000")) throw Object.assign(new Error("TAGO"), { status: res.status });
  return [].concat(j.response.body?.items?.item || []);
}

async function cached(k, fn) {
  const c = cache.get(k);
  if (c && Date.now() - c.at < TTL) return c.data;
  const data = await fn();
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(k, { at: Date.now(), data });
  return data;
}

// 정류장 도착 예정: [{no, route, min, stops, type}] 도착 빠른 순
export function arrivals(city, node, key, fetchImpl) {
  return cached(`a:${city}:${node}`, async () => (await tago("ArvlInfoInqireService", "getSttnAcctoArvlPrearngeInfoList", { cityCode: city, nodeId: node }, key, fetchImpl))
    .map((x) => ({ no: String(x.routeno ?? ""), route: String(x.routeid ?? ""), min: Math.max(0, Math.round(Number(x.arrtime) / 60)), stops: Number(x.arrprevstationcnt) || 0, type: String(x.routetp ?? "") }))
    .filter((x) => x.no && Number.isFinite(x.min))
    .sort((a, b) => a.min - b.min).slice(0, 12));
}

// 노선의 버스 위치: [{at: 정류장 이름, ord: 정류장 순서, lat, lng}]
export function locations(city, route, key, fetchImpl) {
  return cached(`l:${city}:${route}`, async () => (await tago("BusLcInfoInqireService", "getRouteAcctoBusLcList", { cityCode: city, routeId: route }, key, fetchImpl))
    .map((x) => ({ at: String(x.nodenm ?? ""), ord: Number(x.nodeord) || 0, lat: Number(x.gpslati), lng: Number(x.gpslong) }))
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng)).slice(0, 40));
}

// 서버 라우트: GET /api/bus/arrivals?city=&node=, GET /api/bus/locations?city=&route=
export async function handleBusLive(req, res, url, json, key = process.env.TOUR_API_KEY, fetchImpl) {
  const p = url.pathname;
  if (req.method !== "GET" || (p !== "/api/bus/arrivals" && p !== "/api/bus/locations")) return false;
  if (!key) { json(res, 503, { error: "BUS_LIVE_UNAVAILABLE" }); return true; }
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  if (!allow(ip)) { json(res, 429, { error: "TOO_MANY_REQUESTS" }); return true; }
  const city = url.searchParams.get("city"), id = url.searchParams.get(p.endsWith("arrivals") ? "node" : "route");
  if (!validCity(city) || !validId(id)) { json(res, 400, { error: "BAD_REQUEST" }); return true; }
  try {
    const list = p.endsWith("arrivals") ? await arrivals(city, id, key, fetchImpl) : await locations(city, id, key, fetchImpl);
    json(res, 200, { at: new Date().toISOString(), list });
  } catch {
    json(res, 503, { error: "BUS_LIVE_UNAVAILABLE" }); // 활용신청 전이거나 TAGO 장애 (키·원문은 돌려주지 않는다)
  }
  return true;
}
