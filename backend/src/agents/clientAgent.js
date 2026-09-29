import { chat } from './llm.js';

/** Opening message when the client's agent submits the application. */
export async function clientAgentIntro(app) {
  const { applicant, loan } = app;
  const fallback =
    `Hello — I represent ${applicant.name}. We'd like to request a ${loan.purpose} loan of ` +
    `$${loan.amount.toLocaleString()} over ${loan.termMonths} months. Annual income ` +
    `$${applicant.annualIncome.toLocaleString()}, monthly debt $${applicant.monthlyDebt.toLocaleString()}, ` +
    `credit score ${applicant.creditScore ?? 'n/a'}, employment: ${applicant.employmentStatus}.`;

  const llmText = await chat({
    instructions:
      'You are an agent acting for a loan applicant. Introduce the application to the bank\'s agent in 2-3 sentences, presenting the figures factually and making a brief case for approval. Never invent numbers.',
    input: JSON.stringify({ applicant, loan }),
  });
  return llmText ?? fallback;
}

/** Decide how the client responds to the bank's evaluation. */
export async function clientAgentDecide(app, evaluation) {
  const monthlyIncome = app.applicant.annualIncome / 12;
  const affordable = evaluation.monthlyPayment <= monthlyIncome * 0.35;

  // Client policy: accept approved offers that are affordable; counter on
  // counter-offers when the payment still strains the budget; appeal denials.
  let action;
  if (evaluation.decision === 'approved') {
    action = affordable ? 'accept' : 'counter';
  } else if (evaluation.decision === 'countered') {
    action = affordable ? 'accept' : 'counter';
  } else {
    action = 'appeal';
  }

  const fallback = {
    accept: `The terms work for us — we accept $${evaluation.approvedAmount.toLocaleString()} at ${evaluation.interestRate}% APR.`,
    counter: `Thank you. The payment is still tight against a $${Math.round(monthlyIncome).toLocaleString()}/mo income — can you improve the rate?`,
    appeal: 'We understand the concerns. Is there any amount or term adjustment that could change the decision?',
  }[action];

  const llmText = await chat({
    instructions:
      'You are an agent acting for a loan applicant, replying to the bank\'s decision in 1-2 sentences. Accept good offers, politely counter on rate if the payment strains a 35% income cap, or appeal a denial by asking what would change it.',
    input: JSON.stringify({ action, evaluation, monthlyIncome: Math.round(monthlyIncome) }),
  });

  return { action, text: llmText ?? fallback };
}

/** Final reaction after the bank's response to a counter/appeal. */
export async function clientAgentClose(app, action, bankReply) {
  const fallback =
    action === 'accept'
      ? 'Confirmed — please proceed with the paperwork.'
      : 'Understood. We will review the offer and follow up.';
  const llmText = await chat({
    instructions:
      'You are an agent acting for a loan applicant closing a negotiation in one sentence. Confirm acceptance or note that the client will review the offer.',
    input: JSON.stringify({ action, bankReply }),
  });
  return llmText ?? fallback;
}
