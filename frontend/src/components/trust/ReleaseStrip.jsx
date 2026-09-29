import { Lock, Arrow, Block } from './Icons.jsx';

/** Persistent counts in the tab bar. They only change at a gate, never silently. */
export default function ReleaseStrip({ shared = 0, locked = 0, blocked = 0 }) {
  return (
    <div className="strip">
      <span className="strip-i blue"><Arrow width={12} height={12} /><b>{shared}</b> ranges shared</span>
      <span className="strip-i slate"><Lock width={12} height={12} /><b>{locked}</b> values locked</span>
      <span className={`strip-i ${blocked ? 'amber' : 'muted'}`}><Block width={12} height={12} /><b>{blocked}</b> blocked</span>
    </div>
  );
}
