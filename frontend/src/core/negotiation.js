// Simulated multi-bank negotiation, event by event.
//
// ================= THE SEAM =================
// `startNegotiation(bands, banks, onEvent)` is the only thing StageBanks calls.
// It returns { cancel }. To make the agents real, replace the body of
// startNegotiation with an EventSource on GET /api/applications/:id/events and
// forward each server event to onEvent unchanged. Keep the event shapes below;
// the UI is written against them.
//
// Event shapes (all carry `t`, seconds since start, and most carry `bankId`):
//   { type:'sent',       bankId, text }               ranges delivered to the bank
//   { type:'thinking',   bankId, text }               the bank's model is reasoning (streamed text)
//   { type:'request',    bankId, fields:[...], text } bank asked for extra data
//   { type:'blocked',    bankId, fields:[...], text } guard refused it (code, not model)
//   { type:'quote',      bankId, offer, sealed:true } sealed quote received
//   { type:'round2',     bestTotal, text }            coordinator opened round 2
//   { type:'improve',    bankId, offer, delta, text }
//   { type:'hold',       bankId, text }
//   { type:'done',       ranking:[bankId...] }
//
// In the model-driven version the bank's own model decides `improve` vs `hold`
// and writes `text`; code still computes `offer` from the rate sheet and clamps
// it at the floor. The AI proposes; code decides.
// =============================================

import { MARKET_BASE_RATE } from './banks.js';
import { ALLOWED_BAND_KEYS } from './bands.js';
import { rand, resetSeed } from './demo.js';

const bandLo = (label) => (label ? Number(String(label).replace(/[^0-9.–-]/g, '').split(/[–-]/)[0]) : null);

function ficoAdj(bands) {
  const lo = bandLo(bands.ficoBand);
  if (lo == null) return 1.0;
  if (lo >= 780) return -0.25;
  if (lo >= 740) return 0;
  if (lo >= 700) return 0.375;
  if (lo >= 660) return 0.875;
  return 1.75;
}
function ltvAdj(bands) {
  const lo = bandLo(bands.ltvBand);
  if (lo == null) return 0;
  if (lo >= 90) return 0.5;
  if (lo >= 80) return 0.25;
  return 0;
}
function dtiAdj(bands) {
  const lo = bandLo(bands.dtiBand);
  if (lo == null) return 0.25;
  if (lo >= 45) return 0.75;
  if (lo >= 40) return 0.375;
  return 0;
}

function monthlyPayment(principal, ratePct, months) {
  const r = ratePct / 100 / 12;
  return r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Total cost over the user's stay horizon: interest paid + points + fees. */
export function totalCost(offer, principal, months, horizonYears) {
  const pay = monthlyPayment(principal, offer.rate, months);
  const r = offer.rate / 100 / 12;
  let bal = principal;
  let interest = 0;
  const n = Math.min(months, horizonYears * 12);
  for (let i = 0; i < n; i++) {
    const int = bal * r;
    interest += int;
    bal -= pay - int;
  }
  return Math.round(interest + (offer.points / 100) * principal + offer.fees);
}

function priceFromSheet(bank, bands) {
  const rate = MARKET_BASE_RATE + bank.spread + ficoAdj(bands) + ltvAdj(bands) + dtiAdj(bands) + (bands.derogatory ? 0.5 : 0) + (bands.occupancy === 'Investment' ? 0.625 : 0);
  return { rate: round8(rate), points: bank.points, fees: bank.fees, floor: round8(rate - bank.floorDelta) };
}
const round8 = (x) => Math.round(x * 8) / 8;

/** Guard: any key outside the allowlist is refused. Pure code, no model. */
export function guardRequest(fields) {
  const refused = fields.filter((f) => !ALLOWED_BAND_KEYS.includes(f));
  return { ok: refused.length === 0, refused };
}

export function describeBands(bands) {
  const bits = [];
  if (bands.ficoBand) bits.push(`credit ${bands.ficoBand} (bureau-signed)`);
  if (bands.dtiBand) bits.push(`debt vs. income ${bands.dtiBand}`);
  if (bands.ltvBand) bits.push(`loan vs. value ${bands.ltvBand}`);
  if (bands.assetBand) bits.push(`assets ${bands.assetBand}`);
  if (bands.loanBand) bits.push(`loan ${bands.loanBand}`);
  if (bands.occupancy) bits.push(bands.occupancy.toLowerCase());
  if (bands.termMonths) bits.push(`${bands.termMonths} months`);
  return bits.join(' · ');
}

export function startNegotiation(bands, banks, onEvent, opts = {}) {
  const principal = opts.principal || 500000;
  const mandate = opts.mandate || {};
  const ask = mandate.noPrepayPenalty === 'Required' ? 'Drop the prepayment penalty.' : mandate.priority === 'Least cash at closing' ? 'Offer a zero-points version.' : mandate.priority === 'Lowest monthly payment' ? 'Lower the rate, points are acceptable.' : 'Match the best fee total.';
  const months = bands.termMonths || 360;
  const horizon = opts.horizonYears || 7;
  resetSeed();
  const timers = [];
  let t = 0;
  const at = (delay, ev) => { t += delay; timers.push(setTimeout(() => onEvent({ t: Math.round(t / 100) / 10, ...ev }), t)); };
  const offers = {};
  const sheets = {};

  // Round 1: ranges go out to everyone at once.
  banks.forEach((b) => at(0, { type: 'sent', bankId: b.id, text: `Received applicant code ${bands.token}: ${describeBands(bands)}. No name, no exact figures.` }));

  const order = [...banks].sort(() => rand() - 0.5);
  order.forEach((b, i) => {
    const sheet = priceFromSheet(b, bands);
    sheets[b.id] = sheet;
    at(400 + i * 250, { type: 'thinking', bankId: b.id, text: `Reading the ranges against our rate sheet. Credit band ${bands.ficoBand} qualifies for our ${b.persona.split(',')[0]} tier.` });
    if (b.greedy) {
      at(900, { type: 'request', bankId: b.id, fields: ['exactIncome', 'assets', 'employer'], text: 'To finalize pricing we need the applicant\'s exact annual income, a statement of assets, and the employer name.' });
      const g = guardRequest(['exactIncome', 'assets', 'employer']);
      at(500, { type: 'blocked', bankId: b.id, fields: g.refused, text: `Guard refused: ${g.refused.join(', ')} are not in the allowed list. Quote on ranges or withdraw.` });
      at(900, { type: 'thinking', bankId: b.id, text: 'Quoting on ranges only. We will keep the headline rate low and recover margin in points and fees.' });
    }
    const offer = { rate: sheet.rate, points: sheet.points, fees: sheet.fees, prepayPenalty: b.prepayPenalty, closeDays: b.closeDays };
    offer.monthly = Math.round(monthlyPayment(principal, offer.rate, months));
    offer.total = totalCost(offer, principal, months, horizon);
    offers[b.id] = offer;
    at(650, { type: 'quote', bankId: b.id, offer, sealed: true, text: `Sealed quote: ${offer.rate.toFixed(3)}%, ${offer.points} points, $${offer.fees.toLocaleString()} fees.` });
  });

  // Round 2: one number, nothing else.
  at(1500, (() => {
    const best = Math.min(...Object.values(offers).map((o) => o.total));
    return { type: 'round2', bestTotal: best, ask, text: `Round 2. Each bank hears one number, the best competing ${horizon}-year total cost of $${best.toLocaleString()}, and one ask from your agent: "${ask}" Not who offered it. Nothing new about you.` };
  })());

  order.forEach((b, i) => {
    const sheet = sheets[b.id];
    const cur = offers[b.id];
    const best = Math.min(...Object.values(offers).map((o) => o.total));
    const canCut = cur.rate - 0.125 >= sheet.floor;
    const dropPrepay = b.prepayPenalty && mandate.noPrepayPenalty === 'Required' && !b.greedy;
    const wants = cur.total > best && canCut && !b.greedy && rand() > 0.3;
    at(500 + i * 200, { type: 'thinking', bankId: b.id, text: wants ? `We are $${(cur.total - best).toLocaleString()} above the best offer. Our floor allows one more cut.` : cur.rate - 0.125 < sheet.floor ? 'We are at our floor. Code will not let us go lower.' : 'Holding. The margin is where we want it.' });
    if (wants) {
      const improved = { ...cur, rate: round8(Math.max(sheet.floor, cur.rate - 0.25)), prepayPenalty: dropPrepay ? false : cur.prepayPenalty };
      improved.monthly = Math.round(monthlyPayment(principal, improved.rate, months));
      improved.total = totalCost(improved, principal, months, horizon);
      const delta = cur.total - improved.total;
      offers[b.id] = improved;
      at(500, { type: 'improve', bankId: b.id, offer: improved, delta, text: `Improved to ${improved.rate.toFixed(3)}%${dropPrepay ? ' and dropped the prepayment penalty' : ''}. That lowers your ${horizon}-year cost by $${delta.toLocaleString()}.` });
    } else if (dropPrepay) {
      const partial = { ...cur, prepayPenalty: false };
      offers[b.id] = partial;
      at(350, { type: 'improve', bankId: b.id, offer: partial, delta: 0, text: 'We hold the rate but will drop the prepayment penalty.' });
    } else {
      at(350, { type: 'hold', bankId: b.id, text: cur.rate - 0.125 < sheet.floor ? 'We are at our floor and cannot improve.' : 'We will hold our current offer.' });
    }
  });

  at(1200, (() => ({ type: 'done', get ranking() { return Object.entries(offers).sort((a, b) => a[1].total - b[1].total).map(([id]) => id); }, offers })) ());

  return { cancel: () => timers.forEach(clearTimeout) };
}
