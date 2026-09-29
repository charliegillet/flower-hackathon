// BlindQuote UI. One reducer (handleEvent) drives every mode:
// Replay plays fixtures/sample-run.json on its recorded clock; live modes
// POST /api/runs and stream /api/runs/{id}/events over SSE.

const $ = (sel, root = document) => root.querySelector(sel);
const SVGNS = "http://www.w3.org/2000/svg";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STAGES = ["discover", "bands", "attest", "round1", "round2", "verdict"];
const API_MODE = { sim: "sim", local: "local", supergrid: "supergrid" };

const BAND_LABELS = {
  loan_band: "Loan amount",
  ltv_band: "Loan-to-value",
  dti_band: "Debt-to-income",
  occupancy: "Occupancy",
  term_years: "Term",
  property_state: "Property state",
};
const FIELD_LABELS = {
  exact_income: "Exact income",
  assets: "Assets",
  name: "Name",
  exact_credit_score: "Exact credit score",
  employer: "Employer",
  ssn: "Social Security number",
  address: "Home address",
  dob: "Date of birth",
};
const FLAG_LABELS = {
  apr_mismatch: "APR bait",
  improved_round2: "Improved in round 2",
  at_floor: "At its floor",
  requested_exact_income: "Asked for exact income",
  requested_fields: "Asked for raw data",
};
const DECLINE_REASONS = { at_floor: "at its floor", no_improvement: "no improvement" };
const DEFAULT_WITHHELD = ["exact_income", "assets", "name", "exact_credit_score"];

const ICON = {
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></svg>',
  envelope: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="#1D2B4F"><path d="M3 6h18v12H3z"/><path d="M3 6.5l9 7 9-7" fill="none" stroke="#F8FAF6" stroke-width="1.6"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.5" fill="none" stroke="#1D2B4F" stroke-width="2.2"/></svg>',
  bad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="#B3262E" stroke-width="3" stroke-linecap="round"/></svg>',
};
const GLYPH = {
  borrower: "M4 11.5l8-7 8 7 M6 10v10h12V10 M10 20v-6h4v6",
  bureau: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5",
  bank: "M3 9l9-5 9 5 M5 10.5v7.5 M9.5 10.5v7.5 M14.5 10.5v7.5 M19 10.5v7.5 M3 20.5h18",
  other: "M5 5h14v14H5z",
};

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => (typeof n === "number" && isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "—");
const pct = (n, d = 3) => (typeof n === "number" && isFinite(n) ? String(Number(n.toFixed(d))) + "%" : "—");
const rate3 = (n) => (typeof n === "number" && isFinite(n) ? n.toFixed(3) + "%" : "—");
const withPeriod = (t) => (/[.!?…]$/.test(String(t).trim()) ? t : t + ".");
const humanize = (k) => FIELD_LABELS[k] || BAND_LABELS[k] || String(k).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const shortModel = (m) => (m ? String(m).split("/").pop().replace(/-Code-\w+$/, "").replace(/-[A-Za-z0-9]{6}$/, "") : "");
function el(tag, attrs = {}, html) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (html != null) e.innerHTML = html;
  return e;
}
function s(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------------------------------------------------------------- guilloche (security-paper pattern)
function makeGuilloche() {
  // Lattice tile: two families of phase-shifted sine waves, periodic in both axes.
  const W = 240, H = 72, lines = [];
  const wave = (y0, amp, k, phase) => {
    let d = "";
    for (let x = 0; x <= W; x += 4) {
      const y = y0 + amp * Math.sin((2 * Math.PI * k * x) / W + phase);
      d += (x ? "L" : "M") + x + " " + y.toFixed(2);
    }
    return d;
  };
  for (let i = -2; i < 8; i++) {
    const y0 = (i * H) / 6;
    lines.push(`<path d="${wave(y0, 9, 2, 0)}"/>`, `<path d="${wave(y0, 9, 2, Math.PI)}"/>`, `<path d="${wave(y0 + H / 12, 4, 4, Math.PI / 2)}" stroke-opacity=".5"/>`);
  }
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g fill="none" stroke="#1D2B4F" stroke-opacity=".08" stroke-width=".7">${lines.join("")}</g></svg>`;

  // Rosette for the masthead.
  const R = 200, paths = [];
  for (let f = 0; f < 3; f++) {
    let d = "";
    const base = 120 + f * 26, amp = 16 + f * 6, petals = 18 + f * 6;
    for (let k = 0; k < 3; k++) {
      d = "";
      for (let t = 0; t <= 720; t++) {
        const a = (t / 720) * Math.PI * 2;
        const r = base + amp * Math.sin(petals * a + (k * Math.PI) / 3);
        d += (t ? "L" : "M") + (R + r * Math.cos(a)).toFixed(1) + " " + (R + r * Math.sin(a)).toFixed(1);
      }
      paths.push(`<path d="${d}Z"/>`);
    }
  }
  const rosette = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><g fill="none" stroke="#1D2B4F" stroke-opacity=".1" stroke-width=".8">${paths.join("")}</g></svg>`;
  const url = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  document.documentElement.style.setProperty("--guilloche", url(tile));
  document.documentElement.style.setProperty("--rosette", url(rosette));
}

// ---------------------------------------------------------------- state
let state;
function freshState() {
  return {
    mode: null,
    horizon: 7,
    nodes: new Map(), // node_id -> {node_id, role, name, org_kind, model, location}
    banks: new Map(), // bank name -> {card, node_id, quote, round1Total, ...}
    events: 0,
    market: null,
    verdict: null,
    narrative: "",
    narrativeDone: false,
    finished: false,
    instant: false,
  };
}

// ---------------------------------------------------------------- network view
const NET = { w: 660, h: 540, hub: { x: 318, y: 262, r: 54 } };
const net = { svg: null, edges: null, nodes: null, pulses: null };

function initNetwork() {
  const svg = $("#network");
  svg.innerHTML = "";
  net.svg = svg;
  net.edges = s("g", { class: "edges" }, svg);
  net.marks = s("g", { class: "marks" }, svg);
  net.nodes = s("g", { class: "nodes" }, svg);
  net.pulses = s("g", { class: "pulses" }, svg);
  drawNetwork();
}

function layout() {
  const pos = new Map();
  const list = [...state.nodes.values()];
  const banks = list.filter((n) => n.role === "bank");
  const left = list.filter((n) => n.role !== "bank");
  const leftSlots = left.length <= 2 ? [140, 380] : left.map((_, i) => 90 + (i * 380) / Math.max(1, left.length - 1));
  left.forEach((n, i) => pos.set(n.node_id, { x: 118, y: leftSlots[i], r: 32 }));
  const count = Math.max(4, banks.length);
  const top = 52, span = 400;
  banks.forEach((n, i) => pos.set(n.node_id, { x: 540, y: top + (i * span) / (count - 1), r: 26 }));
  pos.set("coordinator", { ...NET.hub });
  return pos;
}

function drawNetwork() {
  if (!net.svg) return;
  const pos = layout();
  net.pos = pos;
  net.edges.innerHTML = "";
  net.nodes.innerHTML = "";

  for (const n of state.nodes.values()) {
    const p = pos.get(n.node_id);
    const line = s("line", { class: "edge", x1: NET.hub.x, y1: NET.hub.y, x2: p.x, y2: p.y, "data-edge": n.node_id }, net.edges);
    const b = state.banks.get(n.name);
    if (b && b.blocked) line.classList.add("blocked");
  }

  // hub
  const hub = s("g", { class: "hub", "data-node": "coordinator" }, net.nodes);
  s("circle", { class: "hub-ring", cx: NET.hub.x, cy: NET.hub.y, r: NET.hub.r + 10 }, hub);
  s("circle", { class: "hub-disc", cx: NET.hub.x, cy: NET.hub.y, r: NET.hub.r }, hub);
  const t1 = s("text", { class: "hub-name", x: NET.hub.x, y: NET.hub.y + 2, "text-anchor": "middle" }, hub);
  t1.textContent = "Coordinator";
  const t2 = s("text", { class: "hub-kind", x: NET.hub.x, y: NET.hub.y + 20, "text-anchor": "middle" }, hub);
  t2.textContent = state.mode === "sim" ? "simulated grid" : state.mode === "flower" ? "Flower SuperLink" : "neutral broker";

  for (const n of state.nodes.values()) {
    const p = pos.get(n.node_id);
    const g = s("g", { class: "node", "data-node": n.node_id }, net.nodes);
    const b = state.banks.get(n.name);
    if (b?.blocked) g.classList.add("guarded");
    if (b?.flagged && !b?.blocked) g.classList.add("flagged");
    if (state.verdict && state.verdict.winner === n.name) g.classList.add("won");
    s("circle", { class: "halo", cx: p.x, cy: p.y, r: p.r + 6 }, g);
    s("circle", { class: "node-disc", cx: p.x, cy: p.y, r: p.r }, g);
    const scale = p.r >= 30 ? 1.25 : 1.05;
    s("path", { class: "glyph", d: GLYPH[n.role] || GLYPH.other, transform: `translate(${p.x - 12 * scale} ${p.y - 12 * scale}) scale(${scale})` }, g);
    let y = p.y + p.r + 21;
    const name = s("text", { class: "n-name", x: p.x, y, "text-anchor": "middle" }, g);
    name.textContent = n.name || n.node_id;
    y += 18;
    const kind = s("text", { class: "n-kind", x: p.x, y, "text-anchor": "middle" }, g);
    kind.textContent = [n.org_kind, n.location].filter(Boolean).join(", ");
    if (n.model) {
      const label = shortModel(n.model);
      const w = label.length * 7.6 + 14;
      const badge = s("g", { class: "badge" }, g);
      s("rect", { x: p.x - w / 2, y: y + 6, width: w, height: 19, rx: 3 }, badge);
      const bt = s("text", { x: p.x, y: y + 19.8, "text-anchor": "middle" }, badge);
      bt.textContent = label;
      const title = s("title", {}, badge);
      title.textContent = n.model;
    }
  }
}

function light(nodeId, ms = 1100) {
  const g = net.nodes?.querySelector(`[data-node="${CSS.escape(nodeId)}"]`);
  if (!g) return;
  g.classList.add("lit");
  clearTimeout(g._t);
  g._t = setTimeout(() => g.classList.remove("lit"), ms / speedFactor());
}

function pulse(from, to, sealed, bad) {
  if (state.instant || reducedMotion || !net.pos) return;
  const a = net.pos.get(from), b = net.pos.get(to);
  if (!a || !b) return;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const x1 = a.x + ux * (a.r + 4), y1 = a.y + uy * (a.r + 4);
  const x2 = b.x - ux * (b.r + 4), y2 = b.y - uy * (b.r + 4);
  let g;
  if (sealed || bad) {
    g = s("g", { class: bad ? "pulse-sealed pulse-bad" : "pulse-sealed" }, net.pulses);
    s("rect", { x: -10, y: -7, width: 20, height: 14, rx: 2 }, g);
    s("path", { d: "M-10 -6.5 L0 1 L10 -6.5" }, g);
  } else {
    g = s("circle", { class: "pulse-open", r: 6.5 }, net.pulses);
  }
  const dur = 950 / speedFactor();
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const x = x1 + (x2 - x1) * e, y = y1 + (y2 - y1) * e;
    g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    if (g.tagName === "circle") g.setAttribute("cx", 0);
    if (k < 1) requestAnimationFrame(step);
    else g.remove();
  };
  requestAnimationFrame(step);
}

function markBlockedEdge(nodeId) {
  const p = net.pos?.get(nodeId);
  if (!p) return;
  const mx = (NET.hub.x + p.x) / 2, my = (NET.hub.y + p.y) / 2;
  net.marks.innerHTML = "";
  s("line", { class: "xmark", x1: mx - 9, y1: my - 9, x2: mx + 9, y2: my + 9 }, net.marks);
  s("line", { class: "xmark", x1: mx + 9, y1: my - 9, x2: mx - 9, y2: my + 9 }, net.marks);
}

// ---------------------------------------------------------------- wire (latest messages)
function nodeName(id) {
  if (id === "coordinator") return "Coordinator";
  return state.nodes.get(id)?.name || `node ${String(id).slice(0, 6)}`;
}
function wire(html, icon, cls) {
  const list = $("#wire");
  const li = el("li", cls ? { class: cls } : {}, `${icon}<div>${html}</div>`);
  list.prepend(li);
  while (list.children.length > 4) list.lastChild.remove();
}

// ---------------------------------------------------------------- your side
function renderLocked(fields) {
  const ul = $("#locked");
  ul.innerHTML = "";
  fields.forEach((f, i) => {
    const w = [5.5, 3.8, 6.4, 2.6, 4.6, 5.1][i % 6];
    ul.append(el("li", {}, `${ICON.lock}<span class="field"><span>${esc(humanize(f))}</span><span class="redact" style="--w:${w}rem" aria-label="hidden"></span></span>`));
  });
}

function renderBands(bands) {
  const dl = $("#bands");
  dl.innerHTML = "";
  let i = 0;
  for (const [k, v] of Object.entries(bands || {})) {
    const val = k === "term_years" ? `${v} years` : v;
    const row = el("div", { class: "arrive", style: `animation-delay:${i++ * 90}ms` }, `<dt>${esc(humanize(k))}</dt><dd>${esc(val)}</dd>`);
    dl.append(row);
  }
}

// ---------------------------------------------------------------- bid cards
function bankFor(name, nodeId, model) {
  if (!name && nodeId) name = state.nodes.get(nodeId)?.name;
  if (!name) return null;
  let b = state.banks.get(name);
  if (!b) {
    b = { name, node_id: nodeId || null, model: model || null, quote: null, round1Total: null };
    b.card = el("article", { class: "bid sealed", "aria-live": "polite" });
    b.card.innerHTML = `
      <div class="bid-head">
        <div class="bid-name"></div>
        <div class="bid-meta"><span class="bid-model"></span><span class="bid-state">Not yet asked</span></div>
      </div>
      <div class="bid-body"></div>
      <div class="bid-foot"><div class="chips"></div></div>
      <div class="envelope" aria-hidden="true">
        <div class="seal">${ICON.lock}</div>
        <div class="seal-caption">Sealed from other banks</div>
      </div>`;
    $(".bid-name", b.card).textContent = name;
    $("#bid-grid").append(b.card);
    state.banks.set(name, b);
  }
  if (nodeId && !b.node_id) b.node_id = nodeId;
  if (model && !b.model) b.model = model;
  const m = $(".bid-model", b.card);
  if (b.model && !m.firstChild) m.append(el("span", { class: "model", title: b.model }, esc(shortModel(b.model))));
  return b;
}
function bankByNode(nodeId) {
  const n = state.nodes.get(nodeId);
  if (!n || n.role !== "bank") return null;
  return bankFor(n.name, nodeId, n.model);
}
function setBidState(b, text) { $(".bid-state", b.card).textContent = text; }
function addChip(b, cls, text, key) {
  const chips = $(".chips", b.card);
  if (key) chips.querySelector(`[data-key="${key}"]`)?.remove();
  chips.append(el("span", { class: `chip ${cls}${state.instant ? "" : " pop"}`, "data-key": key || null }, esc(text)));
}
function stamp(b, text) {
  b.card.querySelector(".rubber")?.remove();
  b.card.append(el("div", { class: "rubber", "aria-hidden": "true" }, esc(text)));
}

function renderQuote(b) {
  const q = b.quote;
  const aprCell = b.flagged && q.apr_stated != null
    ? `<dd title="Stated ${rate3(q.apr_stated)}; recomputed ${rate3(q.apr)}">${rate3(q.apr)}</dd>`
    : `<dd>${rate3(q.apr)}</dd>`;
  const was = b.round1Total != null && q.round === 2 && b.round1Total !== q.total_cost ? `<span class="was">${money(b.round1Total)}</span>` : "";
  $(".bid-body", b.card).innerHTML = `
    <div>
      <div class="total">${money(q.total_cost)}${was}</div>
      <div class="total-label">Total cost over ${esc(q.horizon_years ?? state.horizon)} years${q.round ? `, round ${esc(q.round)}` : ""}</div>
    </div>
    <dl class="terms">
      <div><dt>Rate</dt><dd>${rate3(q.rate)}</dd></div>
      <div><dt>Points</dt><dd>${pct(q.points, 3)}</dd></div>
      <div><dt>Fees</dt><dd>${money(q.fees)}</dd></div>
      <div><dt>APR</dt>${aprCell}</div>
    </dl>
    ${q.note ? `<p class="pitch">${esc(q.note)}</p>` : ""}`;
}

// ---------------------------------------------------------------- guard alert
let guardTimer;
function showGuard(evt) {
  const box = $("#guard-alert");
  const bank = evt.bank || nodeName(evt.node_id);
  const req = (evt.requested || []).map(humanize).join(", ");
  $(".guard-stamp", box).textContent = evt.action === "flagged" ? "Flagged" : "Blocked";
  $("#guard-title").textContent =
    evt.violation === "outbound_blocked"
      ? `An outbound message to ${bank} carried raw data and was stopped.`
      : `${bank} asked for ${req ? req.toLowerCase() : "raw data"}. Only bands leave your device.`;
  $("#guard-detail").textContent = evt.detail || "The request was dropped and written to the ledger.";
  box.hidden = false;
  box.classList.remove("leaving");
  box.style.animation = "none"; void box.offsetWidth; box.style.animation = "";
  clearTimeout(guardTimer);
  const hold = state.instant ? 0 : 6000 / Math.sqrt(speedFactor());
  guardTimer = setTimeout(() => {
    box.classList.add("leaving");
    guardTimer = setTimeout(() => { box.hidden = true; box.classList.remove("leaving"); }, 400);
  }, hold);
}

// ---------------------------------------------------------------- verdict
function renderVerdict() {
  const v = state.verdict;
  if (!v) return;
  const H = v.horizon_years ?? state.horizon;
  const ranking = Array.isArray(v.ranking) ? v.ranking : [];
  const best = ranking[0]?.total_cost ?? 0;
  const maxPrem = Math.max(1, ...ranking.map((r) => (r.total_cost ?? best) - best));
  const m = state.market;
  const win = ranking.find((r) => r.bank === v.winner) || ranking[0];
  const marketDiff = m && win ? win.rate - m.pmms_30y : null;
  const asOf = m?.as_of ? new Date(m.as_of + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  const callouts = `
    <div class="callouts">
      <div class="callout good">
        <div class="big">${money(win?.total_cost)}</div>
        <div class="small">${esc(v.winner)} over ${esc(H)} years, the lowest total cost</div>
      </div>
      <div class="callout good">
        <div class="big">${money(v.savings_vs_single_quote)}</div>
        <div class="small">saved compared with taking a single bank's first quote. ${v.savings_vs_worst != null ? `${money(v.savings_vs_worst)} less than the worst offer.` : ""}</div>
      </div>
      <div class="callout">
        <div class="big">${m ? pct(m.pmms_30y, 2) : "—"}</div>
        <div class="small">${m ? `Market average for a 30-year fixed, ${m.source ? `<a href="${esc(m.source)}" target="_blank" rel="noopener">Freddie Mac PMMS</a>` : "Freddie Mac PMMS"}${asOf ? `, ${esc(asOf)}` : ""}.${marketDiff != null ? ` The winning rate is ${Math.abs(marketDiff).toFixed(2)} points ${marketDiff <= 0 ? "below" : "above"} it.` : ""}` : "Waiting for market context."}</div>
      </div>
    </div>`;

  const rows = ranking.map((r, i) => {
    const prem = (r.total_cost ?? best) - best;
    const isWin = r.bank === v.winner;
    const flags = (r.flags || []).map((f) => `<span class="chip ${f === "apr_mismatch" || f.startsWith("requested") ? "flag" : f === "improved_round2" ? "improve" : "decline"}">${esc(FLAG_LABELS[f] || humanize(f))}</span>`).join(" ");
    const model = state.banks.get(r.bank)?.model;
    return `
      <tr class="${isWin ? "win" : ""}">
        <td class="pos">${i + 1}</td>
        <td><span class="bank">${esc(r.bank)}</span>${model ? ` <span class="model" title="${esc(model)}">${esc(shortModel(model))}</span>` : ""}${flags ? `<span class="flags chips">${flags}</span>` : ""}</td>
        <td class="num">${rate3(r.rate)}</td>
        <td class="num hide-sm">${pct(r.points, 3)}</td>
        <td class="num hide-md">${money(r.fees)}</td>
        <td class="num">${rate3(r.apr)}</td>
        <td class="num hide-md">${money(r.monthly_pi)}</td>
        <td class="total-cell">
          <div class="barline">
            <div class="bar"><i data-w="${isWin || prem <= 0 ? 0 : Math.max(2, (prem / maxPrem) * 100)}"></i></div>
            <div class="amt">${money(r.total_cost)}<span class="prem">${isWin || prem <= 0 ? "Lowest" : "+" + money(prem)}</span></div>
          </div>
        </td>
      </tr>`;
  }).join("");

  $("#verdict").innerHTML = `${callouts}
    <table class="rank">
      <thead><tr><th></th><th>Lender</th><th class="num">Rate</th><th class="num hide-sm">Points</th><th class="num hide-md">Fees</th><th class="num">APR</th><th class="num hide-md">Monthly P&amp;I</th><th>Total cost over ${esc(H)} years</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="bar-note">Bars show how much more each offer costs than the winner over ${esc(H)} years, including points, fees and interest.</p>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll("#verdict .bar i").forEach((i) => (i.style.width = i.dataset.w + "%"));
  }));
}

function renderNarrative() {
  const box = $("#narrative");
  if (!state.narrative) { box.innerHTML = ""; return; }
  // The coordinator also sends a markdown heading and table for `flwr chat`;
  // the verdict table above already shows them, so keep only the prose.
  const prose = state.narrative.split("\n").filter((l) => !/^\s*(#|\|)/.test(l)).join("\n").trim();
  if (!prose) { box.innerHTML = ""; return; }
  const paras = prose.split(/\n{2,}/).map((p) => esc(p).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>"));
  const caret = state.narrativeDone ? "" : '<span class="caret" aria-hidden="true"></span>';
  box.innerHTML = `<div class="by">The coordinator's explanation</div>` + paras.map((p, i) => `<p>${p}${i === paras.length - 1 ? caret : ""}</p>`).join("");
}

// ---------------------------------------------------------------- ledger
function renderLedger(parties) {
  const box = $("#ledger");
  box.innerHTML = "";
  (parties || []).forEach((p, i) => {
    const learned = (p.learned || []).map((x) => `<li class="y">${esc(x)}</li>`).join("");
    const never = (p.never || []).map((x) => `<li class="n">${esc(x)}</li>`).join("");
    const card = el("article", { class: "party", style: `animation-delay:${state.instant ? 0 : i * 110}ms` },
      `<h3>${esc(p.party)}</h3><div class="role">${esc(p.role || "")}</div>
       ${learned ? `<ul aria-label="Learned">${learned}</ul>` : ""}
       ${never ? `<ul class="split" aria-label="Never learned">${never}</ul>` : ""}`);
    box.append(card);
  });
}

// ---------------------------------------------------------------- stages
function setStage(stage, status, label) {
  const idx = STAGES.indexOf(stage);
  if (idx < 0) return;
  document.querySelectorAll("#stages li").forEach((li, i) => {
    if (i < idx) { li.classList.remove("active"); li.classList.add("done"); }
  });
  const li = $(`#stages li[data-stage="${stage}"]`);
  if (label) $(".stage-label", li).textContent = label;
  if (status === "done") { li.classList.remove("active"); li.classList.add("done"); }
  else { li.classList.add("active"); li.classList.remove("done"); }
}

// ---------------------------------------------------------------- event log
function logEvent(evt) {
  state.events++;
  $("#log-count").textContent = `${state.events} event${state.events === 1 ? "" : "s"}`;
  const { type, ts, ...rest } = evt;
  const li = el("li");
  li.append(
    el("span", { class: "t" }, esc(typeof ts === "number" ? ts.toFixed(2) + "s" : "")),
    el("span", { class: "k" + (type === "bq.guard" || type === "bq.error" ? " guard" : "") }, esc(type)),
    el("span", { class: "j" }, esc(JSON.stringify(rest))),
  );
  $("#log-list").append(li);
  const body = $("#log-body");
  if (!body.hidden) body.scrollTop = body.scrollHeight;
}

// ================================================================ the reducer
function handleEvent(evt) {
  if (!evt || typeof evt.type !== "string") return;
  logEvent(evt);
  try { reduce(evt); } catch (err) { console.warn("BlindQuote: could not render event", evt.type, err); }
}

function reduce(evt) {
  switch (evt.type) {
    case "bq.run": {
      state.mode = evt.mode;
      if (evt.horizon_years) state.horizon = evt.horizon_years;
      if (evt.prompt && runner.kind === "replay") $("#prompt").value = evt.prompt;
      drawNetwork();
      break;
    }
    case "bq.stage":
      setStage(evt.stage, evt.status, evt.label);
      break;

    case "bq.node": {
      // The coordinator is the fixed hub, not a node on the ring.
      if (evt.role === "coordinator") { light("coordinator"); break; }
      state.nodes.set(evt.node_id, {
        node_id: evt.node_id, role: evt.role, name: evt.name, org_kind: evt.org_kind, model: evt.model ?? null, location: evt.location ?? null,
      });
      if (evt.role === "bank") bankFor(evt.name, evt.node_id, evt.model);
      drawNetwork();
      light(evt.node_id);
      break;
    }

    case "bq.msg": {
      const bad = false;
      pulse(evt.from, evt.to, !!evt.sealed, bad);
      light(evt.from); light(evt.to);
      const fields = (evt.fields || []).slice(0, 6).join(", ") + ((evt.fields || []).length > 6 ? ", …" : "");
      wire(`<span class="route">${esc(nodeName(evt.from))} to ${esc(nodeName(evt.to))}</span>${evt.sealed ? " (sealed)" : ""}. ${esc(withPeriod(evt.summary || evt.kind))}${fields ? ` <span class="fields">Carries ${esc(fields)}.</span>` : ""}`,
        evt.sealed ? ICON.envelope : ICON.open);
      if (evt.kind === "quote_request" || evt.kind === "counter_request") {
        const b = bankByNode(evt.to);
        if (b) {
          if (!b.quote) { b.card.classList.add("requested"); setBidState(b, "Bid requested"); }
          else setBidState(b, "Asked to improve");
        }
      }
      break;
    }

    case "bq.bands":
      renderBands(evt.bands);
      renderLocked(evt.withheld && evt.withheld.length ? evt.withheld : DEFAULT_WITHHELD);
      break;

    case "bq.attest": {
      const box = $("#attest");
      box.hidden = false;
      box.classList.toggle("bad", !evt.signature_ok);
      $("#attest-band").textContent = `FICO ${evt.fico_band}`;
      $("#attest-by").textContent = evt.signature_ok
        ? `Signed by ${evt.bureau}. Signature verified; your exact score stayed at the bureau.`
        : `Signature from ${evt.bureau} failed verification. Banks will not accept this band.`;
      box.style.animation = "none"; void box.offsetWidth; box.style.animation = "arrive 900ms ease-out";
      break;
    }

    case "bq.quote": {
      const b = bankFor(evt.bank, evt.node_id, evt.model);
      if (!b) break;
      if (evt.round === 1 || b.round1Total == null) b.round1Total = evt.total_cost;
      b.quote = { ...evt };
      b.card.classList.remove("requested", "sealed");
      b.card.classList.add("open");
      renderQuote(b);
      setBidState(b, evt.round === 2 ? "Round 2 counteroffer" : "Bid opened");
      if (evt.apr_stated != null && evt.apr != null && Math.abs(evt.apr_stated - evt.apr) > 0.125 && !b.flagged) {
        b.flagged = true;
        renderQuote(b);
        addChip(b, "flag", `Says APR ${rate3(evt.apr_stated)}, actually ${rate3(evt.apr)}`, "apr");
      }
      light(b.node_id);
      break;
    }

    case "bq.guard": {
      const b = bankFor(evt.bank, evt.node_id);
      const req = (evt.requested || []).map(humanize).join(", ");
      if (evt.violation === "apr_mismatch") {
        if (b) {
          b.flagged = true;
          b.card.classList.add("flagged");
          if (b.quote) renderQuote(b);
          const q = b.quote;
          addChip(b, "flag", q && q.apr_stated != null ? `Says APR ${rate3(q.apr_stated)}, actually ${rate3(q.apr)}` : "APR doesn't match its terms", "apr");
        }
        wire(`<span class="route">${esc(withPeriod("Guard flagged " + evt.bank))}</span> ${esc(evt.detail || "Stated APR does not match its terms.")}`, ICON.bad, "bad");
      } else {
        if (b) {
          b.blocked = true;
          b.card.classList.add("blocked");
          stamp(b, evt.action === "flagged" ? "Flagged" : "Blocked");
          addChip(b, "flag", req ? `Asked for ${req.toLowerCase()}` : "Tried to move raw data", "req");
          if (!b.quote) setBidState(b, "Request blocked, bands only");
        }
        showGuard(evt);
        wire(`<span class="route">${esc(withPeriod(`Guard ${evt.action === "flagged" ? "flagged" : "blocked"} ${evt.bank || nodeName(evt.node_id)}`))}</span> ${req ? `Requested ${esc(req.toLowerCase())}.` : ""} ${esc(evt.detail || "")}`, ICON.bad, "bad");
        drawNetwork();
        if (b?.node_id) markBlockedEdge(b.node_id);
      }
      break;
    }

    case "bq.decline": {
      const b = bankFor(evt.bank);
      if (!b) break;
      b.card.classList.add("declined");
      b.card.classList.remove("requested");
      if (!b.quote) {
        b.card.classList.remove("sealed");
        b.card.classList.add("open");
        $(".bid-body", b.card).innerHTML = `<p class="pitch">${esc(evt.message || "Declined to quote.")}</p>`;
      } else if (evt.message) {
        const p = $(".pitch", b.card);
        if (p) p.textContent = evt.message; else $(".bid-body", b.card).insertAdjacentHTML("beforeend", `<p class="pitch">${esc(evt.message)}</p>`);
      }
      const why = DECLINE_REASONS[evt.reason] || (evt.reason ? humanize(evt.reason).toLowerCase() : "");
      addChip(b, "decline", `Declined round ${evt.round ?? ""}${why ? `: ${why}` : ""}`, "decline");
      setBidState(b, evt.round === 2 ? "Holding round 1 offer" : "Declined");
      break;
    }

    case "bq.improve": {
      const b = bankFor(evt.bank);
      if (!b) break;
      if (b.round1Total == null) b.round1Total = evt.from_total;
      addChip(b, "improve", `Saved you ${money(evt.delta)} in round 2`, "improve");
      if (b.quote) renderQuote(b);
      break;
    }

    case "bq.market":
      state.market = evt;
      renderVerdict();
      break;

    case "bq.verdict": {
      state.verdict = evt;
      if (evt.horizon_years) state.horizon = evt.horizon_years;
      renderVerdict();
      for (const b of state.banks.values()) {
        b.card.classList.toggle("winner", b.name === evt.winner);
        $('.chips [data-key="win"]', b.card)?.remove();
        if (b.name === evt.winner) {
          addChip(b, "win", `Lowest total cost over ${evt.horizon_years ?? state.horizon} years`, "win");
          const chips = $(".chips", b.card);
          chips.prepend(chips.lastChild);
        }
      }
      drawNetwork();
      if (!state.instant) $("#verdict-row").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      break;
    }

    case "response.output_text.delta":
      state.narrative += evt.delta || "";
      renderNarrative();
      break;
    case "response.completed":
      state.narrativeDone = true;
      renderNarrative();
      break;

    case "bq.ledger":
      renderLedger(evt.parties);
      break;

    case "bq.done":
      state.finished = true;
      state.narrativeDone = true;
      renderNarrative();
      finishRun(`Finished in ${typeof evt.elapsed_s === "number" ? evt.elapsed_s.toFixed(1) : "?"} s. ${state.events} events.`);
      break;

    case "bq.error":
      state.finished = true;
      wire(`<span class="route">Run stopped</span>. ${esc(evt.message)}`, ICON.bad, "bad");
      finishRun(`The run stopped: ${evt.message || "unknown error"}. Reset and try again, or switch to Replay.`, true);
      break;

    default:
      break; // unknown events still appear in the raw log
  }
}

// ================================================================ runners
const runner = { kind: null, timer: null, es: null, speed: 1, events: [], idx: 0, vt: 0, last: 0 };
const speedFactor = () => (runner.kind === "replay" ? runner.speed : 1);

function status(text, err = false) {
  const p = $("#status");
  p.textContent = text;
  p.classList.toggle("err", err);
}
function selectedMode() { return document.querySelector('input[name="mode"]:checked')?.value || "replay"; }

function stopRunner() {
  clearInterval(runner.timer);
  runner.timer = null;
  if (runner.es) { runner.es.close(); runner.es = null; }
  runner.kind = null;
  $("#run").disabled = false;
}
function finishRun(msg, err = false) {
  clearInterval(runner.timer);
  runner.timer = null;
  if (runner.es) { runner.es.close(); runner.es = null; }
  $("#run").disabled = false;
  status(msg, err);
}

function resetUI() {
  stopRunner();
  clearTimeout(guardTimer);
  state = freshState();
  $("#bid-grid").innerHTML = "";
  $("#wire").innerHTML = "";
  $("#log-list").innerHTML = "";
  $("#log-count").textContent = "0 events";
  $("#bands").innerHTML = '<div class="empty">Nothing shared yet.</div>';
  $("#attest").hidden = true;
  $("#guard-alert").hidden = true;
  renderLocked(DEFAULT_WITHHELD);
  $("#verdict").innerHTML = '<p class="empty">The ranking appears once both rounds close.</p>';
  $("#narrative").innerHTML = "";
  $("#ledger").innerHTML = '<p class="empty">The ledger is written when the run ends.</p>';
  document.querySelectorAll("#stages li").forEach((li) => {
    li.classList.remove("active", "done");
    $(".stage-label", li).textContent = li.dataset.defaultLabel;
  });
  initNetwork();
}

async function startReplay() {
  resetUI();
  runner.kind = "replay";
  $("#run").disabled = true;
  status("Loading the recorded run…");
  let data;
  try {
    const res = await fetch("fixtures/sample-run.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    finishRun(`Couldn't load fixtures/sample-run.json (${err.message}). Serve this folder over HTTP, for example python3 -m http.server.`, true);
    runner.kind = null;
    return;
  }
  if (runner.kind !== "replay") return; // reset while loading
  runner.events = (data.events || []).slice().sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  runner.idx = 0;
  runner.vt = (runner.events[0]?.ts ?? 0) - 0.4;
  runner.last = performance.now();
  status(`Playing the recorded run at ${runner.speed}×.`);
  runner.timer = setInterval(tick, 40);
}
function tick() {
  const now = performance.now();
  runner.vt += ((now - runner.last) / 1000) * runner.speed;
  runner.last = now;
  while (runner.idx < runner.events.length && (runner.events[runner.idx].ts ?? 0) <= runner.vt) {
    handleEvent(runner.events[runner.idx++]);
  }
  if (runner.idx >= runner.events.length) {
    clearInterval(runner.timer);
    runner.timer = null;
    $("#run").disabled = false;
    if (!state.finished) status("Recording ended.");
  }
}
function skipToEnd() {
  if (runner.kind !== "replay" || !runner.timer) return;
  clearInterval(runner.timer);
  runner.timer = null;
  state.instant = true;
  while (runner.idx < runner.events.length) handleEvent(runner.events[runner.idx++]);
  state.instant = false;
  $("#run").disabled = false;
  $("#verdict-row").scrollIntoView({ behavior: "auto", block: "start" });
}

async function startLive(mode) {
  resetUI();
  runner.kind = "live";
  $("#run").disabled = true;
  const prompt = $("#prompt").value.trim();
  status("Starting the run…");
  let runId;
  try {
    const res = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: API_MODE[mode], prompt }) });
    if (!res.ok) throw new Error(`server answered ${res.status}`);
    runId = (await res.json()).run_id;
    if (!runId) throw new Error("no run_id in the response");
  } catch (err) {
    finishRun(`Couldn't start a ${modeName(mode)} run: ${err.message}. Check the server, or switch to Replay.`, true);
    runner.kind = null;
    return;
  }
  if (runner.kind !== "live") return;
  status(`Running on ${modeName(mode)}. Run ${runId}.`);
  const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
  runner.es = es;
  es.onmessage = (m) => {
    let evt;
    try { evt = JSON.parse(m.data); } catch { return; }
    handleEvent(evt);
    if (evt.type === "bq.done" || evt.type === "bq.error") { es.close(); if (runner.es === es) runner.es = null; }
  };
  es.onerror = () => {
    if (runner.es !== es) return;
    es.close();
    runner.es = null;
    if (!state.finished) finishRun("Lost the event stream before the run finished. Reset and run again.", true);
  };
}
const modeName = (m) => ({ replay: "Replay", sim: "Simulation", local: "Local Flower", supergrid: "SuperGrid" }[m] || m);

// ================================================================ server status
async function checkStatus() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch("/api/status", { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const modes = data.modes || {};
    const on = [];
    for (const key of ["sim", "local", "supergrid"]) {
      const input = document.querySelector(`input[name="mode"][value="${key}"]`);
      input.disabled = !modes[key];
      if (modes[key]) on.push(modeName(key));
    }
    status(on.length ? `Server connected. Available: Replay, ${on.join(", ")}.` : "Server connected, but only Replay is available right now.");
  } catch {
    status("Replay only. No BlindQuote server answered at this address.");
  } finally {
    clearTimeout(t);
  }
}

function syncModeUI() {
  const replay = selectedMode() === "replay";
  $("#speed").classList.toggle("off", !replay);
  $("#run").textContent = replay ? "Play recorded run" : "Get sealed quotes";
}

// ================================================================ boot
function boot() {
  makeGuilloche();
  document.querySelectorAll("#stages li").forEach((li) => (li.dataset.defaultLabel = $(".stage-label", li).textContent));
  state = freshState();
  resetUI();

  $("#ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const mode = selectedMode();
    if (mode === "replay") startReplay();
    else startLive(mode);
  });
  $("#reset").addEventListener("click", () => { resetUI(); status("Cleared. Ready for another run."); });
  $("#modes").addEventListener("change", syncModeUI);
  $("#speed").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-speed]");
    if (!btn) return;
    runner.speed = Number(btn.dataset.speed);
    document.querySelectorAll("#speed button[data-speed]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    if (runner.kind === "replay" && runner.timer) status(`Playing the recorded run at ${runner.speed}×.`);
  });
  $("#skip").addEventListener("click", skipToEnd);
  $("#log-toggle").addEventListener("click", () => {
    const body = $("#log-body");
    const open = body.hidden;
    body.hidden = !open;
    $("#log-toggle").setAttribute("aria-expanded", String(open));
    if (open) body.scrollTop = body.scrollHeight;
  });

  syncModeUI();
  checkStatus();

  // ?autoplay=1 starts the replay on load (handy for a projector).
  if (new URLSearchParams(location.search).get("autoplay")) startReplay();
}

boot();

// Exposed for debugging from the console.
window.blindquote = { handleEvent, get state() { return state; } };
