// ─────────────────────────────────────────────────────────────
// 숙소 제휴 설정 — 이 파일의 따옴표 안만 채우면 됩니다.
// 비워 두면 일반 예약 링크로 연결됩니다. 자세한 안내: docs/affiliate.md
// ─────────────────────────────────────────────────────────────
export const AFFILIATE_CONFIG = {
  // 아고다 사이트 ID (Agoda Partners 관리 화면의 숫자, cid). 예: "1891234"
  agoda: "",

  // 부킹닷컴 제휴 번호 (숫자, aid). 예: "1234567"
  booking: "",

  // 제휴 대행사(CJ·Awin 등)에서 받은 딥링크. 예약 주소가 들어갈 자리를 {url} 로 바꿔 넣으세요.
  // 예: "https://www.awin1.com/cread.php?awinmid=1234&awinaffid=5678&ued={url}"
  bookingWrap: "",
  agodaWrap: "",
};
