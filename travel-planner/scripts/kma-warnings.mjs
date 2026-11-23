// 기상청 특보 현황(getPwnStatus)을 받아 강원 관련 특보만 정리한다. bake-warnings.mjs(GitHub Actions)와 server.mjs(/api/warnings)가 함께 쓴다.
import { parseWarnings } from "../public/alerts.js";

export async function fetchWarnings(key, { wait = 5000 } = {}) {
  if (!key) throw new Error("공공데이터포털 인증키가 없습니다");
  // 기상청이 가끔 빈 응답·오류 문서를 한 번씩 돌려준다(2026-11-22 갱신 실패). 연결 실패뿐 아니라 그런 응답도 잠깐 쉬었다가 다시 받는다
  const url = `https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus?${new URLSearchParams({ serviceKey: key, dataType: "JSON", numOfRows: "10", pageNo: "1" })}`;
  let j, why = "기상청 연결 실패";
  for (let i = 0; i < 4; i++) {
    if (i) await new Promise((r) => setTimeout(r, wait * i));
    const res = await fetch(url, { signal: AbortSignal.timeout(40000) }).catch(() => null);
    if (!res) { why = "기상청 연결 실패"; continue; }
    const got = await res.json().catch(() => null);
    if (got?.response?.header?.resultCode === "00") { j = got; break; }
    why = `기상청 응답 코드 ${String(got?.response?.header?.resultCode || "없음").replace(/[^\w가-힣]/g, "")}`;
  }
  if (!j) throw new Error(why);
  const it = [].concat(j.response.body.items.item)[0] || {};
  return {
    source: "기상청 기상특보 조회서비스 (특보 현황)",
    fetchedAt: new Date().toISOString(),
    effective: String(it.tmEf || ""), issued: String(it.tmFc || ""),
    now: parseWarnings(it.t6),      // 발효 중
    upcoming: parseWarnings(it.t7), // 예비특보
  };
}
