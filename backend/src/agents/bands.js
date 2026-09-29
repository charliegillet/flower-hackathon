// Server-side ranges. The bank side of the app (bank agent, bank reviewers)
// must only ever see these, never the applicant's exact figures or identity.
// Mirrors frontend/src/core/bands.js; keep the band edges in step.

const moneyK = (v) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v / 1000)}k`);

function pctBand(ratio, step = 5) {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const lo = Math.floor((ratio * 100) / step) * step;
  return `${lo}–${lo + step}%`;
}
function moneyBand(value, step) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const lo = Math.floor(value / step) * step;
  return `${moneyK(lo)}–${moneyK(lo + step)}`;
}
function ficoBand(score) {
  if (!score) return null;
  const lo = Math.max(300, Math.floor(score / 20) * 20);
  return `${lo}–${lo + 19}`;
}

/** One-time code per application, derived from its id. Not a person id. */
export function applicantCode(app) {
  return String(app._id || '').slice(-8) || 'pending';
}

export function bandsOf(app) {
  const a = app.applicant || {};
  const loan = app.loan || {};
  const monthlyIncome = (a.annualIncome || 0) / 12;
  return {
    code: applicantCode(app),
    dtiBand: monthlyIncome > 0 ? pctBand((a.monthlyDebt || 0) / monthlyIncome) : null,
    assetBand: moneyBand(a.totalAssets || 0, 50_000),
    loanBand: moneyBand(loan.amount || 0, 50_000),
    ficoBand: ficoBand(a.creditScore),
    employmentStatus: a.employmentStatus || null,
    purpose: loan.purpose || null,
    termMonths: loan.termMonths || null,
  };
}

/** What a bank account is allowed to receive. Identity and exact figures are removed. */
export function bankView(app) {
  const doc = typeof app.toObject === 'function' ? app.toObject() : { ...app };
  const bands = bandsOf(doc);
  const raw = doc.applicant || {};
  const scrub = (text) => {
    let t = String(text || '');
    const swaps = [
      [raw.name, `applicant ${bands.code}`],
      [raw.email, '[email withheld]'],
      [raw.annualIncome != null ? `$${Number(raw.annualIncome).toLocaleString()}` : null, '[income withheld]'],
      [raw.monthlyDebt != null ? `$${Number(raw.monthlyDebt).toLocaleString()}` : null, '[debt withheld]'],
      [raw.creditScore != null ? String(raw.creditScore) : null, bands.ficoBand || '[score withheld]'],
    ];
    for (const [from, to] of swaps) if (from) t = t.split(from).join(to);
    return t;
  };
  return {
    ...doc,
    applicant: { code: bands.code, bands },
    conversation: (doc.conversation || []).map((m) => ({ ...m, text: scrub(m.text) })),
  };
}
