> 여행 가이드는 내장 데이터로 동작합니다. AI API 키나 유료 모델 연결은 필요 없으며, 서버의 이전 AI 호출 경로는 비활성화되어 있습니다.

# 외부 연동 준비

현재 로컬 코드에는 예약 신청·본인 조회·취소, 운영자 상태 처리·견적, 앱 내 처리 이력, 직접 후기 작성·검토·신고가 구현되어 있습니다.
실시간 공급사 예약, 실결제·환불, SMS·알림톡 발송과 외부 후기 수입은 아직 연결되지 않았습니다. 키를 넣는 것만으로 이 기능들이 활성화되지는 않습니다.

## 지금 필요한 설정

| 변수 | 용도 | 준비 방법 |
|---|---|---|
| ADMIN_API_TOKEN | 운영자 페이지 인증 | 외부 발급 불필요. 암호 관리자로 32자 이상 무작위 비밀값을 생성해 서버 환경변수에 저장. 프록시 대체용 키가 아닌 서버가 직접 읽는 값이어야 합니다. |
| TOUR_API_KEY | 공식 장소·운영정보 수집 | https://www.data.go.kr/ 에서 한국관광공사 국문 관광정보 서비스 활용 신청. https://api.visitkorea.or.kr/ 의 서비스 안내 참고. 승인 서비스와 KorService2 사용 가능 여부를 확인하고 Decoding 인증키를 사용. |

관광공사 현재 진단 (2026-11-06, `npm run diagnose:tour`): 이 프로젝트의 TOUR_API_KEY로 KorService2 `areaBasedList2`(새 법정동 코드 `lDongRegnCd=51`, 예전 지역 코드 `areaCode=32` 둘 다)·`areaCode2`·`searchKeyword2`·`detailIntro2`가 모두 정상 응답합니다. 예전 진단의 "코드 10"은 v2에서 없어진 파라미터(`listYN`)를 섞은 요청이었거나 다른 환경의 키 문제였던 것으로 보입니다. 같은 오류가 다시 나면 그 환경의 키가 KorService2 활용 승인을 받았는지, Decoding 키인지 확인하세요.

## 결제: 한 가지 방식만 선택

권장 초기 선택은 토스페이먼츠 테스트 연동입니다. 현재는 공급사 확인과 견적을 기록하고 결제 API는 503으로 차단합니다.

- 공식 신청·문서: https://developers.tosspayments.com/
- 개발자 콘솔: https://developers.tosspayments.com/my/api-keys
- 다음 연동에서 사용할 이름: `TOSS_CLIENT_KEY`(브라우저용), `TOSS_SECRET_KEY`(서버 전용). 먼저 테스트 키로 검증합니다.
- 실제 결제는 가맹점 계약·심사, 공급사 재고 확보, 취소·환불 정책이 필요합니다. 금액 서버 검증, 중복 승인 방지, 웹훅 검증 및 환불 동기화를 구현·검증한 뒤 켭니다.
- 대안: https://portone.io/ / https://developers.portone.io/ . 포트원을 선택하면 별도로 토스 직접 연동을 병행할 필요는 없습니다.

## 실시간 숙소·투어 예약

- 숙소 공급: https://developers.expediagroup.com/rapid/ . 제휴 신청 후 승인 범위에 따라 검색·요금 검증·예약·취소 접근이 달라집니다.
- 투어 공급: https://partnerresources.viator.com/ / https://docs.viator.com/partner-api/technical/ . 제휴 유형에 따라 앱 내 예약 권한이 다를 수 있습니다.
- 국내 숙박 유통사·숙소 PMS·지역 투어 업체와 직접 제휴하는 방법도 있습니다.
- 필요한 것은 키뿐 아니라 계약된 상품 범위, 테스트 URL, 인증 방식, 재고·예약·취소 API 문서입니다. 제공사가 정해지기 전에는 변수명을 임의로 고정하지 않습니다.

## 문자·알림톡 (선택)

- SOLAPI: https://solapi.com/ / https://developers.solapi.com/
- 다음 연동에서 사용할 이름: `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SMS_FROM`.
- 발신번호 인증 필요. 알림톡은 카카오 채널·승인된 템플릿도 필요합니다. 현재 앱 내 상태 이력에는 별도 API가 필요 없습니다.

## 외부 후기 (선택)

현재 후기는 앱 이용자가 직접 작성하고 운영자가 공개하는 후기이며 방문 인증을 주장하지 않습니다.
Google Places 등 제공사를 검토할 수 있지만 공급 범위·표시·저장 조건을 먼저 확인해야 합니다: https://developers.google.com/maps/documentation/places/web-service/overview
네이버·카카오 검색 API만으로 방대한 리뷰 전체를 가져올 수 있다고 가정하지 않습니다. 리뷰를 복제·가공해 실제 사용자 후기처럼 채우지 않습니다.

## 실행·검증

Node 24 이상에서 `npm ci`, `npm start`. 서버 환경의 `ADMIN_API_TOKEN` 설정 후 `admin.html`에 같은 값으로 로그인합니다. 인증키는 브라우저 메모리에만 보관하고 로그아웃 시 지웁니다.
신청자는 접수번호와 조회키를 보관해야 합니다. 조회키는 URL이나 서버 원문 토큰으로 저장하지 않습니다.
DB는 `.local/app.sqlite`이며 `APP_DB_PATH`로 영구 저장소 경로를 지정할 수 있습니다. SQLite DB와 WAL 파일을 함께 보존하거나 SQLite 지원 백업을 사용하세요.
기존 버전의 `.local/bookings/*.json` 신청 파일은 삭제하지 않습니다. 해당 구버전에는 조회키가 없으므로 새 조회 UI에서는 볼 수 없으며 운영자가 원본 파일을 확인해야 합니다.
예약 상태 확정은 운영자가 공급사 확인번호를 입력한 경우만 가능합니다. 확정된 예약은 고객이 취소 요청해도 즉시 취소 완료로 표시하지 않습니다.
현재 PG가 없으므로 견적은 결제 청구·결제 완료를 의미하지 않습니다. 후기와 예약 API에는 기본 요청 빈도 제한이 있습니다.
외부 공개 운영 전 실제 운영자 연락처와 영구 저장소를 설정하세요. 종료 신청 180일 보관, 사용자 직접 삭제, 매일 백업 및 7일 백업 정리가 구현되어 있습니다. `APP_BACKUP_DIR`를 별도 영구 저장소로 지정할 수 있습니다. 가게 등록은 관리자 검토·승인 후 공개됩니다. 조회 화면 자동 갱신과 별도로 무료 웹 푸시를 지원합니다. 공개 HTTPS Node 서버의 `PUBLIC_APP_URL` 설정과 사용자 구독이 필요합니다.

- `npm test`: 기존 일정·비용·관광공사 대조 테스트
- `npm run test:services`: 신규 예약·조회·취소·후기·HTTP 테스트
- `npm run sync:directory`: 관광공사 실데이터 수집 (인증 성공 후)

공급사 연동 전 기본 운영은 단일 Node 서버입니다. GitHub Pages와 현재 APK에는 서버가 없어 예약 접수·후기 저장이 지원되지 않습니다. 공개 HTTPS 백엔드 주소가 정해지면 앱의 API 주소와 허용 출처를 별도로 연결해야 합니다.
키 값은 채팅·Git·스크린샷에 넣지 않고 환경 설정의 보안 입력 경로를 이용하세요. 개발용 키와 운영용 키를 분리하세요.

TOUR_API_KEY는 KorService2에서 정상 동작합니다(2026-11-06 확인). 탐색 목록은 2026-11-06 첫 수집으로 관광공사 강원 목록 약 4,600곳이 들어갔고(상세 운영정보는 500곳, 나머지는 매일 500곳씩 이어 받음), 앱이 검토한 107곳도 함께 있습니다. 실시간 숙박 가격과 공급사 확정·취소, SMS·메일은 별도 발송 서비스가 필요합니다. 앱 종료 후 브라우저 알림은 무료 웹 푸시로 구현했으며 실제 운영 서버와 기기 수신 검증이 필요합니다.

## 재진단 결과와 남은 연결 조건

- `npm run diagnose:tour`는 HTTPS만 사용하고 키·요청 URL·응답 원문을 저장하지 않습니다. 최신 결과는 `reports/tour-connectivity.json`입니다. 2026-11-06 결과: KorService2의 지역 목록(법정동·지역 코드)·최소 요청·지역 코드 조회 모두 정상, 폐기된 KorService1만 코드 12(없는 서비스, 정상적인 결과)입니다. 오류 코드 10은 보통 필수 파라미터 누락이나 v2에서 없어진 파라미터 때문이고, 22는 하루 호출 한도 초과입니다.
- 실시간 숙박 비교 및 자동 확정·취소에는 실제 공급사 계약/계정과 API 명세가 필요합니다. 이 환경에는 TOUR_API_KEY만 연결되어 있습니다. Expedia Rapid 승인 또는 실제 제휴 공급사의 테스트 계정·숙소 ID 매핑 없이 성공·예약 확정을 만들어내지 않습니다.
- 무료 웹 푸시는 `PUBLIC_APP_URL=https://실제-공개-앱-주소` 설정 시 활성화됩니다. VAPID 키는 앱 서버가 자동 생성합니다. `api/push-config`로 활성 상태를 확인할 수 있습니다. 현재 공개 서버 주소가 없어 운영 발송은 미활성입니다. 푸시 키 파일은 DB 옆 `vapid.json`이며 DB 백업과 별도로 영구 보존해야 합니다.

## 앱 서버 올리기 (후기·예약 신청·가게 등록을 공개 버전에서 쓰려면)

GitHub Pages 웹앱과 APK는 정적 파일만 있어서 서버가 필요한 기능(후기, 숙소·투어 예약 신청, 가게 등록, 사용 통계)이 숨겨집니다. 저장소 루트의 `render.yaml`과 `travel-planner/Dockerfile`로 서버를 한 번에 올릴 수 있습니다.

1. https://dashboard.render.com 에 GitHub 계정으로 가입
2. **New → Blueprint** → 저장소 `hundol047/MY-AI-LAB` 선택 → `render.yaml`을 읽어 `ohneul-gangwon` 서비스를 만든다
3. 입력 칸 두 개를 채운다: `TOUR_API_KEY`(공공데이터포털 Decoding 키), `PUBLIC_APP_URL`(만들어진 주소, 예: `https://ohneul-gangwon.onrender.com` — 처음엔 비워 두고 주소가 나온 뒤 넣어도 된다)
4. 결제 수단 등록 후 **Apply**. 디스크(/var/data)에 SQLite를 두므로 재시작해도 후기·신청이 남는다 (디스크는 유료 플랜에서만 붙는다)
5. 관리자 화면: `https://주소/admin.html`, 관리자 토큰은 Render의 Environment 탭 `ADMIN_API_TOKEN` 값

서버 주소가 생기면 그 주소 자체가 모든 기능이 켜진 앱이 된다. 주소를 알려 주면 APK와 GitHub Pages 웹앱도 그 서버를 쓰도록 연결한다.
