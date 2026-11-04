// 출발지 검색용 주요 출발지 (강원 밖에서 오는 사람이 많이 출발하는 역·터미널·공항).
// 강원 안은 data.js의 권역 기준점·숙소 지역·장소로도 검색된다. 좌표는 건물 대표 지점(수백 m 오차 가능).
export const ORIGINS = [
  { name: "서울역", nameEn: "Seoul Station", lat: 37.5547, lng: 126.9707 },
  { name: "청량리역", nameEn: "Cheongnyangni Station", lat: 37.5804, lng: 127.0470 },
  { name: "상봉역", nameEn: "Sangbong Station", lat: 37.5965, lng: 127.0852 },
  { name: "동서울종합터미널", nameEn: "Dong Seoul Bus Terminal", lat: 37.5345, lng: 127.0940 },
  { name: "서울고속버스터미널", nameEn: "Seoul Express Bus Terminal", lat: 37.5050, lng: 127.0046 },
  { name: "인천국제공항", nameEn: "Incheon International Airport", lat: 37.4491, lng: 126.4505 },
  { name: "김포국제공항", nameEn: "Gimpo International Airport", lat: 37.5626, lng: 126.8013 },
  { name: "양양국제공항", nameEn: "Yangyang International Airport", lat: 38.0613, lng: 128.6690 },
];
