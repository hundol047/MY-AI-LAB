// 카카오맵 화장실 (대조용): 앱 장소마다 둘레 500m 안의 카카오맵 '화장실' 장소를 받아 data/kakao-toilets.json에 저장한다.
// bake-walk-info.mjs가 이것과 오픈스트리트맵 화장실을 대조해, 두 지도가 같은 자리(40m 안)를 가리키는 화장실만 '확인된 화장실'로 쓴다.
// (정부 자료 = 행정안전부 공중화장실은 그것만으로 확인된 것으로 본다)
// 실행: KAKAO_REST_KEY=REST_API_키 node scripts/bake-kakao-toilets.mjs   (카카오 디벨로퍼스 > 내 애플리케이션 > 앱 키 > REST API 키)
//  - 키는 GitHub 저장소 Secrets의 KAKAO_REST_KEY에만 둔다 (코드·채팅에 넣지 않는다)
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const RADIUS_M = 500;
// 카카오 검색 결과 중 화장실인 것만 (분류 또는 이름에 '화장실')
export const isToilet = (d) => /화장실/.test(`${d.category_name || ""} ${d.place_name || ""}`) && !/(용품|인테리어|리모델링|설비|시공|청소|철거|타일|욕실)/.test(`${d.category_name || ""} ${d.place_name || ""}`);
export const toItem = (d) => ({ id: String(d.id), name: String(d.place_name || "").slice(0, 60), cat: String(d.category_name || "").slice(0, 60), lat: +Number(d.y).toFixed(6), lng: +Number(d.x).toFixed(6) });

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) { console.error("KAKAO_REST_KEY(카카오 REST API 키)가 필요합니다"); process.exit(1); }
  const { PLACES } = await import("../public/data.js");
  const places = PLACES.filter((p) => p.cat !== "festival" && !["food", "cafe"].includes(p.cat) && Number.isFinite(p.lat));
  const safe = (s) => String(s).split(key).join("***");
  async function search(p, page) {
    const u = `https://dapi.kakao.com/v2/local/search/keyword.json?${new URLSearchParams({ query: "화장실", x: String(p.lng), y: String(p.lat), radius: String(RADIUS_M), sort: "distance", size: "15", page: String(page) })}`;
    for (let i = 0; i < 3; i++) {
      const r = await fetch(u, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(20000) }).catch(() => null);
      if (r?.ok) return r.json();
      if (r && (r.status === 401 || r.status === 403)) throw new Error(safe(`카카오 API 거절(${r.status}): REST API 키와 '카카오맵' 사용 설정을 확인하세요`));
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
    throw new Error(`카카오 검색 실패: ${p.name}`);
  }
  const byId = new Map();
  let done = 0;
  for (const p of places) {
    for (let page = 1; page <= 3; page++) {
      const j = await search(p, page);
      for (const d of j.documents || []) if (isToilet(d)) byId.set(String(d.id), toItem(d));
      if (j.meta?.is_end !== false) break;
    }
    if (++done % 50 === 0) process.stdout.write(`${done} `);
  }
  const items = [...byId.values()];
  console.log(`\n장소 ${places.length}곳 둘레 카카오맵 화장실 ${items.length}곳`);
  if (items.length < 50) throw new Error(`카카오맵 화장실이 ${items.length}곳뿐이라 이상합니다 — 저장하지 않습니다`);
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(new URL("../data/kakao-toilets.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), source: "카카오맵 장소 검색(화장실)", radius: RADIUS_M, items }).replace(/\},\{/g, "},\n{") + "\n");
}
