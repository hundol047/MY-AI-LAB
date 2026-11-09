// 자동 갱신 안전장치: API 호출 한도·장애로 받은 자료가 크게 줄면(25% 넘게) 그 파일은 지난 버전으로 되돌린다.
// (예: 2026-11-09 주간 갱신에서 하루 호출 한도에 걸려 주차 정보가 257곳 → 109곳으로 줄어든 일)
// 사용: node .github/scripts/guard-shrink.mjs 파일...   (commit-data.sh가 git add 전에 부른다)
import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MAX_DROP = 0.25, MIN_BASE = 10;
// 자료의 크기: 배열이면 길이, 아니면 대표 묶음(places·routes·items)의 항목 수
export function sizeOf(j) {
  if (Array.isArray(j)) return j.length;
  for (const k of ["places", "routes", "items"]) {
    const v = j?.[k];
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") return Object.keys(v).length;
  }
  return j && typeof j === "object" ? Object.keys(j).length : 0;
}
const note = (s) => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };

for (const f of process.argv.slice(2).filter((x) => x.endsWith(".json"))) {
  let before, after;
  try { before = sizeOf(JSON.parse(execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8", maxBuffer: 64 << 20 }))); } catch { continue; } // 새 파일
  try { after = sizeOf(JSON.parse(readFileSync(f, "utf8"))); } catch { after = 0; }
  if (before >= MIN_BASE && after < before * (1 - MAX_DROP)) {
    execFileSync("git", ["checkout", "HEAD", "--", f]);
    note(`::warning::${f}: ${before} → ${after}개로 크게 줄어 지난 버전을 유지합니다 (API 한도·장애 의심)`);
  }
}
