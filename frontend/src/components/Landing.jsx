import { useEffect, useState } from 'react';
import AuthForm from './AuthForm.jsx';

const PETAL = 'M120 118C92 100 86 58 96 38C104 22 136 22 144 38C154 58 148 100 120 118Z';
const PETALS = [
  { a: 0, fill: '#2A4A82' },
  { a: 60, fill: '#5F80BF' },
  { a: 120, fill: '#2A4A82' },
  { a: 180, fill: '#5F80BF' },
  { a: 240, fill: '#2A4A82' },
  { a: 300, fill: '#5F80BF' },
];

export function FlowerMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="18 18 204 204" aria-hidden="true">
      <g fill="#2A4A82">
        <path d={PETAL} />
        {PETALS.slice(1).map((p) => (
          <path key={p.a} d={PETAL} transform={`rotate(${p.a} 120 120)`} />
        ))}
      </g>
      <circle cx="120" cy="120" r="30" fill="#161616" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="24" height="24" aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill="#2A4A82" />
      <path d="M7.4 12.4l3 3 6.2-6.4" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Landing({ onAuth }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('login');

  const showLogin = (event) => {
    event.preventDefault();
    setMode('login');
    document.getElementById('email')?.focus();
    document.getElementById('auth')?.scrollIntoView({ block: 'center' });
  };

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setOpen(true);
      return;
    }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="landing">
      <header className="landing-top landing-wrap">
        <a className="landing-brand" href="#top">
          <FlowerMark />
          <span>Flower Finance</span>
        </a>
        <a className="landing-login" href="#auth" onClick={showLogin}>Log in</a>
      </header>

      <main id="top">
        <section className="landing-stage">
          <div className="landing-wrap landing-grid">
            <div>
              <h1>Agent-negotiated loans.</h1>
              <p className="landing-tagline">Your exact numbers never leave your device.</p>
              <p className="landing-lede">Your agent shops lenders and haggles for a lower rate. Lenders get a simple yes, like "income clears the bar", never the figures behind it.</p>
              <ul className="landing-perks">
                <li><Check />Shops every lender for you</li>
                <li><Check />Pushes for a better rate</li>
                <li><Check />Nothing signed until you say yes</li>
              </ul>
            </div>

            <div className="landing-auth" id="auth">
              <svg className={`landing-bloom${open ? ' open' : ''}`} viewBox="18 18 204 204" aria-hidden="true">
                <g stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round">
                  {PETALS.map((p, i) => (
                    <path
                      key={p.a}
                      className="landing-petal"
                      style={{ '--a': `${p.a}deg`, '--i': i }}
                      fill={p.fill}
                      d={PETAL}
                    />
                  ))}
                </g>
                <circle cx="120" cy="120" r="30" fill="#161616" />
              </svg>
              <AuthForm onAuth={onAuth} mode={mode} onMode={setMode} />
            </div>
          </div>
        </section>

        <section className="landing-how" id="how">
          <div className="landing-wrap">
            <h2>How it works</h2>
            <ol className="landing-steps">
              <li>
                <span className="landing-num" aria-hidden="true">1</span>
                <h3>Add your details</h3>
                <p>Tell Flower what you want to borrow. Your income, debts and credit stay on your phone.</p>
              </li>
              <li>
                <span className="landing-num" aria-hidden="true">2</span>
                <h3>Your agent negotiates</h3>
                <p>It asks lenders for offers and pushes for better terms, sharing proofs instead of numbers.</p>
              </li>
              <li>
                <span className="landing-num" aria-hidden="true">3</span>
                <h3>You pick the winner</h3>
                <p>See the best offers side by side. Nothing is signed until you say yes.</p>
              </li>
            </ol>
          </div>
        </section>
      </main>

      <footer className="landing-foot">
        <div className="landing-wrap landing-foot-inner">
          <a className="landing-brand" href="#top"><FlowerMark size={24} /><span>Flower Finance</span></a>
          <p>Flower is your agent, not a lender.</p>
          <p>&copy; 2026 Flower Finance</p>
        </div>
      </footer>
    </div>
  );
}
