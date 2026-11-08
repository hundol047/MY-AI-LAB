// 일출·일몰 시각 (NOAA 근사식, 오차 1~2분). 인터넷 없이 날짜와 좌표로 계산한다. 한국 시간(UTC+9) "HH:MM"
export function sunTimes(dateStr, lat, lng) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;
  const g = ((2 * Math.PI) / (y % 4 === 0 ? 366 : 365)) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const r = Math.PI / 180, phi = lat * r;
  const cosH = Math.cos(90.833 * r) / (Math.cos(phi) * Math.cos(decl)) - Math.tan(phi) * Math.tan(decl);
  if (cosH > 1 || cosH < -1) return null;
  const ha = Math.acos(cosH) / r;
  const fmt = (min) => { const t = Math.round(min + 540 + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  return { rise: fmt(720 - 4 * (lng + ha) - eq), set: fmt(720 - 4 * (lng - ha) - eq) };
}
