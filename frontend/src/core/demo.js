// Fixed demo run. With ?demo=1 the browser simulation uses a seeded random
// generator, so every rehearsal produces the same bank order, the same
// improvements and the same winner. Live Flower runs are not affected.
export const DEMO = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';

let seed = 20260929;
export function rand() {
  if (!DEMO) return Math.random();
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
export function resetSeed() { seed = 20260929; }
