// Home agent: finds listings that fit the sealed ranges, then negotiates the
// price with the seller's agent. Simulated in the browser.
//
// ================= THE SEAM =================
// In the federation this is two more nodes: a "home" node (listing search,
// runs on the borrower's device with the mandate) and one "seller-agent" node
// per listing (the listing agent's private floor + model). The coordinator
// relays `offer` / `counter` / `accept` moves between them exactly as it does
// `quote` / `counter` for banks. Keep the event shapes below.
//
//   { type:'listing',  t, listing }                     a listing the home agent found
//   { type:'turn',     t, who:'buyer'|'seller', move:'offer'|'counter'|'hold'|'accept', price, text }
//   { type:'agreed',   t, price, savings, text }        deal closed
//   { type:'walked',   t, text }                        buyer agent walked away
// =============================================

const money = (v) => `$${Math.round(v).toLocaleString()}`;

// Synthetic listings. `floor` is the seller's private walk-away price; it never
// leaves the seller node. `motivation` shapes how fast the seller moves.
const LISTINGS = [
  { id: 'l1', address: '2140 Fillmore St, San Francisco', beds: 3, baths: 2, sqft: 1780, asking: 875000, floor: 838000, days: 41, motivation: 'high', note: 'On market 41 days, one price cut already' },
  { id: 'l2', address: '318 Clipper St, Noe Valley', beds: 3, baths: 2.5, sqft: 1920, asking: 899000, floor: 880000, days: 6, motivation: 'low', note: 'New listing, two other offers expected' },
  { id: 'l3', address: '1580 Diamond St, Glen Park', beds: 2, baths: 2, sqft: 1540, asking: 829000, floor: 805000, days: 23, motivation: 'medium', note: 'Estate sale, seller wants a clean close' },
];

/** What the home agent can afford, from ranges only. */
export function budgetFrom(form) {
  const price = Number(form.propertyPrice) || 850000;
  return { target: price, max: Math.round(price * 1.06), min: Math.round(price * 0.9) };
}

export function findListings(form) {
  const b = budgetFrom(form);
  return LISTINGS.filter((l) => l.asking <= b.max && l.asking >= b.min).map((l) => ({ ...l, fit: l.asking <= b.target ? 'Under target' : 'Above target' }));
}

/**
 * Buyer agent vs seller agent, up to 4 turns. The buyer's agent knows the
 * mandate (cash, payment cap); the seller's agent knows the floor. Neither
 * sees the other's number. Code clamps: the seller never goes below floor,
 * the buyer never exceeds its max.
 */
export function startHomeNegotiation(listing, form, onEvent) {
  const timers = [];
  let t = 0;
  const at = (delay, ev) => { t += delay; timers.push(setTimeout(() => onEvent({ t: Math.round(t / 100) / 10, ...ev }), t)); };
  const b = budgetFrom(form);
  const buyerMax = Math.min(b.max, listing.asking);
  const comps = Math.round(listing.asking * 0.965);
  const pace = { high: 0.55, medium: 0.4, low: 0.2 }[listing.motivation];

  let buyer = Math.round(Math.min(buyerMax, listing.asking * 0.94) / 1000) * 1000;
  let seller = listing.asking;

  at(600, { type: 'turn', who: 'buyer', move: 'offer', price: buyer, text: `Comparable sales in the last 90 days average ${money(comps)}. ${listing.days > 30 ? `The home has been listed ${listing.days} days.` : ''} We offer ${money(buyer)}, 30-day close, financing already pre-qualified with six lenders.` });

  for (let turn = 0; turn < 3; turn++) {
    const gap = seller - buyer;
    if (gap <= 5000) break;
    const sellerNext = Math.max(listing.floor, Math.round((seller - gap * pace) / 1000) * 1000);
    if (sellerNext >= seller) {
      at(1500, { type: 'turn', who: 'seller', move: 'hold', price: seller, text: `We're holding at ${money(seller)}. There is other interest in the property.` });
    } else {
      seller = sellerNext;
      at(1500, { type: 'turn', who: 'seller', move: 'counter', price: seller, text: `The seller can come to ${money(seller)}${listing.motivation === 'high' ? ' for a quick, clean close' : ''}.` });
    }
    const gap2 = seller - buyer;
    if (gap2 <= 5000) { buyer = seller; at(1200, { type: 'turn', who: 'buyer', move: 'accept', price: seller, text: `${money(seller)} works within the mandate. We accept, contingent on appraisal.` }); break; }
    const buyerNext = Math.min(buyerMax, Math.round((buyer + gap2 * 0.45) / 1000) * 1000);
    if (buyerNext <= buyer || buyerNext > buyerMax) {
      at(1200, { type: 'turn', who: 'buyer', move: 'hold', price: buyer, text: `${money(buyer)} is our number. It keeps the loan inside the borrower's payment cap.` });
    } else {
      buyer = buyerNext;
      at(1200, { type: 'turn', who: 'buyer', move: 'counter', price: buyer, text: `We can meet you at ${money(buyer)} with a 21-day close and no repair credits.` });
    }
  }

  const finalPrice = Math.min(seller, Math.max(buyer, listing.floor));
  const accepted = finalPrice <= buyerMax;
  if (accepted) {
    if (buyer !== finalPrice) at(1200, { type: 'turn', who: 'seller', move: 'accept', price: finalPrice, text: `Agreed at ${money(finalPrice)}.` });
    at(800, { type: 'agreed', price: finalPrice, savings: listing.asking - finalPrice, text: `Agreed at ${money(finalPrice)}, ${money(listing.asking - finalPrice)} under asking. Sending the new loan amount to the lenders.` });
  } else {
    at(800, { type: 'walked', text: `The seller will not come under ${money(seller)}, which breaks the payment cap. Your agent walked away.` });
  }
  return { cancel: () => timers.forEach(clearTimeout) };
}
