// 장소 사진 찾기: 한국관광공사 TourAPI 국문(KorService2)
// 이름 검색 + 주변 2km 목록에서, 이름이 같은 곳(scripts/tour-api.mjs의 judge)이면서 좌표 2km 안이고 사진이 있는 결과만 쓴다.
// 여러 가게가 모인 거리·시장(multi)은 그 거리·시장 자체로 등록된 결과만 허용한다 (개별 가게 사진 금지).
import { candidates, https, maxKmFor } from "./tour-api.mjs";

export const MAX_KM = 2;

// 판정 근거까지 돌려준다: { url, match, rejected } — match/rejected는 리포트용
export async function tourPhotoMatch(place, key, opts = {}) {
  const list = await candidates("KorService2", place, { key, ...opts });
  const limit = maxKmFor(place, MAX_KM);
  const near = list.filter((c) => c.km <= limit);
  const match = near.find((c) => c.ok && c.firstimage && !(opts.reject || []).includes(String(c.contentid)));
  // 리포트: 가까운데 이름이 달라 버린 것 / 이름은 같은데 멀어서 버린 것
  const rejected = [
    ...near.filter((c) => c !== match && c.firstimage && (c.score > 0 || c.km < 0.3 || (opts.reject || []).includes(String(c.contentid)))).slice(0, 3)
      .map((c) => ({ title: c.title, km: c.km, why: (opts.reject || []).includes(String(c.contentid)) ? "수동 검토로 제외" : c.ok ? "더 맞는 결과 있음" : c.why })),
    ...list.filter((c) => c.ok && c.km > limit).slice(0, 2).map((c) => ({ title: c.title, km: c.km, why: `이름 같지만 ${limit}km 밖` })),
  ];
  return { url: match ? https(match.firstimage) : "", match, rejected };
}

export async function tourPhoto(place, key) {
  if (!key) return "";
  try { return (await tourPhotoMatch(place, key)).url; } catch { return ""; }
}
