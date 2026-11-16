// 여행 경비 나누기: 누가 얼마를 냈는지 적으면 "누가 누구에게 얼마 보내면 끝나는지"를 가장 적은 송금으로 계산한다.
// expenses: [{ payer: 이름, amount: 원, for?: [이름…] (없으면 모두) }]
export function settle(members, expenses, unit = 10) {
  const bal = Object.fromEntries(members.map((m) => [m, 0]));
  let total = 0;
  for (const e of expenses) {
    const amt = Math.round(Number(e.amount) || 0);
    if (!amt || !(e.payer in bal)) continue;
    const who = (e.for?.length ? e.for : members).filter((m) => m in bal);
    if (!who.length) continue;
    total += amt;
    bal[e.payer] += amt;
    const share = amt / who.length;
    for (const m of who) bal[m] -= share;
  }
  const give = Object.entries(bal).filter(([, v]) => v < -0.5).map(([m, v]) => ({ m, v: -v })).sort((a, b) => b.v - a.v);
  const get = Object.entries(bal).filter(([, v]) => v > 0.5).map(([m, v]) => ({ m, v })).sort((a, b) => b.v - a.v);
  const moves = [];
  let i = 0, j = 0;
  while (i < give.length && j < get.length) {
    const x = Math.min(give[i].v, get[j].v);
    const amt = Math.ceil(x / unit - 1e-9) * unit; // 낸 사람이 손해 보지 않게 올림
    if (amt > 0) moves.push({ from: give[i].m, to: get[j].m, amount: amt });
    give[i].v -= x; get[j].v -= x;
    if (give[i].v < 0.5) i++;
    if (get[j].v < 0.5) j++;
  }
  const paid = Object.fromEntries(members.map((m) => [m, expenses.filter((e) => e.payer === m).reduce((a, e) => a + (Number(e.amount) || 0), 0)]));
  return { total, perHead: members.length ? Math.round(total / members.length) : 0, paid, moves };
}
