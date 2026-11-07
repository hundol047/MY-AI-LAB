// 지금 발효 중인 기상특보(기상청 기상특보 조회서비스 getPwnStatus)에서 강원 관련 특보만 warnings.json으로 쓴다.
// 앱은 이 파일을 GitHub의 live-data 브랜치(저장소가 공개일 때) 또는 앱 서버의 /api/warnings에서 읽는다 (인증키를 앱에 넣지 않기 위해).
// .github/workflows/update-warnings.yml이 2시간마다 돌린다.
// 실행: TOUR_API_KEY=공공데이터포털키 node scripts/bake-warnings.mjs [출력 파일, 기본 public/warnings.json]
import { writeFile } from "node:fs/promises";
import { fetchWarnings } from "./kma-warnings.mjs";

const key = process.env.TOUR_API_KEY;
if (!key) { console.error("TOUR_API_KEY(공공데이터포털 인증키)가 필요합니다"); process.exit(1); }
const data = await fetchWarnings(key);
await writeFile(process.argv[2] || new URL("../public/warnings.json", import.meta.url), JSON.stringify(data) + "\n");
console.log(`강원 특보 발효 ${data.now.length}건 · 예비 ${data.upcoming.length}건 (${data.effective})`);
