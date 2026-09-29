import { useEffect, useRef, useState } from 'react';
import { findListings, startHomeNegotiation } from '../../core/home.js';
import { computeBands } from '../../core/bands.js';
import { Lock, Check, Arrow, Spinner, Shield } from './Icons.jsx';

const money = (v) => `$${Math.round(v).toLocaleString()}`;

export default function StageHome({ form, bands, onDone, onSkip }) {
  const listings = findListings(form);
  const [picked, setPicked] = useState(null);
  const [turns, setTurns] = useState([]);
  const [result, setResult] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (!picked) return;
    setTurns([]); setResult(null);
    const run = startHomeNegotiation(picked, form, (e) => {
      if (e.type === 'turn') setTurns((t) => [...t, e]);
      else setResult(e);
    });
    return run.cancel;
  }, [picked, form]);

  useEffect(() => { logRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [turns, result]);

  const downPayment = (Number(form.propertyPrice) || 0) - (Number(form.amount) || 0);
  const newLoan = result?.type === 'agreed' ? result.price - downPayment : null;
  const after = newLoan ? computeBands({ ...form, propertyPrice: result.price, amount: newLoan, _token: bands.token }) : null;

  return (
    <div className="stage home">
      <div className="home-l">
        <div className="split-h">
          <h2>Your home agent found {listings.length} homes</h2>
          <p className="sub">Searched on your ranges only: price band and cash, not your name or income. Pick one and your agent negotiates the price with the seller's agent.</p>
        </div>
        <div className="listings">
          {listings.map((l) => (
            <button type="button" key={l.id} className={`listing ${picked?.id === l.id ? 'on' : ''}`} onClick={() => setPicked(l)}>
              <div className="listing-top"><b>{l.address}</b><span className={`tag ${l.fit === 'Under target' ? 'done' : 'idle'}`}>{l.fit}</span></div>
              <div className="listing-mid"><span className="m">{money(l.asking)}</span><span className="sub">{l.beds} bd · {l.baths} ba · {l.sqft.toLocaleString()} sq ft · {l.days} days listed</span></div>
              <div className="sub">{l.note}</div>
            </button>
          ))}
        </div>
        <div className="split-foot" style={{ marginTop: 'auto' }}>
          <span className="sub">Already have a home under contract?</span>
          <button type="button" className="btn ghost small" onClick={onSkip}>Skip to lenders</button>
        </div>
      </div>

      <div className="home-r">
        {!picked ? (
          <div className="dropbox" style={{ flex: 1 }}>
            <div className="drop-ic"><Shield width={26} height={26} /></div>
            <h3>Pick a home to start</h3>
            <p>Your agent opens with comparable sales, never with your budget. The seller's agent never learns your cap.</p>
          </div>
        ) : (
          <div className="card negotiate">
            <div className="card-h row">
              <span className="ic blue"><Arrow width={18} height={18} /></span>
              <div><h2>Negotiating {picked.address.split(',')[0]}</h2><p className="sub">Asking {money(picked.asking)} · your agent vs. the seller's agent</p></div>
              <span className="spacer" />
              {!result && <span className="tag work"><Spinner width={12} height={12} />Talking</span>}
              {result?.type === 'agreed' && <span className="tag done"><Check width={12} height={12} />Agreed</span>}
              {result?.type === 'walked' && <span className="tag warn">Walked away</span>}
            </div>
            <div className="transcript" ref={logRef}>
              {turns.map((e, i) => (
                <div className={`msg ${e.who === 'buyer' ? 'out' : 'in'}`} key={i}>
                  <span className="who">{e.who === 'buyer' ? 'Your agent → Seller\'s agent' : 'Seller\'s agent → Your agent'} <span className="tag idle">{e.move}</span></span>
                  {e.text}
                </div>
              ))}
              {!turns.length && <div className="sub">Opening…</div>}
              {result && <div className={`msg ${result.type === 'agreed' ? 'in' : 'blocked'}`} style={{ alignSelf: 'center', maxWidth: '100%' }}>{result.text}</div>}
            </div>
            {result?.type === 'agreed' && (
              <div className="deal">
                <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                  <div className="kpi"><span className="k">Asking</span><span className="v">{money(picked.asking)}</span></div>
                  <div className="kpi green"><span className="k">Agreed</span><span className="v">{money(result.price)}</span><span className="n">{money(result.savings)} under asking</span></div>
                  <div className="kpi"><span className="k">New loan</span><span className="v">{money(newLoan)}</span><span className="n">same {money(downPayment)} down</span></div>
                  <div className="kpi blue"><span className="k">Loan vs. value</span><span className="v">{bands.ltvBand} → {after.ltvBand}</span><span className="n">{after.ltvBand !== bands.ltvBand ? 'cheaper pricing tier' : 'same tier'}</span></div>
                </div>
                <div className="note"><Lock width={14} height={14} /><span>Only the new ranges go to the lenders. The seller's agent never saw your budget; the lenders never see the address.</span></div>
                <div className="stage-foot" style={{ padding: '12px 0 0' }}>
                  <span className="spacer" />
                  <button type="button" className="btn primary" onClick={() => onDone({ price: result.price, loan: newLoan, listing: picked })}>Send new ranges to lenders</button>
                </div>
              </div>
            )}
            {result?.type === 'walked' && (
              <div className="stage-foot" style={{ padding: '12px 0 0' }}><span className="sub">Pick another home, or continue with your original numbers.</span><span className="spacer" /><button type="button" className="btn ghost" onClick={onSkip}>Continue to lenders</button></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
