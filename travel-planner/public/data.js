// 강릉 장소 데이터
// hours: [열림, 닫힘] (24시간제 "HH:MM"), closed: 휴무 요일 (0=일 ... 6=토)
// stay: 권장 체류(분), walk: 걷는 양 1~3, pop: 인기도 1~3
// tags: kids(아이 동반 적합), senior(부모님 동반 적합), night(저녁에 좋음)

export const BASE = { name: "강릉역", lat: 37.7643, lng: 128.8996 };

export const AREAS = {
  gyeongpo: { name: "경포·초당", lat: 37.795, lng: 128.902 },
  anmok: { name: "안목·남항진", lat: 37.770, lng: 128.948 },
  downtown: { name: "강릉 시내", lat: 37.756, lng: 128.897 },
  north: { name: "사천·주문진", lat: 37.870, lng: 128.845 },
  south: { name: "정동진", lat: 37.690, lng: 129.025 },
  inland: { name: "구정·성산", lat: 37.725, lng: 128.845 },
};

export const PLACES = [
  // 바다
  { id: "gyeongpo-beach", name: "경포해변", cat: "sea", area: "gyeongpo", lat: 37.8055, lng: 128.9087, hours: ["06:00", "22:00"], closed: [], stay: 50, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior", "night"], wiki: "경포해수욕장", desc: "넓은 백사장과 소나무숲" },
  { id: "gangmun-beach", name: "강문해변", cat: "sea", area: "gyeongpo", lat: 37.7953, lng: 128.9180, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 2, tags: ["kids", "senior", "night"], wiki: "강문해수욕장", desc: "솟대다리와 포토존" },
  { id: "anmok-beach", name: "안목해변", cat: "sea", area: "anmok", lat: 37.7720, lng: 128.9478, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 3, tags: ["kids", "senior", "night"], wiki: "안목해변", desc: "커피거리 앞 바다" },
  { id: "namhangjin-beach", name: "남항진해변", cat: "sea", area: "anmok", lat: 37.7676, lng: 128.9531, hours: ["06:00", "22:00"], closed: [], stay: 30, indoor: false, walk: 1, pop: 1, tags: ["senior"], wiki: "남항진해수욕장", desc: "솔바람다리와 조용한 해변" },
  { id: "sacheon-beach", name: "사천해변", cat: "sea", area: "north", lat: 37.8420, lng: 128.8762, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "사천해수욕장", desc: "물이 맑고 한적한 해변" },
  { id: "yeongjin-beach", name: "영진해변 도깨비 촬영지", cat: "sea", area: "north", lat: 37.8716, lng: 128.8410, hours: ["06:00", "21:00"], closed: [], stay: 30, indoor: false, walk: 1, pop: 2, tags: [], wiki: "영진해수욕장", desc: "방파제 포토 스팟" },
  { id: "hyangho-beach", name: "향호해변 버스정류장", cat: "sea", area: "north", lat: 37.9135, lng: 128.8105, hours: ["06:00", "21:00"], closed: [], stay: 30, indoor: false, walk: 1, pop: 2, tags: [], wiki: "향호해수욕장", desc: "앨범 촬영지 정류장 세트" },
  { id: "jeongdongjin", name: "정동진해변", cat: "sea", area: "south", lat: 37.6905, lng: 129.0340, hours: ["05:00", "22:00"], closed: [], stay: 50, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "정동진역", desc: "바다와 가장 가까운 기차역" },
  { id: "sea-trail", name: "정동심곡 바다부채길", cat: "nature", area: "south", lat: 37.6866, lng: 129.0446, hours: ["09:00", "16:30"], closed: [], stay: 80, indoor: false, walk: 3, pop: 3, tags: [], wiki: "정동심곡바다부채길", desc: "해안 절벽을 따라 걷는 2.9km 탐방로" },

  // 카페
  { id: "anmok-coffee", name: "안목 커피거리", cat: "cafe", area: "anmok", lat: 37.7727, lng: 128.9470, hours: ["10:00", "22:00"], closed: [], stay: 60, indoor: true, walk: 1, pop: 3, tags: ["kids", "senior", "night"], wiki: "안목해변", desc: "오션뷰 카페 30여 곳" },
  { id: "terarosa", name: "테라로사 커피공장", cat: "cafe", area: "inland", lat: 37.7158, lng: 128.8935, hours: ["09:00", "21:00"], closed: [], stay: 60, indoor: true, walk: 1, pop: 3, tags: ["senior"], wiki: "테라로사", desc: "로스터리와 커피 박물관" },
  { id: "bohemian", name: "보헤미안 박이추 커피", cat: "cafe", area: "north", lat: 37.8632, lng: 128.8480, hours: ["09:00", "19:00"], closed: [], stay: 50, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "박이추", desc: "1세대 바리스타의 핸드드립" },
  { id: "toetmaru", name: "툇마루", cat: "cafe", area: "gyeongpo", lat: 37.7920, lng: 128.9140, hours: ["10:00", "19:00"], closed: [], stay: 45, indoor: true, walk: 1, pop: 2, tags: [], wiki: "초당동 (강릉시)", desc: "흑임자 라테로 유명한 초당 카페" },

  // 맛집·시장 (식사)
  { id: "chodang-tofu", group: "tofu", name: "초당순두부마을", cat: "food", area: "gyeongpo", lat: 37.7905, lng: 128.9150, hours: ["07:00", "20:00"], closed: [], stay: 60, indoor: true, walk: 1, pop: 3, tags: ["kids", "senior"], wiki: "초당두부", desc: "바닷물로 굳힌 초당두부" },
  { id: "jjamppong-tofu", group: "tofu", name: "짬뽕순두부 거리", cat: "food", area: "gyeongpo", lat: 37.7898, lng: 128.9128, hours: ["08:00", "19:00"], closed: [], stay: 60, indoor: true, walk: 1, pop: 2, tags: [], wiki: "초당동 (강릉시)", desc: "매콤한 짬뽕순두부" },
  { id: "central-market", name: "강릉중앙시장", cat: "food", area: "downtown", lat: 37.7545, lng: 128.8990, hours: ["09:00", "21:00"], closed: [], stay: 70, indoor: true, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "강릉중앙시장", desc: "닭강정·장칼국수·감자전" },
  { id: "jumunjin-market", name: "주문진수산시장", cat: "food", area: "north", lat: 37.8930, lng: 128.8290, hours: ["08:00", "20:00"], closed: [], stay: 70, indoor: true, walk: 2, pop: 3, tags: ["senior"], wiki: "주문진수산시장", desc: "제철 회와 해산물" },
  { id: "sacheon-mulhoe", name: "사천진항 물회", cat: "food", area: "north", lat: 37.8433, lng: 128.8752, hours: ["10:00", "20:00"], closed: [], stay: 60, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "사천진항", desc: "항구 앞 물회 골목" },
  { id: "jeongdongjin-food", name: "정동진 먹거리 골목", cat: "food", area: "south", lat: 37.6920, lng: 129.0320, hours: ["09:00", "20:00"], closed: [], stay: 60, indoor: true, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "정동진", desc: "역 앞 식당가" },
  { id: "anmok-hoe", name: "남항진 횟집거리", cat: "food", area: "anmok", lat: 37.7690, lng: 128.9515, hours: ["11:00", "21:00"], closed: [], stay: 70, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "남항진해수욕장", desc: "바다 보며 먹는 회" },

  // 역사·문화
  { id: "ojukheon", name: "오죽헌", cat: "culture", area: "gyeongpo", lat: 37.7792, lng: 128.8783, hours: ["09:00", "18:00"], closed: [], stay: 60, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "오죽헌", desc: "율곡 이이가 태어난 집" },
  { id: "seongyojang", name: "선교장", cat: "culture", area: "gyeongpo", lat: 37.7865, lng: 128.8838, hours: ["09:00", "18:00"], closed: [], stay: 50, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "강릉 선교장", desc: "300년 된 사대부 고택" },
  { id: "gyeongpodae", name: "경포대", cat: "culture", area: "gyeongpo", lat: 37.7955, lng: 128.8965, hours: ["09:00", "18:00"], closed: [], stay: 30, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "경포대", desc: "경포호를 내려다보는 누각" },
  { id: "chamsori", name: "참소리축음기·에디슨과학박물관", cat: "culture", area: "gyeongpo", lat: 37.7963, lng: 128.8978, hours: ["10:00", "17:00"], closed: [], stay: 70, indoor: true, walk: 1, pop: 2, tags: ["kids", "senior"], wiki: "참소리축음기·에디슨 과학박물관", desc: "축음기와 에디슨 발명품 전시" },
  { id: "heo-park", name: "허균·허난설헌 기념공원", cat: "culture", area: "gyeongpo", lat: 37.7915, lng: 128.9070, hours: ["09:00", "18:00"], closed: [1], stay: 40, indoor: false, walk: 2, pop: 1, tags: ["senior"], wiki: "허균·허난설헌 기념공원", desc: "솔숲 속 생가터와 기념관" },
  { id: "arte", name: "아르떼뮤지엄 강릉", cat: "culture", area: "gyeongpo", lat: 37.7870, lng: 128.9020, hours: ["10:00", "20:00"], closed: [], stay: 80, indoor: true, walk: 1, pop: 3, tags: ["kids"], wiki: "아르떼뮤지엄", desc: "몰입형 미디어아트 전시" },
  { id: "gwana", name: "강릉대도호부 관아", cat: "culture", area: "downtown", lat: 37.7538, lng: 128.8957, hours: ["09:00", "18:00"], closed: [], stay: 30, indoor: false, walk: 1, pop: 1, tags: ["senior"], wiki: "강릉대도호부 관아", desc: "고려~조선 관청 건물" },
  { id: "wolhwa", name: "월화거리", cat: "culture", area: "downtown", lat: 37.7575, lng: 128.8975, hours: ["00:00", "23:59"], closed: [], stay: 40, indoor: false, walk: 2, pop: 2, tags: ["kids", "senior", "night"], wiki: "월화거리", desc: "옛 철길 위 산책로와 야시장" },
  { id: "haslla", name: "하슬라아트월드", cat: "culture", area: "south", lat: 37.7110, lng: 129.0080, hours: ["09:00", "18:00"], closed: [], stay: 90, indoor: true, walk: 2, pop: 2, tags: ["kids"], wiki: "하슬라아트월드", desc: "바다 언덕 위 미술관" },
  { id: "time-museum", name: "정동진 시간박물관", cat: "culture", area: "south", lat: 37.6895, lng: 129.0365, hours: ["10:00", "18:00"], closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "정동진", desc: "기차 객차 안 시계 박물관" },

  // 자연·산책
  { id: "gyeongpo-lake", name: "경포호 둘레길", cat: "nature", area: "gyeongpo", lat: 37.7960, lng: 128.9030, hours: ["00:00", "23:59"], closed: [], stay: 50, indoor: false, walk: 2, pop: 2, tags: ["kids", "senior", "night"], wiki: "경포호", desc: "평지 4.3km 호수 산책로" },
  { id: "gasiyeon", name: "가시연습지", cat: "nature", area: "gyeongpo", lat: 37.7990, lng: 128.8990, hours: ["00:00", "23:59"], closed: [], stay: 30, indoor: false, walk: 1, pop: 1, tags: ["senior"], wiki: "경포호", desc: "데크길 따라 걷는 습지" },
  { id: "solhyang", name: "강릉솔향수목원", cat: "nature", area: "inland", lat: 37.7290, lng: 128.8320, hours: ["09:00", "18:00"], closed: [1], stay: 70, indoor: false, walk: 3, pop: 1, tags: ["kids"], wiki: "강릉솔향수목원", desc: "금강소나무 숲 계곡길" },
  { id: "jumunjin-lighthouse", name: "주문진등대", cat: "nature", area: "north", lat: 37.8995, lng: 128.8295, hours: ["09:00", "18:00"], closed: [], stay: 25, indoor: false, walk: 2, pop: 1, tags: [], wiki: "주문진등대", desc: "강원 최초의 등대" },
  { id: "songjeong", name: "송정 해송숲", cat: "nature", area: "anmok", lat: 37.7785, lng: 128.9370, hours: ["00:00", "23:59"], closed: [], stay: 40, indoor: false, walk: 2, pop: 1, tags: ["senior"], wiki: "송정해수욕장 (강릉)", desc: "해변 따라 이어진 솔숲길" },
];
