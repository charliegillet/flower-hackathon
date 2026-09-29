// Turns an applicant's exact answers into the ranges ("bands") that banks see.
//
// This is the privacy boundary. Nothing outside this file should ever hand an
// exact value to a bank. When the backend is wired up, move this file to
// backend/src/agents/bands.js unchanged and call it from the seal endpoint
// (POST /api/applications/:id/seal). The frontend keeps a copy only so the
// "What banks will see" preview can update live while the user types.

// Every question the user answers, grouped in sections, with a fixed policy:
//   never  -> stays on the user's side, in any form
//   range  -> only a range derived from it leaves
//   asis   -> sent exactly as entered (only non-identifying choices)
export const SECTIONS = [
  {
    key: 'loan',
    title: 'The loan',
    fields: [
      { name: 'amount', label: 'Amount', type: 'number', policy: 'range', band: 'loan', required: true, min: 100, money: true },
      { name: 'purpose', label: 'Purpose', type: 'select', options: ['home', 'auto', 'personal', 'business', 'education', 'debt-consolidation', 'other'], policy: 'asis' },
      { name: 'termMonths', label: 'Term (months)', type: 'number', policy: 'asis', min: 6, max: 360 },
      { name: 'propertyPrice', label: 'Property price', type: 'number', policy: 'range', band: 'ltv', money: true, hint: 'Home loans' },
      { name: 'occupancy', label: 'Use', type: 'select', options: ['Primary home', 'Second home', 'Investment'], policy: 'asis' },
    ],
  },
  {
    key: 'money',
    title: 'Your finances',
    fields: [
      { name: 'annualIncome', label: 'Annual income', type: 'number', policy: 'range', band: 'dti', required: true, money: true },
      { name: 'monthlyDebt', label: 'Debt payments / month', type: 'number', policy: 'range', band: 'dti', money: true, required: true },
      { name: 'totalAssets', label: 'Savings and assets', type: 'number', policy: 'range', band: 'asset', money: true },
      { name: 'creditScore', label: 'Credit score', type: 'number', policy: 'range', band: 'fico', required: true, min: 300, max: 850, hint: 'Bureau confirms the range' },
      { name: 'employmentStatus', label: 'Employment', type: 'select', options: ['employed', 'self-employed', 'unemployed', 'retired', 'student'], policy: 'asis' },
    ],
  },
  {
    key: 'identity',
    title: 'About you',
    fields: [
      { name: 'fullName', label: 'Full name', type: 'text', policy: 'never', required: true },
      { name: 'email', label: 'Email', type: 'email', policy: 'never', required: true },
      { name: 'state', label: 'State', type: 'text', policy: 'asis', hint: 'Banks see the state only' },
      { name: 'ssnLast4', label: 'SSN, last 4', type: 'text', policy: 'never', maxLength: 4 },
    ],
  },
  {
    key: 'want',
    title: 'What you want',
    mandate: true,
    fields: [
      { name: 'priority', label: 'Matters most', type: 'select', options: ['Lowest total cost', 'Lowest monthly payment', 'Least cash at closing', 'Fastest close'], policy: 'asis', required: true, hint: 'Banks see this' },
      { name: 'horizonYears', label: 'Years you\'ll keep it', type: 'number', policy: 'never', min: 1, required: true },
      { name: 'maxPayment', label: 'Payment cap / month', type: 'number', policy: 'never', money: true, hint: 'Your agent only' },
      { name: 'cashToClose', label: 'Cash for closing', type: 'number', policy: 'asis', money: true, hint: 'Sets whether points are possible' },
      { name: 'noPrepayPenalty', label: 'No prepayment penalty', type: 'select', options: ['Required', 'Nice to have', 'Don\'t care'], policy: 'asis' },
      { name: 'walkAwayRate', label: 'Walk away above (%)', type: 'number', policy: 'never', hint: 'Your agent only' },
    ],
  },
];

export const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);
export const FIELD_BY_NAME = Object.fromEntries(ALL_FIELDS.map((f) => [f.name, f]));

// The only keys a bank message may ever contain. The guard checks against this.
export const ALLOWED_BAND_KEYS = [
  'token', 'dtiBand', 'ltvBand', 'assetBand', 'loanBand', 'ficoBand', 'tenureBand',
  'employmentStatus', 'purpose', 'termMonths', 'occupancy', 'state', 'priority', 'cashToClose', 'noPrepayPenalty', 'sig',
];

const n = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));
const money = (v) => `$${Math.round(v).toLocaleString()}`;
const moneyK = (v) => (v >= 1_000_000 ? `$${+(v / 1_000_000).toFixed(2)}M` : `$${Math.round(v / 1000)}k`);

function moneyBand(value, step) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const lo = Math.floor(value / step) * step;
  return { lo, hi: lo + step, label: `${moneyK(lo)}–${moneyK(lo + step)}` };
}
// Loan-to-value on the Fannie Mae LLPA grid edges (upper edge inclusive), so the
// range the user sees is exactly the band banks price from. 80.00% is "75.01–80%".
const LTV_EDGES = [30, 60, 70, 75, 80, 85, 90, 95];
// Same idea for debt-to-income, on the grid edges 28/36/43/50.
const DTI_EDGES = [28, 36, 43, 50];
function edgeBand(ratio, edges) {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const pct = Math.round(ratio * 10000) / 100;
  let lo = 0;
  for (const hi of edges) {
    if (pct <= hi) return { label: lo === 0 ? `≤${hi}%` : `${lo + 0.01}–${hi}%` };
    lo = hi;
  }
  return { label: `>${edges[edges.length - 1]}%` };
}
const fannieLtvBand = (ratio) => edgeBand(ratio, LTV_EDGES);
const dtiBand = (ratio) => edgeBand(ratio, DTI_EDGES);

function ficoBand(score) {
  if (!score) return null;
  const lo = Math.max(300, Math.floor(score / 20) * 20);
  return { lo, hi: lo + 19, label: `${lo}–${lo + 19}` };
}
function tenureBand(years) {
  if (years == null || years === '') return null;
  const y = n(years);
  if (y < 2) return { label: 'under 2 years' };
  if (y < 5) return { label: '2–5 years' };
  return { label: '5+ years' };
}

/** Exact totals, for the user's own eyes only. */
export function totals(form) {
  return { income: n(form.annualIncome), monthlyDebt: n(form.monthlyDebt), assets: n(form.totalAssets) };
}

/** The bands object. This is the entire message a bank receives. */
export function computeBands(form) {
  const t = totals(form);
  const dti = t.income > 0 ? t.monthlyDebt / (t.income / 12) : null;
  const ltv = n(form.propertyPrice) > 0 ? n(form.amount) / n(form.propertyPrice) : null;
  return {
    token: form._token || null,
    dtiBand: dtiBand(dti)?.label ?? null,
    ltvBand: fannieLtvBand(ltv)?.label ?? null,
    assetBand: moneyBand(t.assets, 50_000)?.label ?? null,
    loanBand: moneyBand(n(form.amount), 50_000)?.label ?? null,
    ficoBand: ficoBand(n(form.creditScore))?.label ?? null,
    employmentStatus: form.employmentStatus || null,
    purpose: form.purpose || null,
    termMonths: n(form.termMonths) || null,
    occupancy: form.occupancy || null,
    state: form.state || null,
    priority: form.priority || null,
    cashToClose: n(form.cashToClose) ? moneyBand(n(form.cashToClose), 10_000)?.label ?? null : null,
    noPrepayPenalty: form.noPrepayPenalty || null,
  };
}

/** Human labels for the preview and the sealed envelope. */
export const BAND_LABELS = {
  ficoBand: 'Credit score',
  dtiBand: 'Debt vs. income',
  ltvBand: 'Loan vs. property value',
  assetBand: 'Total assets',
  loanBand: 'Loan amount',
  employmentStatus: 'Employment',
  purpose: 'Purpose',
  termMonths: 'Term',
  occupancy: 'Use of property',
  state: 'State',
  priority: 'Wants',
  cashToClose: 'Cash for closing',
  noPrepayPenalty: 'Prepayment penalty',
};

export function bandsForDisplay(bands) {
  return Object.entries(BAND_LABELS)
    .map(([key, label]) => {
      let value = bands[key];
      if (key === 'termMonths' && value) value = `${value} months`;
      if (key === 'noPrepayPenalty' && value) value = value === 'Required' ? 'None allowed' : value === 'Nice to have' ? 'Prefer none' : 'Either';
      return { key, label, value };
    })
    .filter((r) => r.value != null && r.value !== '');
}

/** Which exact fields fed a given band, so the UI can show "from N hidden values". */
export function sourcesOf(bandKey, form) {
  return ALL_FIELDS.filter((f) => f.band === bandKey && n(form[f.name]) > 0).map((f) => ({ ...f, value: form[f.name] }));
}

/**
 * The seal event stream. The planned backend endpoint returns this same list so
 * the animation in StageSeal is driven by real work, not a canned timeline.
 */
export function sealEvents(form) {
  const events = [{ type: 'scan' }];
  for (const s of SECTIONS) {
    for (const f of s.fields) {
      const v = form[f.name];
      if (v === '' || v == null) continue;
      if (f.policy === 'never') events.push({ type: 'lock', field: f.name });
      else if (f.policy === 'range') events.push({ type: 'band', field: f.name, band: f.band });
      else events.push({ type: 'pass', field: f.name });
    }
  }
  events.push({ type: 'sign' });
  events.push({ type: 'sealed', payload: computeBands({ ...form, _token: randomToken() }) });
  return events;
}

export function randomToken() {
  const chars = 'abcdef0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function formatValue(field, value) {
  if (value === '' || value == null) return '';
  if (field.money) return money(n(value));
  if (field.name === 'walkAwayRate') return `${value}%`;
  if (field.name === 'ssnLast4') return `•••-••-${value}`;
  return String(value);
}

/** A believable applicant so the demo starts full. Every value is synthetic. */
export const SAMPLE_FORM = {
  amount: 680000, purpose: 'home', termMonths: 360, propertyPrice: 850000, occupancy: 'Primary home',
  annualIncome: 142000, monthlyDebt: 3850, totalAssets: 218400, creditScore: 752, employmentStatus: 'employed',
  fullName: 'Maya R. Okafor', email: 'maya@example.com', state: 'CA', ssnLast4: '4471',
  priority: 'Lowest total cost', horizonYears: 7, maxPayment: 4300, cashToClose: 25000, noPrepayPenalty: 'Required', walkAwayRate: 6.75,
  // Demo only: the sample applicant has granted the credit bureau node consent, so her
  // credit range is bureau-signed. Other applicants' ranges stay self-reported.
  _consentToken: 'consent_demo_maya',
};

const DEFAULTS = { termMonths: 360, purpose: 'home', employmentStatus: 'employed', occupancy: 'Primary home', priority: 'Lowest total cost', horizonYears: 7, noPrepayPenalty: 'Nice to have' };
export const EMPTY_FORM = Object.fromEntries(ALL_FIELDS.map((f) => [f.name, DEFAULTS[f.name] ?? '']));

/** The private half of the mandate. Never leaves the device; the agent scores offers against it. */
export function mandateOf(form) {
  return { priority: form.priority, horizonYears: n(form.horizonYears) || 7, maxPayment: n(form.maxPayment) || null, cashToClose: n(form.cashToClose) || null, noPrepayPenalty: form.noPrepayPenalty || 'Nice to have', walkAwayRate: n(form.walkAwayRate) || null };
}

/**
 * Documents a user can drop in. Each one is read on the device and only the
 * resulting range leaves. For the wireframe the "reading" is simulated: the
 * file name picks the type, and sample values fill any empty field. The real
 * version runs local OCR / parsing in the browser and never uploads the file.
 */
export const DOC_TYPES = [
  { id: 'paystub', label: 'Pay stub or W-2', match: /pay|stub|w-?2|1040|tax|income/i, fills: { annualIncome: 142000, employmentStatus: 'employed' }, verifies: ['annualIncome', 'employmentStatus'], note: 'Income confirmed' },
  { id: 'statement', label: 'Bank statement', match: /statement|bank|checking|savings|brokerage/i, fills: { totalAssets: 218400, cashToClose: 25000 }, verifies: ['totalAssets'], note: 'Assets confirmed' },
  { id: 'credit', label: 'Credit report', match: /credit|report|fico|experian|equifax|transunion/i, fills: { creditScore: 752, monthlyDebt: 3850 }, verifies: ['creditScore', 'monthlyDebt'], note: 'Score and debts confirmed' },
  { id: 'id', label: 'Photo ID', match: /id|license|licence|passport|dl/i, fills: { fullName: 'Maya R. Okafor', state: 'CA', ssnLast4: '4471' }, verifies: ['fullName', 'state'], note: 'Identity confirmed' },
  { id: 'purchase', label: 'Purchase agreement or appraisal', match: /purchase|contract|appraisal|offer|listing|property/i, fills: { propertyPrice: 850000, amount: 680000, purpose: 'home', occupancy: 'Primary home' }, verifies: ['propertyPrice', 'amount'], note: 'Property and loan confirmed' },
];

export function classifyDoc(fileName) {
  return DOC_TYPES.find((d) => d.match.test(fileName)) || null;
}
