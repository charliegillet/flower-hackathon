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
    key: 'identity',
    title: 'About you',
    fields: [
      { name: 'fullName', label: 'Full legal name', type: 'text', policy: 'never', required: true },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date', policy: 'never', required: true },
      { name: 'phone', label: 'Phone', type: 'tel', policy: 'never' },
      { name: 'email', label: 'Email', type: 'email', policy: 'never', required: true },
      { name: 'street', label: 'Street address', type: 'text', policy: 'never' },
      { name: 'city', label: 'City', type: 'text', policy: 'never' },
      { name: 'state', label: 'State', type: 'text', policy: 'asis', hint: 'Banks see the state only' },
      { name: 'zip', label: 'ZIP', type: 'text', policy: 'never' },
      { name: 'ssnLast4', label: 'SSN, last 4 digits', type: 'text', policy: 'never', maxLength: 4 },
      {
        name: 'residency',
        label: 'Citizenship / residency',
        type: 'select',
        options: ['US citizen', 'Permanent resident', 'Visa holder', 'Other'],
        policy: 'asis',
      },
      { name: 'maritalStatus', label: 'Marital status', type: 'select', options: ['Single', 'Married', 'Partnered', 'Divorced', 'Widowed'], policy: 'never' },
      { name: 'dependents', label: 'Dependents', type: 'number', policy: 'never', min: 0 },
    ],
  },
  {
    key: 'income',
    title: 'Income and work',
    fields: [
      { name: 'annualIncome', label: 'Annual income ($)', type: 'number', policy: 'range', required: true, band: 'dti' },
      { name: 'otherIncome', label: 'Other yearly income ($)', type: 'number', policy: 'range', band: 'dti', hint: 'Rental, bonus, side work' },
      { name: 'employmentStatus', label: 'Employment status', type: 'select', options: ['employed', 'self-employed', 'unemployed', 'retired', 'student'], policy: 'asis' },
      { name: 'employer', label: 'Employer', type: 'text', policy: 'never' },
      { name: 'yearsEmployed', label: 'Years in current job', type: 'number', policy: 'range', band: 'tenure', min: 0 },
    ],
  },
  {
    key: 'assets',
    title: 'What you own',
    fields: [
      { name: 'checking', label: 'Checking ($)', type: 'number', policy: 'range', band: 'asset' },
      { name: 'savings', label: 'Savings ($)', type: 'number', policy: 'range', band: 'asset' },
      { name: 'investments', label: 'Investments ($)', type: 'number', policy: 'range', band: 'asset' },
      { name: 'retirement', label: 'Retirement accounts ($)', type: 'number', policy: 'range', band: 'asset' },
      { name: 'realEstate', label: 'Real estate owned ($)', type: 'number', policy: 'range', band: 'asset' },
    ],
  },
  {
    key: 'debts',
    title: 'What you owe, per month',
    fields: [
      { name: 'monthlyHousing', label: 'Rent or mortgage ($/mo)', type: 'number', policy: 'range', band: 'dti' },
      { name: 'autoLoans', label: 'Auto loans ($/mo)', type: 'number', policy: 'range', band: 'dti' },
      { name: 'studentLoans', label: 'Student loans ($/mo)', type: 'number', policy: 'range', band: 'dti' },
      { name: 'creditCards', label: 'Credit cards ($/mo)', type: 'number', policy: 'range', band: 'dti' },
      { name: 'otherDebt', label: 'Other debt ($/mo)', type: 'number', policy: 'range', band: 'dti' },
      { name: 'totalBalances', label: 'Total balance owed ($)', type: 'number', policy: 'never', hint: 'For your own records; never sent' },
    ],
  },
  {
    key: 'credit',
    title: 'Credit history',
    fields: [
      { name: 'creditScore', label: 'Credit score', type: 'number', policy: 'range', band: 'fico', required: true, min: 300, max: 850, hint: 'Bureau confirms the range, not the number' },
      { name: 'derogatory', label: 'Bankruptcy or late payments in the last 7 years', type: 'select', options: ['No', 'Yes'], policy: 'asis' },
    ],
  },
  {
    key: 'loan',
    title: 'The loan you want',
    fields: [
      { name: 'amount', label: 'Loan amount ($)', type: 'number', policy: 'range', band: 'loan', required: true, min: 100 },
      { name: 'purpose', label: 'Purpose', type: 'select', options: ['home', 'auto', 'personal', 'business', 'education', 'debt-consolidation', 'other'], policy: 'asis' },
      { name: 'termMonths', label: 'Term (months)', type: 'number', policy: 'asis', required: true, min: 6, max: 360 },
      { name: 'propertyPrice', label: 'Property price ($)', type: 'number', policy: 'range', band: 'ltv', hint: 'Home loans only' },
      { name: 'occupancy', label: 'How you will use the property', type: 'select', options: ['Primary home', 'Second home', 'Investment'], policy: 'asis' },
      { name: 'horizonYears', label: 'Years you plan to keep this loan', type: 'number', policy: 'never', min: 1, hint: 'Used to rank offers; never sent' },
    ],
  },
];

export const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);
export const FIELD_BY_NAME = Object.fromEntries(ALL_FIELDS.map((f) => [f.name, f]));

// The only keys a bank message may ever contain. The guard checks against this.
export const ALLOWED_BAND_KEYS = [
  'token', 'dtiBand', 'ltvBand', 'assetBand', 'loanBand', 'ficoBand', 'tenureBand',
  'employmentStatus', 'purpose', 'termMonths', 'occupancy', 'residency', 'state', 'derogatory', 'sig',
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
  const income = n(form.annualIncome) + n(form.otherIncome);
  const monthlyDebt = ['monthlyHousing', 'autoLoans', 'studentLoans', 'creditCards', 'otherDebt'].reduce((s, k) => s + n(form[k]), 0);
  const assets = ['checking', 'savings', 'investments', 'retirement', 'realEstate'].reduce((s, k) => s + n(form[k]), 0);
  return { income, monthlyDebt, assets };
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
    tenureBand: tenureBand(form.yearsEmployed)?.label ?? null,
    employmentStatus: form.employmentStatus || null,
    purpose: form.purpose || null,
    termMonths: n(form.termMonths) || null,
    occupancy: form.occupancy || null,
    residency: form.residency || null,
    state: form.state || null,
    derogatory: form.derogatory === 'Yes',
  };
}

/** Human labels for the preview and the sealed envelope. */
export const BAND_LABELS = {
  ficoBand: 'Credit score',
  dtiBand: 'Debt vs. income',
  ltvBand: 'Loan vs. property value',
  assetBand: 'Total assets',
  loanBand: 'Loan amount',
  tenureBand: 'Time in current job',
  employmentStatus: 'Employment',
  purpose: 'Purpose',
  termMonths: 'Term',
  occupancy: 'Use of property',
  residency: 'Residency',
  state: 'State',
  derogatory: 'Credit issues in 7 yrs',
};

export function bandsForDisplay(bands) {
  return Object.entries(BAND_LABELS)
    .map(([key, label]) => {
      let value = bands[key];
      if (key === 'termMonths' && value) value = `${value} months`;
      if (key === 'derogatory') value = value ? 'Yes' : 'No';
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
  if (field.type === 'number' && /\$/.test(field.label)) return money(n(value));
  if (field.name === 'ssnLast4') return `•••-••-${value}`;
  return String(value);
}

/** A believable applicant so the demo starts full. Every value is synthetic. */
export const SAMPLE_FORM = {
  fullName: 'Maya R. Okafor', dateOfBirth: '1991-04-18', phone: '(415) 555-0142', email: 'maya@example.com',
  street: '2140 Fillmore St', city: 'San Francisco', state: 'CA', zip: '94115', ssnLast4: '4471',
  residency: 'US citizen', maritalStatus: 'Married', dependents: 1,
  annualIncome: 142000, otherIncome: 6000, employmentStatus: 'employed', employer: 'Bay Analytics Inc.', yearsEmployed: 4,
  checking: 18400, savings: 62000, investments: 88000, retirement: 50000, realEstate: 0,
  monthlyHousing: 2900, autoLoans: 420, studentLoans: 310, creditCards: 220, otherDebt: 0, totalBalances: 61000,
  creditScore: 752, derogatory: 'No',
  amount: 680000, purpose: 'home', termMonths: 360, propertyPrice: 850000, occupancy: 'Primary home', horizonYears: 7,
  // Demo only: the sample applicant has granted the credit bureau node consent, so her
  // credit range is bureau-signed. Other applicants' ranges stay self-reported.
  _consentToken: 'consent_demo_maya',
};

export const EMPTY_FORM = Object.fromEntries(ALL_FIELDS.map((f) => [f.name, f.name === 'termMonths' ? 360 : f.name === 'purpose' ? 'home' : f.name === 'employmentStatus' ? 'employed' : '']));
