import { underwrite, bankAgentSpeak, bankAgentCounter } from './bankAgent.js';
import { clientAgentIntro, clientAgentDecide, clientAgentClose } from './clientAgent.js';

function say(app, agent, text, data) {
  app.conversation.push({ agent, text, data });
}

/**
 * Run a full agent-to-agent negotiation on an application:
 *   client-agent submits -> bank-agent underwrites -> client counters ->
 *   bank-agent responds once -> client closes.
 * All turns are appended to app.conversation; the doc is saved by the caller.
 */
export async function runNegotiation(app) {
  app.status = 'negotiating';

  say(app, 'client-agent', await clientAgentIntro(app));

  const evaluation = underwrite(app);
  const { creditBand: _band, ...storedEval } = evaluation;
  app.evaluation = storedEval;
  app.status = evaluation.decision === 'denied' ? 'denied' : evaluation.decision;
  say(app, 'bank-agent', await bankAgentSpeak(app, evaluation, 'initial review'), {
    decision: evaluation.decision,
  });

  const clientMove = await clientAgentDecide(app, evaluation);
  say(app, 'client-agent', clientMove.text, { action: clientMove.action });

  if (clientMove.action === 'accept') {
    app.status = 'accepted';
    say(app, 'system', 'Offer accepted by the client agent.');
    return app;
  }

  const reply = await bankAgentCounter(app, evaluation, clientMove.text);
  if (reply.improvedRate != null && app.evaluation) {
    app.evaluation.interestRate = reply.improvedRate;
  }
  say(app, 'bank-agent', reply.text, reply.improvedRate != null ? { improvedRate: reply.improvedRate } : undefined);

  const closing = await clientAgentClose(app, clientMove.action, reply.text);
  say(app, 'client-agent', closing);
  say(app, 'system', `Negotiation ended. Status: ${app.status}.`);
  return app;
}
