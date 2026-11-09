// 장소 사진 찾기: 한국관광공사 TourAPI 국문(KorService2)
// 1) 대표사진: 이름 검색 + 주변 2km 목록에서 이름이 같은 곳(scripts/tour-api.mjs의 judge) + 좌표 2km 안 + firstimage
// 2) 추가 사진: 1)처럼 같은 곳으로 판정됐는데 대표사진이 없으면, 그 항목의 추가 사진(detailImage2). 행사 포스터는 뺀다
// 3) 지역 사진: 여러 가게가 모인 식당가처럼 (또는 자체 사진이 없는 가게·시설) 그 자체 등록이 없는 곳은, 사람이 검토해 data.js의 photoAt에 적은
//    관광공사 항목(그 거리가 있는 항구·역·시장 등, 이름 그대로·2km 안)의 사진. 리포트에 "지역 사진"으로 표시한다
// 여러 가게가 모인 거리·시장(multi)은 1)·2)에서도 그 거리·시장 자체로 등록된 결과만 허용한다 (개별 가게 사진 금지).
import { candidates, https, maxKmFor, tour, core, km } from "./tour-api.mjs";

export const MAX_KM = 2;
const isPoster = (i) => /포스터|poster|리플렛|안내도/i.test(i.imgname || "") || /\.png$/i.test(i.originimgurl || "");

// 그 항목의 사진들 (대표사진 먼저, 그다음 추가 사진). 포스터 제외
export async function imagesOf(item, opts = {}) {
  const extra = await tour("KorService2", "detailImage2", { contentId: String(item.contentid), imageYN: "Y", numOfRows: "20", pageNo: "1" }, opts).catch(() => []);
  return [...new Set([item.firstimage, ...extra.filter((i) => !isPoster(i)).map((i) => i.originimgurl)].filter(Boolean).map(https))];
}

// 판정 근거까지 돌려준다: { url, urls, match, how, rejected } — match/how/rejected는 리포트용
export async function tourPhotoMatch(place, key, opts = {}) {
  const o = { key, ...opts };
  const list = await candidates("KorService2", place, o);
  const limit = maxKmFor(place, MAX_KM);
  const near = list.filter((c) => c.km <= limit);
  const rejectedIds = (opts.reject || []).map(String);
  const okNear = near.filter((c) => c.ok && !rejectedIds.includes(String(c.contentid)));
  let match = okNear.find((c) => c.firstimage), how = "대표사진", urls = [];
  if (match) urls = await imagesOf(match, o);
  if (!match) {
    for (const c of okNear) {
      urls = await imagesOf(c, o);
      if (urls.length) { match = c; how = "추가 사진"; break; }
    }
  }
  if (!match && place.photoAt && opts.allowArea !== false) {
    const items = await tour("KorService2", "searchKeyword2", { keyword: place.photoAt, numOfRows: "30", pageNo: "1" }, o);
    const a = items
      .map((it) => ({ ...it, km: km(place, { lat: Number(it.mapy), lng: Number(it.mapx) }) }))
      .find((it) => core(it.title) === core(place.photoAt) && it.km <= (place.photoAtKm || MAX_KM)); // photoAtKm: 사람이 검토해 넓힌 거리
    if (a) {
      urls = await imagesOf(a, o);
      if (urls.length) { match = { ...a, why: "사람이 검토한 지역" }; how = `지역 사진(${a.title})`; }
    }
  }
  // 리포트: 가까운데 이름이 달라 버린 것 / 이름은 같은데 멀어서 버린 것
  const rejected = [
    ...near.filter((c) => c !== match && c.firstimage && (c.score > 0 || c.km < 0.3 || rejectedIds.includes(String(c.contentid)))).slice(0, 3)
      .map((c) => ({ title: c.title, km: c.km, why: rejectedIds.includes(String(c.contentid)) ? "수동 검토로 제외" : c.ok ? "더 맞는 결과 있음" : c.why })),
    ...list.filter((c) => c.ok && c.km > limit).slice(0, 2).map((c) => ({ title: c.title, km: c.km, why: `이름 같지만 ${limit}km 밖` })),
  ];
  // photoPick: 사람이 사진을 보고 고른 컷(이미지 주소의 일부). 있으면 그 컷을 먼저 쓴다 (예: 음식 사진 대신 전시 공간)
  if (place.photoPick) urls = [...urls.filter((u) => u.includes(place.photoPick)), ...urls.filter((u) => !u.includes(place.photoPick))];
  return { url: urls[0] || "", urls, match, how, rejected, registered: okNear.length > 0 };
}

export async function tourPhoto(place, key) {
  if (!key) return "";
  try { return (await tourPhotoMatch(place, key)).url; } catch { return ""; }
}
