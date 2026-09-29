import { useEffect, useState } from 'react';
import { Lock, Arrow, Check, Block } from './Icons.jsx';

/**
 * One shape for every gate. Nothing leaves the device until the user clicks Approve.
 *   releases: strings that WILL cross when approved
 *   keeps:    strings that never cross
 */
export default function Approval({ kicker, title, releases = [], keeps = [], approveLabel = 'Approve', backLabel = 'Back', onApprove, onBack, children, amber, autoSeconds }) {
  const [left, setLeft] = useState(autoSeconds || 0);
  useEffect(() => {
    if (!autoSeconds) return;
    setLeft(autoSeconds);
    const id = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(id); onBack?.(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(id);
  }, [autoSeconds, onBack]);

  return (
    <div className="scrim" onClick={onBack}>
      <div className={`approval ${amber ? 'amber' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="kicker">{kicker}</div>
        <h2>{title}</h2>
        {children}
        <div className="approval-cols">
          <div className="approval-col rel">
            <div className="lbl"><Arrow width={12} height={12} />This releases</div>
            {releases.length ? releases.map((r) => <div className="row" key={r}>{r}</div>) : <div className="row muted">Nothing</div>}
          </div>
          <div className="approval-col keep">
            <div className="lbl"><Lock width={12} height={12} />This never releases</div>
            {keeps.map((k) => <div className="row" key={k}>{k}</div>)}
          </div>
        </div>
        <div className="approval-foot">
          <button type="button" className={`btn ${amber ? 'primary' : 'ghost'}`} onClick={onBack}>{amber ? <Block width={12} height={12} /> : null}{backLabel}{autoSeconds && left ? ` (${left})` : ''}</button>
          <span className="spacer" />
          <button type="button" className={`btn ${amber ? 'ghost' : 'primary'}`} onClick={onApprove}><Check width={12} height={12} />{approveLabel}</button>
        </div>
      </div>
    </div>
  );
}
