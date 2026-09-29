import { useEffect, useRef, useState } from 'react';

/** A number that tweens from the previous value to the new one. Text-only; no layout change. */
export default function CountUp({ value, prefix = '', suffix = '', decimals = 0, duration = 700 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    const end = Number(value) || 0;
    if (start === end) return;
    const t0 = performance.now();
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (end - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step); else from.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const n = Number(shown) || 0;
  const text = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString();
  return <>{prefix}{text}{suffix}</>;
}
