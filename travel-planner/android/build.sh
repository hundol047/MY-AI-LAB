#!/usr/bin/env bash
# 오늘강원 안드로이드 APK 만들기 — 안드로이드 SDK의 기본 도구만 쓴다 (Gradle 없음)
#   ANDROID_HOME=SDK경로 bash android/build.sh      → android/dist/ohneul-gangwon.apk
# GitHub Actions(.github/workflows/android-apk.yml)는 러너에 깔린 SDK로 이 스크립트를 돌려 릴리스에 올린다.
# 서명 키: KEYSTORE_FILE·KEYSTORE_PASS가 있으면 그것으로, 없으면 이번 빌드용 키를 새로 만든다
#          (키가 바뀌면 이미 설치한 앱은 지우고 다시 설치해야 한다)
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?ANDROID_HOME(안드로이드 SDK 경로)이 필요합니다}"
BT="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
PLATFORM="$ANDROID_HOME/platforms/$(ls "$ANDROID_HOME/platforms" | grep -E '^android-[0-9]+$' | sort -V | tail -1)/android.jar"
echo "build-tools: $BT"
echo "platform:    $PLATFORM"

VERSION_CODE=${VERSION_CODE:-$(git rev-list --count HEAD 2>/dev/null || echo 1)}
VERSION_NAME=${VERSION_NAME:-1.0.$VERSION_CODE}
B=build OUT=dist
TARGET_SDK=35 # Google Play 새 앱·업데이트 요건 (안드로이드 15)
rm -rf "$B" && mkdir -p "$B/classes" "$B/dex" "$B/assets/www" "$OUT"

echo "1) 자바 → 클래스"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$PLATFORM" -d "$B/classes" $(find src -name '*.java')
echo "2) 클래스 → classes.dex"
"$BT/d8" --release --min-api 24 --lib "$PLATFORM" --output "$B/dex" $(find "$B/classes" -name '*.class')
echo "3) 앱 파일 → assets/www (서버용 sw.js는 앱에서 쓰지 않음)"
cp -r ../public/. "$B/assets/www/"
echo "4) 리소스·매니페스트 → APK"
"$BT/aapt2" compile --dir app/res -o "$B/res.zip"
"$BT/aapt2" link -o "$B/base.apk" -I "$PLATFORM" --manifest app/AndroidManifest.xml -A "$B/assets" \
  --min-sdk-version 24 --target-sdk-version "$TARGET_SDK" --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" --replace-version "$B/res.zip"
(cd "$B/dex" && zip -q -0 ../base.apk classes.dex)
echo "5) 정렬 (resources.arsc 비압축·4바이트 정렬)"
"$BT/zipalign" -f -p 4 "$B/base.apk" "$B/aligned.apk"
echo "6) 서명"
if [ -n "${KEYSTORE_FILE:-}" ] && [ -s "$KEYSTORE_FILE" ]; then
  KS="$KEYSTORE_FILE"; PASS="${KEYSTORE_PASS:?KEYSTORE_PASS가 필요합니다}"
else
  KS="$B/build-key.p12"; PASS="build-$RANDOM-$RANDOM"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$PASS" -keypass "$PASS" -alias ohneul \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Ohneul Gangwon, O=ohneul-gangwon, C=KR" >/dev/null 2>&1
  echo "  (저장된 키가 없어 이번 빌드용 키를 만들었습니다)"
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$PASS" --ks-key-alias ohneul --min-sdk-version 24 \
  --out "$OUT/ohneul-gangwon.apk" "$B/aligned.apk"
"$BT/apksigner" verify --min-sdk-version 24 --print-certs "$OUT/ohneul-gangwon.apk" | head -3
"$BT/aapt2" dump badging "$OUT/ohneul-gangwon.apk" | grep -E "^package|sdkVersion|targetSdkVersion|application-label:|launchable-activity" || true
# 빌드 번호가 versionCode에 들어갔는지 확인 (안 들어가면 같은 서명이어도 업데이트 설치가 막힌다)
"$BT/aapt2" dump badging "$OUT/ohneul-gangwon.apk" | grep -q "versionCode='$VERSION_CODE'" || { echo "versionCode가 $VERSION_CODE가 아닙니다"; exit 1; }
ls -la "$OUT/ohneul-gangwon.apk"
# 7) Google Play 스토어용 AAB (BUNDLETOOL=bundletool-all.jar 경로가 있을 때만)
#    같은 리소스를 protobuf 형식으로 다시 묶고, bundletool로 base 모듈 하나짜리 번들을 만든 뒤 같은 키(업로드 키)로 서명한다
if [ -n "${BUNDLETOOL:-}" ] && [ -s "$BUNDLETOOL" ]; then
  echo "7) Play 스토어용 AAB"
  "$BT/aapt2" link --proto-format -o "$B/proto.apk" -I "$PLATFORM" --manifest app/AndroidManifest.xml -A "$B/assets" \
    --min-sdk-version 24 --target-sdk-version "$TARGET_SDK" --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" --replace-version "$B/res.zip"
  rm -rf "$B/mod" "$B/base.zip" && mkdir -p "$B/mod/manifest" "$B/mod/dex"
  (cd "$B/mod" && unzip -q ../proto.apk && mv AndroidManifest.xml manifest/ && cp ../dex/classes.dex dex/ && zip -q -r ../base.zip .)
  java -jar "$BUNDLETOOL" build-bundle --modules="$B/base.zip" --output="$OUT/ohneul-gangwon.aab" --overwrite
  jarsigner -keystore "$KS" -storetype PKCS12 -storepass "$PASS" -sigalg SHA256withRSA -digestalg SHA-256 "$OUT/ohneul-gangwon.aab" ohneul >/dev/null
  jarsigner -verify "$OUT/ohneul-gangwon.aab" | tail -1
  java -jar "$BUNDLETOOL" validate --bundle="$OUT/ohneul-gangwon.aab" | head -5
  ls -la "$OUT/ohneul-gangwon.aab"
fi
