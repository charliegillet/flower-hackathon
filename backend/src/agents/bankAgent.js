import { chat } from './llm.js';

const PURPOSE_ADJUST = {
  home: -0.4,
  auto: 0.0,
  'debt-consolidation': 0.6,
  education: 0.2,
  personal: 0.8,
  business: 1.0,
  other: 1.2,
};

const EMPLOYMENT_PENALTY = {
  employed: 0,
  'self-employed': 8,
  retired: 6,
  student: 12,
  unemployed: 40,
};

function creditBand(score) {
  if (score >= 780) return { band: '780-850', base: 6.0 };
  if (score >= 740) return { band: '740-779', base: 6.6 };
  if (score >= 700) return { band: '700-739', base: 7.4 };
  if (score >= 660) return { band: '660-699', base: 8.6 };
  if (score >= 620) return { band: '620-659', base: 10.2 };
  return { band: '300-619', base: 12.5 };
}

function monthlyPayment(principal, annualRatePct, months) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * Deterministic underwriting. Code decides; the model only explains.
 */
export function underwrite(app) {
  const { applicant, loan } = app;
  const score = applicant.creditScore ?? 650;
  const monthlyIncome = applicant.annualIncome / 12;
  const dti = monthlyIncome > 0 ? applicant.monthlyDebt / monthlyIncome : 1;
  const loanToIncome = monthlyIncome > 0 ? loan.amount / applicant.annualIncome : Infinity;

  const reasons = [];
  const { band, base } = creditBand(score);

  let risk = 30;
  risk += dti > 0.5 ? 30 : dti > 0.43 ? 20 : dti > 0.36 ? 10 : 0;
  risk += loanToIncome > 3 ? 20 : loanToIncome > 1.5 ? 10 : 0;
  risk += EMPLOYMENT_PENALTY[applicant.employmentStatus] ?? 10;

  // Reserves: assets covering a year+ of payments meaningfully de-risk the loan.
  const assets = applicant.totalAssets || 0;
  if (assets >= loan.amount) {
    risk -= 15;
    reasons.push('Assets fully cover the requested amount');
  } else if (assets >= loan.amount * 0.5) {
    risk -= 8;
    reasons.push('Substantial assets relative to the loan');
  }

  if (dti > 0.43) reasons.push(`DTI ${(dti * 100).toFixed(0)}% is above the 43% guideline`);
  if (loanToIncome > 1.5) reasons.push('Requested amount is high relative to annual income');
  if (applicant.employmentStatus === 'unemployed') reasons.push('No current employment');
  if (reasons.length === 0) reasons.push('Income, debt load and credit band are within guidelines');

  const interestRate = Math.round((base + (PURPOSE_ADJUST[loan.purpose] ?? 1.0)) * 100) / 100;

  if (risk >= 70 || dti > 0.55) {
    return { decision: 'denied', riskScore: Math.min(risk, 100), reasons };
  }

  let approvedAmount = loan.amount;
  let decision = 'approved';
  // Counter-offer: shrink the amount so the payment fits inside a 40% DTI cap.
  const maxPayment = monthlyIncome * 0.4 - applicant.monthlyDebt;
  const payment = monthlyPayment(approvedAmount, interestRate, loan.termMonths);
  if (payment > maxPayment) {
    const r = interestRate / 100 / 12;
    const maxPrincipal = (maxPayment * (1 - Math.pow(1 + r, -loan.termMonths))) / r;
    approvedAmount = Math.max(0, Math.floor(maxPrincipal / 100) * 100);
    decision = 'countered';
    reasons.push(`Full payment exceeds the 40% DTI cap; offering a reduced amount`);
  }

  return {
    decision,
    approvedAmount,
    interestRate,
    termMonths: loan.termMonths,
    monthlyPayment: Math.round(monthlyPayment(approvedAmount, interestRate, loan.termMonths) * 100) / 100,
    riskScore: Math.min(risk, 100),
    creditBand: band,
    reasons,
  };
}

/** Bank agent's turn text for the conversation thread. */
export async function bankAgentSpeak(app, evaluation, context) {
  const fallback =
    evaluation.decision === 'denied'
      ? `After review, we are unable to approve this request: ${evaluation.reasons.join('; ')}.`
      : evaluation.decision === 'countered'
        ? `We cannot offer the full $${app.loan.amount.toLocaleString()}. We can offer $${evaluation.approvedAmount.toLocaleString()} at ${evaluation.interestRate}% APR for ${evaluation.termMonths} months (~$${evaluation.monthlyPayment}/mo): ${evaluation.reasons.join('; ')}.`
        : `Approved: $${evaluation.approvedAmount.toLocaleString()} at ${evaluation.interestRate}% APR for ${evaluation.termMonths} months (~$${evaluation.monthlyPayment}/mo).`;

  const llmText = await chat({
    instructions:
      'You are a bank loan officer agent. Write a concise (2-3 sentences), professional reply to the applicant\'s agent. State the decision and the key terms. Never invent numbers; use only the figures provided.',
    input: JSON.stringify({
      context,
      applicant: { name: app.applicant.name, creditBand: evaluation.creditBand },
      request: app.loan,
      evaluation,
    }),
  });
  return llmText ?? fallback;
}

/** Respond to a client counter-proposal in negotiation. */
export async function bankAgentCounter(app, evaluation, clientMessage) {
  // The bank can shave at most 0.75% off the quoted rate, never below its floor.
  const floor = evaluation.interestRate - 0.75;
  const improved = Math.round((evaluation.interestRate - 0.5) * 100) / 100;
  const canImprove = improved >= floor && evaluation.decision !== 'denied';

  const fallback = canImprove
    ? `We can improve the rate to ${improved}% APR on $${evaluation.approvedAmount.toLocaleString()}. That is our best offer.`
    : evaluation.decision === 'denied'
      ? 'The decision stands; the application does not meet underwriting guidelines.'
      : `We are already at our floor of ${floor}% APR and cannot improve the offer.`;

  const llmText = await chat({
    instructions:
      'You are a bank loan officer agent responding to a counter-proposal. Reply in 1-2 sentences. If an improved rate is provided, state it clearly; otherwise politely hold firm.',
    input: JSON.stringify({
      clientMessage,
      improvedRate: canImprove ? improved : null,
      floorRate: floor,
      evaluation,
    }),
  });

  return {
    text: llmText ?? fallback,
    improvedRate: canImprove ? improved : null,
  };
}
