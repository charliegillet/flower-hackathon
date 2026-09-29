// Live negotiation on Flower: the same event shapes as the simulated `startNegotiation`
// in negotiation.js, but every event comes from a real Flower run. A SuperLink
// coordinator plus one SuperNode per bank, each with its own private rate sheet and
// model, relayed by the backend (/api/flower).
//
// Only `bands` (the sealed ranges) and the stay horizon leave the browser. The horizon
// goes to the coordinator for ranking only; banks never receive it.

import { flower } from '../api.js';
import { describeBands } from './negotiation.js';

const money = (v) => `$${Math.round(v).toLocaleString()}`;

function toOffer(q) {
  return { rate: q.rate, points: Math.round(q.points * 1000) / 1000, fees: Math.round(q.fees), monthly: Math.round(q.monthly_pi), total: Math.round(q.total_cost) };
}

/** Stateful adapter: one Flower `bq.*` event in, zero or more UI events out. */
export function createAdapter(bands) {
  const nodeToBank = {};
  const pendingImprove = {};
  let narrative = '';

  return function adapt(e) {
    const t = typeof e.ts === 'number' ? Math.round(e.ts * 10) / 10 : 0;
    const out = [];
    const emit = (ev) => out.push({ t, ...ev });
    const bankId = e.bank_id || nodeToBank[e.node_id] || null;

    switch (e.type) {
      case 'bq.flower_run':
        emit({ type: 'flower', runId: e.run_id, connection: e.connection });
        break;
      case 'bq.node':
        if (e.role === 'bank' && e.bank_id) nodeToBank[e.node_id] = e.bank_id;
        emit({ type: 'node', role: e.role, name: e.name, model: e.model, bankId: e.bank_id || null });
        break;
      case 'bq.msg': {
        const to = nodeToBank[e.to];
        if (e.kind === 'quote_request' && to) emit({ type: 'sent', bankId: to, text: `Received sealed ranges: ${describeBands(bands)}. No name, no exact figures.` });
        if (e.kind === 'counter_request' && to) emit({ type: 'thinking', bankId: to, text: `Coordinator: ${e.summary}. Your horizon and competitors' prices stay private.` });
        break;
      }
      case 'bq.attest':
        emit({ type: 'attest', bureau: e.bureau, ficoBand: e.fico_band, selfReported: !!e.self_reported, verified: e.signature_ok, verifiedBy: e.verified_by || 0 });
        break;
      case 'bq.guard':
        if (e.violation === 'requested_fields') {
          emit({ type: 'request', bankId, fields: e.requested || [], text: `Asked for ${(e.requested || []).join(', ')} to finalize pricing.` });
          emit({ type: 'blocked', bankId, fields: e.requested || [], text: e.detail });
        } else if (e.violation === 'apr_mismatch') {
          emit({ type: 'flag', bankId, text: `APR check: ${e.detail}. Ranked by true cost, not the advertised rate.` });
        } else {
          emit({ type: 'blocked', bankId, fields: e.requested || [], text: e.detail });
        }
        break;
      case 'bq.quote': {
        const offer = toOffer(e);
        if (e.round === 2 && pendingImprove[bankId]) {
          const imp = pendingImprove[bankId];
          delete pendingImprove[bankId];
          emit({ type: 'improve', bankId, offer, delta: Math.round(imp.delta), text: `${imp.message || 'Improved.'} ${money(imp.delta)} less over your horizon.`.trim() });
        } else {
          if (e.note) emit({ type: 'thinking', bankId, text: e.note });
          emit({ type: 'quote', bankId, offer, sealed: true, model: e.model, text: `Sealed quote: ${offer.rate.toFixed(3)}%, ${offer.points} points, ${money(offer.fees)} fees.` });
        }
        break;
      }
      case 'bq.improve':
        pendingImprove[bankId] = { delta: e.delta, message: e.message };
        break;
      case 'bq.decline':
        emit({ type: e.round === 1 ? 'declined' : 'hold', bankId, text: e.message || e.reason || 'Held its offer.' });
        break;
      case 'bq.round2':
        emit({ type: 'round2', bestTotal: Math.round(e.best_total), text: `Round 2. Each bank hears only its rank and how far behind the best offer it is, as a percentage. Not who, not your horizon, nothing new about you.` });
        break;
      case 'bq.market':
        emit({ type: 'market', pmms: e.pmms_30y, asOf: e.as_of, source: e.source });
        break;
      case 'bq.verdict':
        emit({ type: 'verdict', ranking: (e.ranking || []).map((r) => r.bank_id).filter(Boolean), savings: e.savings_vs_single_quote, horizonYears: e.horizon_years });
        break;
      case 'bq.ledger':
        emit({ type: 'ledger', parties: e.parties || [] });
        break;
      case 'response.output_text.delta':
        narrative += e.delta || '';
        break;
      case 'bq.done':
        emit({ type: 'done', narrative: narrative.split('\n').filter((l) => !/^\s*(#|\|)/.test(l)).join('\n').trim(), elapsed: e.elapsed_s });
        break;
      case 'bq.error':
        emit({ type: 'error', text: e.message || 'The Flower run failed.' });
        break;
      default:
        break;
    }
    return out;
  };
}

/** Is a Flower bridge reachable? Resolves to { available, mode }. */
export async function flowerAvailable() {
  try {
    return await flower.status();
  } catch {
    return { available: false };
  }
}

/**
 * Start a real Flower negotiation. Same contract as startNegotiation():
 * returns { cancel } and calls onEvent with UI events.
 */
export function startFlowerNegotiation(bands, onEvent, { horizonYears = 7, consentToken = null } = {}) {
  const ctrl = new AbortController();
  const adapt = createAdapter(bands);
  (async () => {
    try {
      const { runId, mode } = await flower.start({ bands, horizonYears, consentToken });
      onEvent({ t: 0, type: 'started', runId, mode });
      await flower.stream(runId, (e) => adapt(e).forEach(onEvent), ctrl.signal);
    } catch (err) {
      if (!ctrl.signal.aborted) onEvent({ t: 0, type: 'error', text: err.message });
    }
  })();
  return { cancel: () => ctrl.abort() };
}
