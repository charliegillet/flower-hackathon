# BlindQuote Trust Console (UI prototype)

Interactive, single-file prototype of the user-facing console for the BlindQuote flow
(`docs/plan-blindquote.md`). Open `index.html` in a browser, or view it live at
https://philiprmocanu-cell.github.io/blindquote-ui/

Layout: left = every agent and its status; middle = the ranges banks can see plus a
step-by-step feed (click a step for the exact message); right = the user's raw data,
locked on device, draggable into the middle to share as a range.

Colors mean one thing each: blue = range shared, slate + lock = stayed local,
amber = a bank asked for too much and was blocked, green check = verified/done.

Gap to close in the code: today `backend/src/agents/clientAgent.js` sends exact income,
debt and score to the bank in plain text. The console assumes the band flow, so the
backend needs to emit per-step events (band computed, attestation, quote sealed,
guard blocked, round 2, ranked) for the feed and ledger to be real.
