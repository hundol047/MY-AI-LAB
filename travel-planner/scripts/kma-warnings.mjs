// 기상청 특보 현황(getPwnStatus)을 받아 강원 관련 특보만 정리한다. bake-warnings.mjs(GitHub Actions)와 server.mjs(/api/warnings)가 함께 쓴다.
import { parseWarnings } from "../public/alerts.js";

export async function fetchWarnings(key) {
  if (!key) throw new Error("공공데이터포털 인증키가 없습니다");
  let res;
  for (let i = 0; i < 4 && !res; i++) res = await fetch(`https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus?${new URLSearchParams({ serviceKey: key, dataType: "JSON", numOfRows: "10", pageNo: "1" })}`, { signal: AbortSignal.timeout(40000) }).catch(() => null);
  if (!res) throw new Error("기상청 연결 실패");
  const j = await res.json();
  if (j?.response?.header?.resultCode !== "00") throw new Error(`기상청 응답 코드 ${String(j?.response?.header?.resultCode || "?").replace(/\W/g, "")}`);
  const it = [].concat(j.response.body.items.item)[0] || {};
  return {
    source: "기상청 기상특보 조회서비스 (특보 현황)",
    fetchedAt: new Date().toISOString(),
    effective: String(it.tmEf || ""), issued: String(it.tmFc || ""),
    now: parseWarnings(it.t6),      // 발효 중
    upcoming: parseWarnings(it.t7), // 예비특보
  };
}
