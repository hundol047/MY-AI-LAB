// 화면 언어 (한국어 / English / 日本語 / 中文): 고정 문구 사전과 장소 외국어 데이터를 한 곳에서 관리한다.
// - 일본어·중국어(간체) 사전은 i18n-cjk.js, 장소 이름·팁은 knowledge-intl.js.
// - 고정 문구는 한국어 원문을 키로 쓴다: t("일정 만들기") → EN이면 "Make my plan". 사전에 없으면 한국어 그대로.
// - {이름}은 값 자리: t("{n}곳", { n: 3 }) → "3 places"
// - 장소 이름·설명은 data-en.json(한국관광공사 영문 관광정보, scripts/bake-english.mjs)에서. 없으면 한국어 그대로.
// - 일정 엔진(planner.js)은 언어와 무관하게 그대로 쓰고, 화면에 보일 때만 바꾼다.

// 일본어·중국어 표는 그 언어를 고를 때만 받는다 (한국어·영어 사용자는 첫 화면이 가볍게)
let C = null;
let cjkReady = null;
function loadCJK() {
  return (cjkReady ??= Promise.all([import("./i18n-cjk.js"), import("./knowledge-intl.js")]).then(([a, b]) => { C = { ...a, ...b }; }));
}

const KEY = "lang";
export const LANGS = ["ko", "en", "ja", "zh"];
function initialLang() {
  try { const s = localStorage.getItem(KEY); if (LANGS.includes(s)) return s; } catch { /* 저장소 없음 */ }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || "ko"];
  const first = langs[0] || "";
  return /^ko\b/i.test(first) ? "ko" : /^ja\b/i.test(first) ? "ja" : /^zh\b/i.test(first) ? "zh" : "en";
}
let lang = initialLang();
export const getLang = () => lang;
export const isEN = () => lang === "en";
export const isForeign = () => lang !== "ko"; // 외국어 화면(영어·일본어·중국어): 원화 표기, 구글 우선 등
const HTML_LANG = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans" };
export function setLang(l) {
  lang = LANGS.includes(l) ? l : "ko";
  try { localStorage.setItem(KEY, lang); } catch { /* 기억 못 해도 동작 */ }
  document.documentElement.lang = HTML_LANG[lang];
}

/* ---------- 고정 문구 ---------- */
export const EN = {
  "자유 시간 {min}분 · 근처 산책·쉬기": "{min} min free time · stroll or rest nearby",
  "문을 닫았어요 (폐업·휴업)": "It's closed (shut down or on break)",
  "운영시간·쉬는 날이 달라요": "Hours or closing days are wrong",
  "주차 정보가 달라요": "Parking info is wrong",
  "위치가 달라요": "Location is wrong",
  "기타": "Other",
  "무엇이 다른지 적어 주세요 (선택)": "What's different? (optional)",
  "개인정보는 받지 않아요. 확인 후 앱 정보를 고칩니다.": "No personal data is collected. We'll check and fix the app.",
  "취소": "Cancel",
  "정보가 달라요": "Info wrong?",
  "제보함": "Reported",
  "{name} 정보가 달라요": "Report wrong info: {name}",
  "고마워요! 제보를 받았어요": "Thanks! Report received",
  "제보 작성 화면을 열었어요 · 보내기를 눌러 주세요": "Opened the report form · please press submit",
  "저장": "Save",
  "저장 공간이 부족해요 · 저장한 일정을 지워 주세요": "Out of storage · delete some saved plans",
  "이 기기에 저장했어요 · 첫 화면 '저장한 일정'에서 열 수 있어요": "Saved on this device · open it from 'Saved plans' on the first screen",
  "만 원": "0k won",
  "저장한 일정": "Saved plans",
  "{n}곳 · 이동 {m}": "{n} stops · {m} travel",
  "열기": "Open",
  "고른 일정 비교 ({n})": "Compare selected ({n})",
  "장소": "Stops",
  "걷기": "Walking",
  "주요 장소": "Highlights",
  "한 번에 3개까지 비교할 수 있어요": "You can compare up to 3 at a time",
  "🌅 해돋이 보기: {spot} 일출 {rise} · 숙소에서 {mode} {min}분, {go}에 나가면 돼요": "🌅 Catch the sunrise: {spot} at {rise} · {min} min {mode} from your stay, leave at {go}",
  "걸어서": "on foot",
  "택시로": "by taxi",
  "차로": "by car",
  "일출 {r} · 일몰 {s}": "Sunrise {r} · Sunset {s}",
  "🅿️ 주차 정보 없음 · 근처 공영주차장을 확인하세요": "🅿️ No parking info · check nearby public parking",
  "🅿️ 전용 주차장 없음 · 근처 공영주차장 이용": "🅿️ No own parking · use nearby public parking",
  "🅿️ 주차 가능": "🅿️ Parking",
  " · {n}대": " · {n} spaces",
  "무료": "free",
  "유료": "paid",
  "시군 공고에서 회차 확인": "Check rounds in the county notice",
  "지금 진행 중인 회차·신청 날짜 보기": "See current rounds and application dates",
  "대상 시군 장소 {n}곳 ({names}) · 승인되면 경비의 50%, 최대 {cap}원": "{n} stops in eligible counties ({names}) · if approved, 50% of costs back, up to ₩{cap}",
  " · 이 일정 예상 경비로는 약 {won}원까지": " · about ₩{won} for this plan's estimated costs",
  "💰 반값여행 대상 지역 포함": "💰 Includes half-price travel areas",
  "여행 기간 축제도 살폈어요: {f}": "Checked festivals during your trip: {f}",
  "말씀을 알아들었어요: {what}": "Got it: {what}",
  "고른 조건을 확인했어요": "Checked your choices",
  "강원 장소 {n}곳 중 여행 날짜에 문 여는 {open}곳을 골랐어요": "Picked {open} of {n} Gangwon places that are open on your dates",
  " · 쉬는 날 {c}곳 제외": " · {c} closed ones left out",
  "붐빔 예상 {c}곳은 뒤로 미뤘어요 (관광공사 혼잡 예측)": "Pushed back {c} places expected to be busy (KTO crowd forecast)",
  "여행 기간 축제 {f}를 살폈어요": "Checked festivals during your trip: {f}",
  "이동 시간과 운영시간을 맞춰 동선을 짰어요 · 영업시간 충돌 {c}건": "Built the route around travel times and opening hours · {c} hour conflicts",
  "성격이 다른 일정 3개를 비교했어요": "Compared 3 different plans",
  "여행 일정을 짜고 있어요": "Planning your trip",
  "추천": "Recommended",
  "알차게": "Packed",
  "색다른 코스": "Something different",
  "가장 균형 잡힌 동선": "The most balanced route",
  "장소를 줄이고 덜 걷고 덜 이동": "Fewer stops, less walking and driving",
  "하루에 더 많이 보기": "See more each day",
  "추천 일정에 없는 곳 위주": "Mostly places not in the recommended plan",
  "후보 {n}곳 중 여행 날짜에 문 여는 {open}곳에서 골랐어요.": "Chosen from {open} of {n} places open on your dates.",
  "붐빔 예상 {c}곳은 뒤로 미뤘어요.": "{c} places expected to be busy were pushed back.",
  "휠체어·유모차로 다니기 쉬운 곳을 먼저 넣었어요.": "Wheelchair- and stroller-friendly places come first.",
  "부모님과 함께라 걷기를 줄였어요.": "Less walking since you're with your parents.",
  "아이와 함께라 오래 걷는 산길은 줄였어요.": "Fewer long trails since you're with kids.",
  "반려동물 동반이 확인된 곳을 먼저 넣었어요.": "Confirmed pet-friendly places come first.",
  "기차·버스 시간표와 걷는 거리에 맞췄어요.": "Fitted to train/bus timetables and walking distances.",
  "여행 기간 축제({f})도 살폈어요.": "Also checked festivals during your trip ({f}).",
  "일정 3개 중에서 고르세요": "Pick one of 3 plans",
  "{n}곳 · 이동 {m} · 걷기 {km}km": "{n} stops · {m} travel · {km} km walk",
  "지금 보는 일정": "Showing now",
  "이 일정으로": "Use this plan",
  "{name} 일정으로 바꿨어요": "Switched to the {name} plan",
  "질문을 이해하는 중…": "Understanding your question…",
  "일정과 운영시간을 확인하는 중…": "Checking the plan and opening hours…",
  "강원 여행,<br>말하면 일정이 나와요": "Your Gangwon trip,<br>just say it",
  "마이크를 누르고 여행을 말해 보세요": "Tap the mic and tell us your trip",
  "예) 다음 주 토요일 부모님이랑 속초 1박, 서울역에서 기차로": "e.g. Next Saturday, Sokcho for 1 night with my parents, by train from Seoul Station",
  "말 대신 글로 써도 돼요": "Or type it here",
  "직접 골라서 만들기": "Choose options yourself",
  "말하기": "Speak",
  "이 기기에서는 음성 인식을 쓸 수 없어요 · 글로 써 주세요": "Voice input isn't available on this device · please type",
  "듣고 있어요… 말이 끝나면 일정을 만들어요": "Listening… your plan starts when you finish",
  "마이크 권한을 허용해 주세요": "Please allow microphone access",
  "음성 인식은 인터넷이 필요해요": "Voice input needs an internet connection",
  "가고 싶은 여행을 글로 써 주세요": "Type the trip you want",
  "날짜 못 들음 · {d}": "Date not heard · {d}",
  "어른 {a} · 아이 {k}": "{a} adults · {k} kids",
  "어른 {a}": "{a} adults",
  "{name}에서 출발": "From {name}",
  "{t} 출발": "Leave at {t}",
  "다시 말하기": "Say it again",
  "직접 고치기": "Edit myself",
  "{from}에서 여기까지 길찾기": "Directions from {from}",
  "👥 붐비는 날 (집중률 {v})": "👥 Busy day (crowd index {v})",
  "👥 붐빔 예상 (집중률 {v}) · 문 여는 시간에 맞춰 가면 덜 붐벼요": "👥 Busy day expected (crowd index {v}) · go right at opening",
  "👥 조금 붐빔 예상 (집중률 {v})": "👥 Somewhat busy (crowd index {v})",
  "이어서 갈 권역 <em>원할 때만</em>": "Continue to <em>optional</em>",
  "{route} 순서로 이어서 가요 · 날짜는 앞 권역부터 고르게 나눠요": "Route: {route} · days are split evenly, earlier areas first",
  "고르지 않으면 한 권역에서만 다녀요": "Leave empty to stay in one area",
  "{n}일 일정에는 이어서 갈 권역을 {k}곳까지 고를 수 있어요": "A {n}-day trip can continue to up to {k} more area(s)",
  "추천 숙소 · {d}일차 밤부터 {n}박": "Suggested stay · {n} night(s) from day {d}",
  "{d}일차 밤": "Night of day {d}",
  "{n}박": "{n} night(s)",
  "전화로 영업·동반 확인": "Call to check hours & pets",
  "{n}번": "Bus {n}",
  "{m}분 간격": "every {m} min",
  "막차 {t}": "last bus {t}",
  "국토교통부 TAGO 버스노선정보 · 첫차·막차는 기점 출발 시각": "MOLIT TAGO bus routes · first/last times are departures from the route's starting stop",
  "근처 버스 막차({t}, 기점 출발)에 가까워요 · 택시를 준비하세요": "Close to the last nearby bus ({t}, from its starting stop) · plan for a taxi",
  "출발지를 서울역·청량리역·상봉역·동서울·서울고속버스터미널, 부전역·동대구역, 인천·김포공항, 부산동부·대전복합터미널 중 하나로 정하면 실제 기차·버스 시간표로 첫날을 짜요.": "Set your start to Seoul, Cheongnyangni, Sangbong, Bujeon (Busan) or Dongdaegu Station, Incheon or Gimpo Airport, or Dong Seoul, Seoul Express, Busan Dongbu or Daejeon bus terminal, and day 1 follows the real train or bus timetable.",
  "영업시간 정보가 없어 {h}로 가정했어요 · 방문 전 확인하세요": "No opening hours given, so {h} is assumed · please check before you go",
  "강풍주의보": "High wind advisory",
  "강풍경보": "High wind warning",
  "풍랑주의보": "High seas advisory",
  "풍랑경보": "High seas warning",
  "대설주의보": "Heavy snow advisory",
  "대설경보": "Heavy snow warning",
  "호우주의보": "Heavy rain advisory",
  "호우경보": "Heavy rain warning",
  "태풍주의보": "Typhoon advisory",
  "태풍경보": "Typhoon warning",
  "한파주의보": "Cold wave advisory",
  "한파경보": "Cold wave warning",
  "폭염주의보": "Heat wave advisory",
  "폭염경보": "Heat wave warning",
  "건조주의보": "Dry weather advisory",
  "건조경보": "Dry weather warning",
  "황사주의보": "Yellow dust advisory",
  "황사경보": "Yellow dust warning",
  "예비특보: {name} 예정 · 출발 전 기상청 특보를 확인하세요": "Preliminary: {name} expected · check KMA warnings before you go",
  "⚠ {name} 발효 중 · 운영·통제 여부를 꼭 확인하세요": "⚠ {name} in effect · check whether it's open",
  "{name} 발효 중": "{name} in effect",
  "기차": "Train",
  "고속버스": "Express bus",
  "시외버스": "Intercity bus",
  "막차": "last one",
  "오가는 길": "Getting there and back",
  "가는 편: {from} {dep} → {hub} {arr}": "Going: {from} {dep} → {hub} {arr}",
  "마지막 날 돌아오는 편 ({time} 이후)": "Back on the last day (after {time})",
  "마지막 일정 뒤에 돌아오는 편이 시간표에 없어요. 일정을 줄이거나 하루 더 머무세요.": "No train or bus back after the last stop. Shorten the day or stay another night.",
  "국토교통부 TAGO 시간표 기준 (기차 {t}, 버스 {b}). 예매·시간 변경은 코레일·버스 예매 사이트에서 확인하세요.": "Based on MOLIT TAGO timetables (train {t}, bus {b}). Check Korail or bus booking sites for tickets and changes.",
  "이 권역으로 가는 기차·버스 시간표가 없어 이동 시간을 거리로 추정했어요.": "No train or bus timetable to this region, so travel time is estimated from distance.",
  "출발지를 서울역·청량리역·상봉역·동서울·서울고속버스터미널 중 하나로 정하면 실제 기차·버스 시간표로 첫날을 짜요.": "Set your start to Seoul, Cheongnyangni or Sangbong Station, or Dong Seoul or Seoul Express Bus Terminal, and day 1 follows the real train or bus timetable.",
  "오가는 기차·버스": "Train / bus there and back",
  "가는 편 {go} · 돌아오는 편 {back} (어린이는 할인될 수 있어요)": "Going {go} · back {back} (children may get a discount)",
  "이동 편의 <em>필요할 때만</em>": "Accessibility <em>if needed</em>",
  "♿ 휠체어": "♿ Wheelchair",
  "👶 유모차": "👶 Stroller",
  "휠체어 대여": "wheelchair rental",
  "경사로·턱 없음": "ramp / step-free",
  "엘리베이터": "elevator",
  "장애인 화장실": "accessible toilet",
  "장애인 주차": "accessible parking",
  "유모차 대여": "stroller rental",
  "수유실": "nursing room",
  "무장애 정보 없음 · 계단·경사를 미리 확인하세요": "No accessibility info · check for stairs and slopes",
  "무장애 정보 있음": "Accessibility info",
  "한국관광공사 무장애 여행 정보": "Source: Korea Tourism Organization barrier-free travel info (in Korean)",
  "반려동물과": "With a pet",
  "🐾 동반 가능": "🐾 Pets OK",
  "🐾 동반 확인 필요": "🐾 Check pet rules",
  "영업시간(관광공사 원문): {text}": "Hours (KTO text): {text}",
  "반려동물과 함께": "Traveling with your pet",
  "강원 반려동물 동반 시설 목록에 있는 곳(🐾 동반 가능)을 먼저 넣고, 확인이 안 된 실내 시설·식당은 빼요. 야외 자연·해변은 '동반 확인 필요'로 표시해요. 목줄·배변봉투를 챙기고, 실내 동반 조건은 시설마다 달라요.": "Places on Gangwon's pet-friendly list (🐾 Pets OK) come first; indoor places and restaurants not on the list are left out. Outdoor nature spots and beaches are marked 'Check pet rules'. Bring a leash and waste bags; indoor rules differ by place.",
  "{days}일차는 근처에 동반 가능한 식당이 목록에 없어 점심을 넣지 않았어요. 포장이나 테라스 좌석을 이용하세요.": "Day {days}: no pet-friendly restaurant on the list nearby, so lunch isn't scheduled. Try takeout or terrace seating.",
  "{town} 동반 가능 숙소": "Pet-friendly stays in {town}",
  "동물병원": "Animal hospitals",
  "동물약국": "Pharmacies for pets",
  "출처: {src}. 방문 전 동반 가능 여부를 한 번 더 확인하세요.": "Source: {src}. Please confirm pet rules before you visit.",
  "그 순서로는 영업시간이 맞지 않아요": "That order doesn't fit the opening hours",
  "위로": "Move up",
  "아래로": "Move down",
  "앱이 검토하지 않은 장소 · 관광공사 원문: {text}": "Not reviewed by the app · KTO info: {text}",
  "운영 정보 없음": "no hours given",
  " · 시간은 09:00–18:00로 가정": " · assuming 09:00–18:00",
  "이 장소는 일정에 넣을 수 없어요 (숙박이거나 앱 지역에서 너무 멀어요)": "This place can't be added (it's lodging or too far from the app's areas)",
  "{name}을(를) {n}일차에 넣었어요": "Added {name} to day {n}",
  "{name}은(는) 이번 일정의 권역·영업시간에 맞지 않아 넣지 못했어요": "Couldn't add {name}: it doesn't fit this trip's area or opening hours",
  "탐색 목록을 불러오지 못했어요": "Couldn't load the place list",
  "오늘 일정은 모두 끝났어요. 편히 쉬세요!": "That's everything for today. Have a good rest!",
  "지금 {place} 일정 중 · {time}까지": "Now at {place} · until {time}",
  "다음: {place} {time}": "Next: {place} at {time}",
  "⚠ 지금 출발해도 {arrive} 도착 · 입장 마감 {deadline}에 늦어요. '바꾸기'로 다른 곳을 고르세요": "⚠ Leaving now you'd arrive at {arrive} · after the last entry at {deadline}. Use 'Swap' to pick another place",
  "{leave}까지 출발하면 돼요 ({min}분 남음 · 이동 약 {travel}분)": "Leave by {leave} ({min} min left · about {travel} min to get there)",
  "지금 출발하세요 · 이동 약 {travel}분, {arrive} 도착": "Leave now · about {travel} min, arriving at {arrive}",
  "오늘 여행 중": "Today on your trip",
  "내 위치 기준 · 다시 계산": "From my location · recalculate",
  "내 위치로 다시 계산": "Recalculate from my location",
  "오늘 일정 보기": "Show today's plan",
  "이 기기에서는 위치를 쓸 수 없어요": "Location isn't available on this device",
  "위치를 가져오지 못했어요": "Couldn't get your location",
  "환급 {won} 뺀 금액 (돌려받는 지역 상품권: {list})": "After {won} in refunds (paid back as local vouchers: {list})",
  "신청하면 더 돌려받을 수 있어요: {list}": "You can get more back if you apply: {list}",
  "{title} 최대 {won}": "{title} up to {won}",
  " (공고 확인 필요)": " (check the official notice)",
  "⚠ 돌풍 최대 {g}m/s 예보 · 운휴·통제될 수 있어요. 출발 전 운영 여부를 확인하거나 '바꾸기'로 다른 곳을 고르세요": "⚠ Gusts up to {g} m/s forecast · it may stop running or close. Check before you go, or use 'Swap' to pick another place",
  "⚠ 바람이 센 날(돌풍 {g}m/s) · 풍랑특보가 나면 통제돼요. 출발 전 확인하세요": "⚠ Windy day (gusts {g} m/s) · closed when a high-wave warning is issued. Check before you go",
  "⚠ 눈 {s}cm 예보 · 고갯길이 막히거나 체인이 필요할 수 있어요": "⚠ {s} cm of snow forecast · mountain roads may close or need chains",
  "산불조심기간: 국립공원 일부 탐방로가 통제될 수 있어요. 국립공원 누리집에서 확인하세요": "Wildfire season: some national park trails may be closed. Check the Korea National Park Service website",
  "스키장 개장·폐장일은 해마다 달라요. 리조트 공지를 확인하세요": "Ski season opening and closing dates change every year. Check the resort's notice",
  "출발 전 확인": "Check before you go",
  "임시 휴장·통제는 미리 알 수 없어요. 출발 전날 공식 안내를 한 번 확인하세요.": "Temporary closures can't be known in advance. Check the official notices the day before you leave.",
  "국립공원 탐방로 통제": "National park trail closures",
  "기상특보": "Weather warnings",
  "고속도로·도로 상황": "Highway & road conditions",
  "강원 장소·운영정보 탐색": "Explore places and opening information",
  "숙소·투어 예약 신청": "Accommodation and tour requests",
  "신청 조회": "Request status",
  "여행 후기": "Travel reviews",
  "후기": "Reviews",
  "{platform}에서 숙소 검색": "Search stays on {platform}",
  "확인한 요금 비교": "Compare checked prices",
  "같은 객실 유형": "Same room type",
  "세금 포함 전체 숙박 총액 (원)": "Total stay including taxes (KRW)",
  "무료 취소 가능": "Free cancellation available",
  "같은 날짜·인원·객실·식사 조건을 확인했어요": "I checked matching dates, guests, rooms and meals",
  "무료 취소 상품만 비교": "Compare only free cancellation offers",
  "비교 적용": "Apply comparison",
  "직접 확인한 요금만 비교하며, 날짜·인원이 바뀌거나 24시간이 지나면 다시 확인해야 해요.": "Only entered prices are compared. Recheck after date or guest changes, or after 24 hours.",
  "동일 조건으로 입력한 총액과 취소 조건을 비교해 선택했어요.": "Selected using entered totals and cancellation terms for matching conditions.",
  "입력한 요금 중 무료 취소 조건에 맞는 상품이 없습니다.": "No entered offer meets the free cancellation requirement.",
  "실시간 요금 자료가 없어 플랫폼 우열을 판단하지 않았어요.": "Live prices are unavailable, so no platform is ranked as better.",
  "어른 {adults}명 · 어린이 {kids}명 · 객실 {rooms}개": "{adults} adults · {kids} children · {rooms} rooms",
  "객실 수": "Rooms",
  "어린이 {n} 나이": "Child {n} age",
  "선택 필요": "Select",
  "아동 나이를 모두 선택하면 예약 검색에 전달합니다. 플랫폼에서 최종 조건을 확인하세요.": "All selected child ages are sent to booking search. Confirm final conditions on the platform.",
  "추천 · {platform}에서 예약 찾기": "Recommended · Find stays on {platform}",
  "다른 플랫폼 보기": "Other platforms",
  "낮은 가격순 검색과 화면 언어를 함께 전달할 수 있어 먼저 추천해요.": "Recommended first because this link requests lowest-price sorting and your selected language.",
  "어른 {adults}명 · 어린이 {kids}명 · 객실 1개로 검색": "{adults} adults · {kids} children · Search for 1 room",
  "한 줄로 시작": "Start in one sentence",
  "가격·예약": "Prices & booking",
  "지도 이동 켜기": "Enable map movement",
  "지도 이동 끄기": "Disable map movement",
  "기본은 페이지 스크롤입니다. 지도 이동을 켜면 지도를 움직일 수 있어요.": "Scroll the page normally. Enable map movement to pan the map.",
  "여행 날짜와 인원으로 예약 플랫폼을 엽니다. 객실·아동 나이·세금·취소 조건과 최종 금액을 확인하세요. 최저가는 보장하지 않습니다.": "Opens booking platforms with your dates and guests. Check rooms, child ages, taxes, cancellation terms and the final price. Lowest prices are not guaranteed.",
  "조건에 맞는 대안을 찾지 못해 기존 일정을 유지했어요.": "No suitable alternative was found, so your plan is unchanged.",
  "대화 번역을 불러오지 못했어요. 원문을 표시합니다.": "Translation unavailable. Showing the original message.",

  // 머리글·첫 화면
  "오늘강원": "Oneul Gangwon",
  "링크 공유": "Share",
  "캘린더 저장": "Calendar",
  "강원 여행 일정,<br>고르기만 하세요": "Your Gangwon trip,<br>just pick and go",
  "오늘의 강원": "Today in Gangwon",
  "예) 주말에 부모님이랑 속초 1박": "e.g. Sokcho with my parents this weekend, 1 night",
  "만들기": "Create",
  "어디로": "Where",
  "언제": "When",
  "누구와": "With whom",
  "좋아하는 것 <em>여러 개 가능</em>": "Interests <em>pick any</em>",
  "이동": "Getting around",
  "강릉·동해": "Gangneung · Donghae",
  "속초·양양": "Sokcho · Yangyang",
  "춘천·철원": "Chuncheon · Cheorwon",
  "평창·정선": "Pyeongchang · Jeongseon",
  "원주": "Wonju",
  "당일": "Day trip",
  "1박 2일": "2 days, 1 night",
  "2박 3일": "3 days, 2 nights",
  "3박 4일": "4 days, 3 nights",
  "4박 5일": "5 days, 4 nights",
  "택시": "Taxi",
  "혼자": "Solo",
  "연인·친구": "Partner · friends",
  "아이와": "With kids",
  "부모님과": "With parents",
  "바다": "Sea",
  "카페": "Cafés",
  "맛집": "Local food",
  "역사·문화": "History · culture",
  "자연·산책": "Nature · walks",
  "자동차": "Car",
  "대중교통·도보": "Transit · walking",
  "일정 만들기": "Make my plan",
  "사장님이세요? 메뉴 입력으로 가게 등록": "Own a shop? Enter your menu to register (Korean)",
  // 결과 화면
  "조건 변경": "Edit choices",
  "비가 와요": "It's raining",
  "덜 걷고 싶어요": "Less walking",
  "여유롭게": "Relaxed",
  "더 알차게": "Pack more in",
  "무료 여행 가이드": "Free travel guide",
  "비 오면 어떡해?": "What if it rains?",
  "아이랑 가도 괜찮을까?": "Is it OK with kids?",
  "오늘 운영시간 알려줘": "Today's opening hours?",
  "예) 2일차에 바다 한 곳 더 넣어줘": "e.g. Add one more beach on day 2",
  "보내기": "Send",
  "{n}곳": "{n} places",
  "이동 {t}": "Travel {t}",
  "영업시간 충돌 {n}건": "{n} opening-hours conflicts",
  "영업시간·휴무 확인 완료": "Hours & closing days checked",
  "실제 도로 기준": "Real road times",
  "{n}일차": "Day {n}",
  " · 비 {p}%": " · rain {p}%",
  "조건에 맞는 장소가 없어요. 조건을 바꿔보세요.": "No places match. Try changing your choices.",
  "{start}에서 {mode} {min}분": "From {start}: {mode} {min} min",
  "{mode} {min}분": "{mode} {min} min",
  "실내": "Indoor",
  "길찾기": "Directions",
  "바꾸기": "Swap",
  // 분류·이동
  "식사": "Meal", "문화": "Culture", "자연": "Nature", "축제": "Festival",
  "점심": "Lunch", "저녁": "Dinner",
  "도보": "Walk", "차": "Drive", "버스": "Bus", "바로 옆": "Next door",
  // 운영시간
  "축제 기간 {a}–{b}": "Festival {a}–{b}",
  "상시 개방": "Always open",
  "가게별 상이 · 대체로 {a}–{b}": "Varies by shop · mostly {a}–{b}",
  "운영 {a}–{b}": "Open {a}–{b}",
  " · 주문 {t}까지": " · last order {t}",
  " · 입장 {t}까지": " · last entry {t}",
  " · 휴식 {r}": " · break {r}",
  // 축제
  "매년 {m}월 · 날짜 발표 전": "Every {m} · dates TBA",
  "일정에 넣었어요": "In your plan",
  "여행 기간의 강원 축제": "Gangwon festivals during your trip",
  "{n}개 더 보기": "Show {n} more",
  // 숙소
  "추천 숙소 · {n}박 내내": "Recommended stay · all {n} nights",
  "추천 숙소 · 1박": "Recommended stay · 1 night",
  " · 다른 선택: {o}": " · Other options: {o}",
  "네이버에서 찾기": "Search on Naver",
  "카카오맵": "Kakao Map",
  "예약 전 안심 체크": "Pre-booking check",
  "예약하려는 숙소 페이지의 가격, 취소·환불 규정, 후기를 그대로 붙여넣으세요": "Paste the price, cancellation policy and reviews from the lodging page you want to book",
  "확인": "Check",
  "확인 중…": "Checking…",
  "숙소 페이지 내용을 조금 더 붙여넣어 주세요": "Please paste a bit more of the lodging page",
  "안심": "OK", "주의": "Caution", "위험": "Risk",
  "취소·환불: ": "Cancellation: ", "가격: ": "Price: ", "후기: ": "Reviews: ",
  "예약 전에 물어볼 것: ": "Ask before booking: ",
  "숙소({name})로 · 약 {km}km": "To your stay ({name}) · about {km} km",
  "숙소 · {name}": "Stay · {name}",
  "이 지역 추천 숙소": "Places to stay in this area",
  // 출발지
  "출발": "Start",
  "출발지 바꾸기": "Change",
  "지금 위치에서": "From my location",
  "기본(권역 역·터미널)": "Default (station·terminal)",
  "출발지 검색 (예: 서울역, 경포, 동서울)": "Search a starting point (e.g. Seoul Station, Gyeongpo)",
  "첫날 출발 시각": "Departure on day 1",
  "자동": "Auto",
  "고른 출발지는 이 기기에 저장돼요. 자동: 가까우면 10시, 멀면(60km 넘게) 8시에 출발": "Your starting point is saved on this device. Auto: leave at 10:00 if nearby, 08:00 if over 60 km away",
  "{name} (기본)": "{name} (default)",
  "내 위치": "My location",
  "최근 출발지": "Recent",
  "검색 결과가 없어요": "No matches",
  "출발지를 {name}(으)로 정했어요": "Starting point set to {name}",
  "위치를 찾는 중…": "Finding your location…",
  // 예상 비용
  " · 약 {won}": " · about {won}",
  " · 택시 약 {won}": " · taxi about {won}",
  "예상 비용": "Estimated cost",
  "1인당 {r}": "{r} per person",
  "어른": "Adults",
  "어린이": "Children",
  "자동차 연료": "Fuel",
  "입장료": "Admission",
  "식사·카페": "Meals & cafés",
  "숙박": "Lodging",
  "명": " person(s)",
  "실": " room(s)",
  "강원 중형택시 요금(2024년 8월 조정)": "Gangwon taxi fares (Aug 2024)",
  "오피넷 전국 휘발유 평균(2026년 10월)": "Opinet national gasoline average (Oct 2026)",
  "{n}구간 · 택시 {cars}대 · {src}": "{n} rides · {cars} taxi(s) · {src}",
  " · 출발지에서 오는 먼 구간은 기차·버스 요금 별도": " · the long trip from your starting point (train/bus) is not included",
  "약 {km}km · 연비 {eff}km/L · {src}": "about {km} km · {eff} km/L · {src}",
  "{n}번 탑승 · 1회 {fare}": "{n} rides · {fare} each",
  " · 먼 구간 {n}번은 시외버스라 요금 확인 필요": " · {n} long ride(s) are intercity buses, check fares",
  "요금 확인된 {n}곳 (한국관광공사)": "{n} places with known fees (Korea Tourism Organization)",
  " · 요금 정보 없음: {names}": " · no fee info: {names}",
  "점심 {l} · 저녁 {d} · 카페 {c} (앱 가정: 1인 점심 {a}, 저녁 {b})": "{l} lunches · {d} dinners · {c} cafés (app assumption per person: lunch {a}, dinner {b})",
  "{n}박 · {units}{unit} · {type} (앱 가정: 평균 범위, 주말·성수기엔 더 비쌈)": "{n} night(s) · {units}{unit} · {type} (app assumption: typical range, higher on weekends and in peak season)",
  "집에서 강원까지 오가는 교통비, 주차·통행료, 쇼핑은 빠져 있어요. 식사·숙박은 앱이 정한 평균 범위라 실제와 다를 수 있어요.": "Not included: travel to and from Gangwon, parking and tolls, shopping. Meals and lodging use typical ranges set by the app and may differ.",
  "바다·호수 전망": "Sea/lake view",
  "{km}km": "{km} km away",
  "네이버": "Naver",
  "구글": "Google",
  "지도": "Map",
  "최저가 비교": "Compare prices",
  "이 지역 숙소 최저가 비교": "Compare lodging prices here",
  "한국관광공사 숙박 정보 기준 · 전망 표시는 관광공사 소개글에 적힌 곳만 · 최저가 비교는 여러 예약 사이트의 가격을 한 화면에 보여 줘요. 날짜를 고르면 그날 가장 싼 곳을 찾을 수 있어요": "From Korea Tourism Organization lodging data · views marked only when its description says so · Compare prices shows several booking sites side by side. Pick your dates to find the cheapest one",
  "카카오": "Kakao",
  "한국관광공사 숙박 정보 기준 · 전망 표시는 관광공사 소개글에 적힌 곳만 · 가격과 빈 방은 예약 사이트에서 확인하세요": "From Korea Tourism Organization lodging data · views marked only when its description says so · check prices and availability on booking sites",
  "숙소({name})": "Stay ({name})",
  // 혜택
  "이 일정으로 받는 혜택": "Benefits for this trip",
  "현장 환급 {n}원": "On-site refund ₩{n}",
  "일정에 포함 · 현장에서 받기": "In your plan · claim on site",
  "신청 가능 · {d} 마감": "Open · apply by {d}",
  "하반기 공고 확인 필요": "Check the second-half announcement",
  "증빙 {a}/{b}": "Proofs {a}/{b}",
  " {n}장": " ×{n}",
  "증빙 보관함 보기": "View saved proofs",
  "삭제": "Delete",
  "증빙을 보관함에 넣었어요": "Saved to your proofs",
  "저장 공간이 부족해요. 사진을 몇 장 지워주세요": "Storage is full. Please delete a few photos",
  "사진을 읽지 못했어요": "Couldn't read the photo",
  "입장권": "Ticket", "숙박 영수증": "Lodging receipt", "관광 소비 영수증": "Tourism spending receipt",
  "식당 영수증": "Restaurant receipt", "체험시설 이용 증빙": "Activity receipt", "관광지 인증사진 2곳 이상": "Photos at 2+ attractions",
  // 1박 전환
  "하룻밤 더하면": "If you stay one night",
  "볼 수 있는 곳": "More places",
  "+{n}곳": "+{n}",
  "밤 코스": "Evening",
  "{t}까지": "until {t}",
  "없음": "None",
  "숙소": "Stay",
  "밤 코스: ": "Evening: ",
  "둘째 날: ": "Day 2: ",
  "다음 날 축제: ": "Festivals next day: ",
  "받을 수 있는 혜택: ": "Benefits: ",
  "추가 비용: 숙박비({type})와 식사 2끼 · 숙박비는 날짜마다 달라 검색으로 확인하세요": "Extra cost: lodging ({type}) and 2 meals · lodging prices vary by date, so check when booking",
  "1박 2일로 바꾸기": "Switch to 2 days, 1 night",
  "1박 2일로 바꿨어요": "Switched to 2 days, 1 night",
  // 가게·특산물
  "사장님이 직접 등록한 가게": "Shops registered by their owners",
  "메뉴 {n}개 · 4개 언어": "{n} menu items · 4 languages",
  "집에서 다시 맛보기": "Taste it again at home",
  "{from}에서": "from {from}",
  "검색어 복사": "Copy search term",
  "{mall}(강원도 공식 쇼핑몰)에서 주문하기": "Order at {mall} (Gangwon's official online mall, Korean)",
  "\"{t}\" 복사했어요": "Copied \"{t}\"",
  "지난 {region} 여행에서 먹은 {items}": "From your last {region} trip: {items}",
  "집에서 다시 주문": "Reorder at home",
  // 지도
  "출": "S", "숙": "H",
  "내 위치": "My location",
  "위치를 사용할 수 없어요": "Location is not available",
  "위치 권한을 허용해 주세요": "Please allow location access",
  // 조작·알림
  "{name}(으)로 바꿨어요": "Swapped to {name}",
  "대신 갈 수 있는 곳이 없어 뺐어요": "No alternative fits, so it was removed",
  "생각 중": "Thinking",
  " ({names}은(는) 영업시간이나 동선이 맞지 않아 넣지 못했어요)": " (Couldn't add {names}: opening hours or the route don't fit)",
  " 영업시간을 다시 확인해 일정에 반영했어요.": " Opening hours re-checked and your plan updated.",
  " ({names}은(는) 이번 여행 지역에서 멀어 넣지 못했어요)": " (Couldn't add {names}: too far from this trip's area)",
  "강원 여행 일정": "Gangwon trip plan",
  "링크를 복사했어요": "Link copied",
  "비 예보가 있는 날은 실내 위주로 바꿨어요": "Rain is forecast, so those days now focus on indoor places",
  "AI에 연결되지 않아 간단 모드로 처리했어요": "AI is unavailable, so simple mode was used",
  "캘린더에 일정 {n}개를 넣었어요": "Added {n} events to your calendar",
  "이미 캘린더에 있는 일정이에요": "These events are already in your calendar",
  "캘린더 권한을 허용해 주세요": "Please allow calendar access",
  "일정을 넣을 캘린더가 없어요": "No calendar found to add events to",
  "캘린더에 넣지 못했어요": "Couldn't add to your calendar",
  "캘린더 파일을 받았어요. 파일을 열면 캘린더에 추가돼요": "Calendar file downloaded. Open it to add the events",
};

export function t(ko, vars) {
  const d = lang === "en" ? EN : lang === "ja" ? C?.JA : lang === "zh" ? C?.ZH : null;
  let s = d && Object.hasOwn(d, ko) ? d[ko] : ko;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
  return s;
}

/* ---------- 날짜·시간 ---------- */
const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];
const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];
export function dateLabel(ds) {
  const [y, m, d] = ds.split("-").map(Number);
  const w = new Date(y, m - 1, d).getDay();
  if (lang === "en") return `${WEEK_EN[w]}, ${MONTH_EN[m - 1]} ${d}`;
  if (lang === "ja") return `${m}月${d}日(${WEEK_JA[w]})`;
  if (lang === "zh") return `${m}月${d}日 周${WEEK_ZH[w]}`;
  return `${m}월 ${d}일 (${WEEK_KO[w]})`;
}
export function minutesLabel(min) {
  const h = Math.floor(min / 60), r = min % 60;
  if (lang === "en") return h ? `${h}h${r ? ` ${r}m` : ""}` : `${r} min`;
  if (lang === "ja") return h ? `${h}時間${r ? `${r}分` : ""}` : `${r}分`;
  if (lang === "zh") return h ? `${h}小时${r ? `${r}分钟` : ""}` : `${r}分钟`;
  return h ? `${h}시간${r ? ` ${r}분` : ""}` : `${r}분`;
}
export const monthsLabel = (months) => (lang === "en" ? months.map((m) => MONTH_EN[m - 1]).join("·") : months.join("·"));

/* ---------- 지역·숙소·혜택 (앱이 정한 이름이라 직접 번역) ---------- */
const REGION_EN = { gangneung: "Gangneung·Donghae", seorak: "Sokcho·Yangyang", chuncheon: "Chuncheon·Cheorwon", pyeongchang: "Pyeongchang·Jeongseon", wonju: "Wonju" };
const AREA_EN = {
  "경포·초당": "Gyeongpo·Chodang", "안목·남항진": "Anmok·Namhangjin", "강릉 시내": "Downtown Gangneung", "사천·주문진": "Sacheon·Jumunjin",
  "정동진": "Jeongdongjin", "구정·성산": "Gujeong·Seongsan", "동해 묵호·추암": "Donghae Mukho·Chuam", "삼척": "Samcheok",
  "속초 시내": "Downtown Sokcho", "설악산": "Seoraksan", "고성": "Goseong", "양양": "Yangyang", "인제": "Inje",
  "춘천 시내": "Downtown Chuncheon", "남이섬·김유정": "Nami Island·Kim Yu-jeong", "철원": "Cheorwon", "화천": "Hwacheon",
  "대관령": "Daegwallyeong", "오대산·진부": "Odaesan·Jinbu", "정선": "Jeongseon", "영월": "Yeongwol", "태백": "Taebaek",
  "원주 시내": "Downtown Wonju", "간현·지정": "Ganhyeon·Jijeong", "치악산": "Chiaksan", "횡성": "Hoengseong", "홍천": "Hongcheon", "양구": "Yanggu",
};
const BASE_EN = { "강릉역": "Gangneung Station", "속초시외버스터미널": "Sokcho Intercity Bus Terminal", "춘천역": "Chuncheon Station", "진부역": "Jinbu Station", "원주역": "Wonju Station" };
const LODGING_EN = {
  "l-gyeongpo": ["Gyeongpo", "Ocean-view hotels and resorts by Gyeongpo Beach and lake"],
  "l-anmok": ["Gangmun·Anmok", "Hotels and stylish stays right on the beach"],
  "l-gn-station": ["Gangneung Station·downtown", "Near the KTX station, easy by public transport"],
  "l-jeongdongjin": ["Jeongdongjin", "Watch the sunrise from your room"],
  "l-jumunjin": ["Jumunjin·Sacheon", "Quiet seaside pensions"],
  "l-mukho": ["Donghae Mukho", "Sea-view stays on the harbor hill"],
  "l-samcheok": ["Samcheok beaches", "Large resorts and beach pensions"],
  "l-sokcho": ["Sokcho beach·downtown", "Ocean-view hotels by the beach and stays near the terminal"],
  "l-seorakdong": ["Seorak-dong", "Resorts and condos at the Seoraksan entrance"],
  "l-yangyang": ["Yangyang Jukdo·Surfyy Beach", "Surf-town guesthouses and sea-view hotels"],
  "l-goseong": ["Goseong beaches", "Quiet beach resorts"],
  "l-inje": ["Inje", "Pensions by the valley stream"],
  "l-cc-city": ["Chuncheon Station·Myeong-dong", "Near the station and the dakgalbi street"],
  "l-uiam": ["Uiamho Lake", "Lake-view hotels"],
  "l-gangchon": ["Nami Island·Gangchon", "Resorts and riverside pensions"],
  "l-cheorwon": ["Cheorwon", "Stays near the Hantangang River"],
  "l-hwacheon": ["Hwacheon", "Bukhangang riverside pensions"],
  "l-yongpyong": ["Daegwallyeong·Yongpyong", "Ski resorts and condos"],
  "l-jinbu": ["Jinbu·Odaesan", "Near Jinbu Station, temple stays nearby"],
  "l-jeongseon": ["Jeongseon-eup", "Riverside pensions and hanok"],
  "l-gohan": ["Gohan·Sabuk", "Mountain-top resorts"],
  "l-yeongwol": ["Yeongwol", "Donggang River resorts and pensions"],
  "l-taebaek": ["Taebaek", "Downtown hotels"],
  "l-wj-city": ["Downtown Wonju", "Hotels near the station and terminal"],
  "l-jijeong": ["Wonju Jijeong-myeon", "Resorts next to Museum SAN"],
  "l-chiak": ["Chiaksan", "Pensions at the foot of the mountain"],
};
const TYPE_EN = { guesthouse: "Guesthouse", business: "Business hotel", ocean: "Hotel with a view", pension: "Pension", resort: "Resort·condo", hanok: "Hanok stay" };
const TYPE_KO_TO_KEY = { "게스트하우스": "guesthouse", "비즈니스호텔": "business", "전망 좋은 호텔": "ocean", "펜션": "pension", "리조트·콘도": "resort", "한옥스테이": "hanok" };
const REASON_EN = {
  guesthouse: "Affordable and easy to meet other solo travelers",
  business: "Clean and close to the station or terminal",
  ocean: "Sea or lake views from your window",
  pension: "Quiet, with room for a barbecue",
  resort: "Family facilities such as kitchens and pools",
  hanok: "Quiet and comfortable with heated ondol floors",
};
const BENEFIT_EN = {
  "b-soyang": { title: "Soyanggang Skywalk ticket refund", how: "Get your ₩2,000 ticket back as a ₩2,000 Chuncheon local gift voucher" },
  "b-hantan": { title: "Hantangang Jusangjeolli Trail voucher refund", how: "Get ₩5,000 of the ₩10,000 ticket back as a Cheorwon local gift voucher" },
  "b-hoengseong": { title: "Hoengseong Lake Trail ticket refund", how: "Get your ₩2,000 ticket back as a tourism gift voucher of the same amount" },
  "b-incentive": {
    title: "Benefit GO! Gangwon travel",
    how: "Visitors from outside Gangwon get ₩30,000 back for ₩60,000+ at registered lodging, and ₩10,000 for ₩50,000+ tourism spending, as mobile Gangwon gift vouchers",
    steps: ["Sign up for Gangwon Hyetaek Easy", "Get a Gangwon Life Resident card", "Verify receipts"],
    note: "Paid as mobile Gangwon gift vouchers (Bpay)",
  },
  "b-halfprice": {
    title: "Half-price travel (local vacation support)",
    how: "Get 50% of travel costs back as local gift vouchers (up to ₩100,000 per person, ₩200,000 for 2+ people)",
    steps: ["Apply and get approved before the trip", "Submit proofs after the trip", "Vouchers paid after review"],
    note: "Only card, cash-receipt or mobile payment records count (no simple receipts or bank transfers) · residents of that county and its neighbours can't apply (e.g. Pyeongchang excludes Gangneung, Yeongwol, Jeongseon, Hoengseong and Hongcheon residents) · rounds and application dates differ by county",
  },
};

// 언어별 표: 영어는 이 파일, 일본어·중국어는 i18n-cjk.js
const EN_TABLES = { REGION: REGION_EN, AREA: AREA_EN, BASE: BASE_EN, LODGING: LODGING_EN, TYPE: TYPE_EN, REASON: REASON_EN, BENEFIT: BENEFIT_EN };
const pick = (name) => (lang === "en" ? EN_TABLES[name] : lang === "ko" ? null : C?.[name]?.[lang]);
const T_REGION = "REGION", T_AREA = "AREA", T_BASE = "BASE", T_LODGING = "LODGING", T_TYPE = "TYPE", T_REASON = "REASON", T_BENEFIT = "BENEFIT";
export const regionLabel = (key, ko) => pick(T_REGION)?.[key] || ko;
export const areaName = (ko) => pick(T_AREA)?.[ko] || ko;
export const lodgingName = (l) => pick(T_LODGING)?.[l.id]?.[0] || l.name;
export const lodgingDesc = (l) => pick(T_LODGING)?.[l.id]?.[1] || l.desc;
export const typeLabel = (type, ko) => pick(T_TYPE)?.[type] || ko;
export const typeLabelFromKo = (ko) => pick(T_TYPE)?.[TYPE_KO_TO_KEY[ko]] || ko;
export const lodgingReason = (l) => pick(T_REASON)?.[l.type] || l.reason;
export function benefitText(b, field) {
  return pick(T_BENEFIT)?.[b.id]?.[field] ?? b[field];
}
export const SOUVENIR_EN = { "강릉 커피 원두": "Gangneung coffee beans", "초당두부": "Chodang tofu", "강릉 닭강정": "Gangneung sweet-crispy chicken", "주문진 건오징어": "Jumunjin dried squid", "묵호 건어물": "Mukho dried seafood",
    "속초 오징어순대": "Sokcho squid sundae", "속초 건어물": "Sokcho dried seafood", "용대리 황태": "Yongdae-ri dried pollack", "양양 송이": "Yangyang pine mushrooms", "춘천 닭갈비": "Chuncheon dakgalbi",
    "춘천 막국수": "Chuncheon buckwheat noodles", "춘천 감자빵": "Chuncheon potato bread", "대관령 황태": "Daegwallyeong dried pollack", "정선 곤드레나물": "Jeongseon gondre greens", "영월 메밀전병": "Yeongwol buckwheat crepes",
    "봉평 메밀": "Bongpyeong buckwheat", "태백 한우": "Taebaek hanwoo beef", "횡성 한우": "Hoengseong hanwoo beef" };
// 특산물: 외국어 화면은 번역 + 한국어(강원더몰에서 그대로 검색하는 말)
export const souvenirName = (ko) => { const s = lang === "en" ? SOUVENIR_EN[ko] : C?.SOUVENIR?.[lang]?.[ko]; return lang === "ko" || !s ? ko : `${s} (${ko})`; };
// 출발점: 기준 역 또는 "숙소(경포)"
export function startName(start, lodging) {
  if (lang === "ko") return start.name;
  if (start.nameEn) return start.nameEn;
  if (start.name.startsWith("숙소") && lodging) return t("숙소({name})", { name: lodgingName(lodging) });
  return pick(T_BASE)?.[start.name] || start.name;
}

/* ---------- 장소 영문 데이터 ---------- */
let dataEn = {};
let dataEnReady = null;
// 화면 언어에 필요한 외국어 자료를 받는다: 영어 장소 자료(영어·일본어·중국어), 일본어·중국어 표(그 두 언어만)
export function loadLang(fetcher = fetch) {
  return Promise.all([lang !== "ko" && loadDataEn(fetcher), (lang === "ja" || lang === "zh") && loadCJK()]);
}
export function loadDataEn(fetcher = fetch) {
  return (dataEnReady ??= fetcher("data-en.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => { dataEn = j || {}; namesEnCache = null; }));
}
// 일본어·중국어: 장소는 knowledge-intl.js의 이름, 축제는 i18n-cjk.js의 이름 (없으면 영어, 그다음 한국어)
export const placeName = (p) => {
  if (lang === "ko") return p.name;
  if (lang === "en") return dataEn[p.id]?.name || p.name;
  return C?.[lang === "ja" ? "NAMES_JA" : "NAMES_ZH"]?.[p.id] || C?.FEST?.[lang]?.[p.id] || dataEn[p.id]?.name || p.name;
};
// 무료 간단 모드 가이드가 영어 질문 속 장소 이름을 알아듣도록
let namesEnCache = null; // 같은 객체를 돌려줘야 가이드가 영어 이름 색인을 다시 만들지 않는다
export const namesEn = () => (namesEnCache ??= Object.fromEntries(Object.entries(dataEn).map(([id, v]) => [id, v.name])));
const firstSentence = (s) => (s.match(/^.*?。/) || [s])[0];
export const placeDesc = (p) => {
  if (lang === "ko") return p.desc;
  if (lang === "en") return dataEn[p.id]?.desc || p.desc;
  const tip = C?.[lang === "ja" ? "TIPS_JA" : "TIPS_ZH"]?.[p.id];
  return tip ? firstSentence(tip) : C?.FEST_DESC?.[lang]?.[p.id] || p.desc;
};

/* ---------- index.html의 고정 문구 ----------
   data-i18n: 내용(innerHTML), data-i18n-ph: placeholder, data-i18n-title: title·aria-label.
   처음 바꿀 때 한국어 원문을 data-ko에 보관해 두고, 그 원문을 키로 찾는다. */
export function applyStatic(root = document) {
  document.documentElement.lang = HTML_LANG[lang];
  if (lang === "ko" || lang === "en" || C) document.documentElement.classList.remove("i18n-wait"); // 일본어·중국어는 표를 받은 뒤에 보인다
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.dataset.ko ??= el.innerHTML.trim();
    el.innerHTML = t(el.dataset.ko);
  });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.dataset.koPh ??= el.placeholder;
    el.placeholder = t(el.dataset.koPh);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.dataset.koTitle ??= el.title || el.getAttribute("aria-label") || "";
    el.title = t(el.dataset.koTitle);
    el.setAttribute("aria-label", el.title);
  });
  document.title = t("오늘강원");
  root.querySelectorAll("[data-lang]").forEach((b) => {
    const on = b.dataset.lang === lang;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
  });
}
