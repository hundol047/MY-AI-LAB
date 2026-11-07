// 지금 발효 중인 기상특보(기상청 기상특보 조회서비스 getPwnStatus)를 읽어 강원 관련 특보만 warnings.json으로 쓴다.
// 앱은 이 파일을 GitHub의 live-data 브랜치에서 읽는다 (인증키를 앱에 넣지 않기 위해). .github/workflows/update-warnings.yml이 2시간마다 돌린다.
// 실행: TOUR_API_KEY=공공데이터포털키 node scripts/bake-warnings.mjs [출력 파일, 기본 public/warnings.json]
import { writeFile } from "node:fs/promises";
import { parseWarnings as parse } from "../public/alerts.js";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY(공공데이터포털 인증키)가 필요합니다"); process.exit(1); }
const out = process.argv[2] || new URL("../public/warnings.json", import.meta.url);
let res;
for (let i = 0; i < 4 && !res; i++) res = await fetch(`https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus?${new URLSearchParams({ serviceKey: key, dataType: "JSON", numOfRows: "10", pageNo: "1" })}`, { signal: AbortSignal.timeout(40000) }).catch(() => null);
if (!res) throw new Error("기상청 연결 실패");
const j = await res.json();
if (j?.response?.header?.resultCode !== "00") throw new Error(`기상청 응답 코드 ${String(j?.response?.header?.resultCode || "?").replace(/\W/g, "")}`);
const it = [].concat(j.response.body.items.item)[0] || {};

const data = {
  source: "기상청 기상특보 조회서비스 (특보 현황)",
  fetchedAt: new Date().toISOString(),
  effective: String(it.tmEf || ""), issued: String(it.tmFc || ""),
  now: parse(it.t6),        // 발효 중
  upcoming: parse(it.t7),   // 예비특보
};
await writeFile(out, JSON.stringify(data) + "\n");
console.log(`강원 특보 발효 ${data.now.length}건 · 예비 ${data.upcoming.length}건 (${data.effective})`);
