#!/usr/bin/env bash
# 자동 갱신 데이터를 main에 커밋·푸시하고 앱(APK)을 다시 만든다.
# 사용: commit-data.sh "커밋 메시지" 파일...
# - 그 사이 main이 바뀌었으면 받아서 다시 올린다 (데이터 파일만 바꾸므로 충돌하지 않는다)
# - GITHUB_TOKEN으로 푸시하면 다른 워크플로가 저절로 돌지 않아서, APK 빌드는 직접 부른다
set -euo pipefail
msg="$1"; shift
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -- "$@"
if git diff --cached --quiet; then echo "바뀐 데이터 없음" >> "$GITHUB_STEP_SUMMARY"; exit 0; fi
git commit -q -m "$msg"
for i in 1 2 3 4; do
  if git push -q origin HEAD:main; then
    echo "main에 반영: $(git log -1 --format=%h) $msg" >> "$GITHUB_STEP_SUMMARY"
    gh workflow run android-apk.yml --ref main || echo "::warning::APK 빌드를 부르지 못했습니다 (다음 코드 반영 때 다시 만들어집니다)"
    exit 0
  fi
  sleep $((i * 5)); git pull -q --rebase origin main
done
echo "::error::main에 반영하지 못했습니다"; exit 1
