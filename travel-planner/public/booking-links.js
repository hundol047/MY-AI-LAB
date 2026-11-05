// 실제 재고·요금은 플랫폼에서 확인한다. 숙소명과 여행 조건을 직접 전달한다.
export function bookingLinks(query, input, people, lang = 'ko') {
  const dates = /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') && input.days > 1;
  const end = dates ? new Date(`${input.date}T00:00:00Z`) : null;
  if (end) end.setUTCDate(end.getUTCDate() + input.days - 1);
  const checkout = end?.toISOString().slice(0, 10);
  const adults = Math.max(1, Number(people.adults) || 1), kids = Math.max(0, Number(people.kids) || 0);
  const booking = new URL('https://www.booking.com/searchresults.html');
  booking.search = new URLSearchParams({ss:query,lang:({ko:'ko',en:'en-us',ja:'ja',zh:'zh-cn'})[lang]||'ko',group_adults:String(adults),group_children:String(kids),no_rooms:'1',order:'price',...(dates?{checkin:input.date,checkout}:{})});
  const agoda = new URL('https://www.agoda.com/search');
  agoda.search = new URLSearchParams({textToSearch:query,adults:String(adults),children:String(kids),rooms:'1',...(dates?{checkIn:input.date,checkOut:checkout}:{})});
  return [{name:'Booking.com',url:booking.href},{name:'Agoda',url:agoda.href}];
}

// Rank only by capabilities expressed by these links, not unobserved prices,
// inventory, commissions or assumed platform strengths for a traveller type.
export function recommendBooking(query, input, people, lang = 'ko') {
  const links = bookingLinks(query, input, people, lang);
  const primary = links.find(link => new URL(link.url).searchParams.get('order') === 'price');
  return {
    primary,
    alternatives: links.filter(link => link !== primary),
    reason: '낮은 가격순 검색과 화면 언어를 함께 전달할 수 있어 먼저 추천해요.',
    dates: { checkin: new URL(primary.url).searchParams.get('checkin'), checkout: new URL(primary.url).searchParams.get('checkout') },
    adults: Math.max(1, Number(people.adults) || 1),
    kids: Math.max(0, Number(people.kids) || 0),
  };
}
