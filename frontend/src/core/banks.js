// The banks that bid. In the target architecture each one is its own Flower
// SuperNode with a private rate sheet; `persona` becomes that node's model
// instructions and `spread`/`floor` live in its rate_sheet.json.
//
// Logos load from Google's public favicon service by domain. For the demo this
// is the simplest way to show real marks; confirm with the team that showing
// them is fine for the presentation, or swap `logo` for a local file.

export const BANKS = [
  { id: 'bofa', name: 'Bank of America', short: 'BofA', domain: 'bankofamerica.com', color: '#E31837', spread: 0.25, points: 0.0, fees: 2400, floorDelta: 0.375, persona: 'large national bank, conservative, values strong assets', greedy: false },
  { id: 'citi', name: 'Citibank', short: 'Citi', domain: 'citi.com', color: '#003B70', spread: 0.375, points: 0.25, fees: 2100, floorDelta: 0.5, persona: 'global bank, competitive on rate for high credit bands', greedy: false },
  { id: 'chase', name: 'Chase', short: 'Chase', domain: 'chase.com', color: '#117ACA', spread: 0.125, points: 0.5, fees: 2950, floorDelta: 0.25, persona: 'relationship bank, likes primary residences', greedy: false },
  { id: 'wells', name: 'Wells Fargo', short: 'Wells', domain: 'wellsfargo.com', color: '#D71E28', spread: 0.5, points: 0.0, fees: 1800, floorDelta: 0.625, persona: 'wide branch network, slower to improve', greedy: false },
  { id: 'usbank', name: 'U.S. Bank', short: 'U.S. Bank', domain: 'usbank.com', color: '#0C2074', spread: 0.0, points: 1.75, fees: 3900, floorDelta: 0.125, persona: 'low headline rate, recovers margin in points and fees; asks for more data than allowed', greedy: true },
  { id: 'navy', name: 'Navy Federal Credit Union', short: 'Navy Federal', domain: 'navyfederal.org', color: '#0F2E5C', spread: 0.25, points: 0.125, fees: 1500, floorDelta: 0.375, persona: 'member-owned credit union, low fees, moderate rate', greedy: false },
];

export const logoUrl = (bank) => `https://www.google.com/s2/favicons?domain=${bank.domain}&sz=64`;

// Market base rate the rate sheets start from. The plan pulls this from
// Freddie Mac PMMS via web_fetch; hard-coded here for the wireframe.
export const MARKET_BASE_RATE = 6.0;
