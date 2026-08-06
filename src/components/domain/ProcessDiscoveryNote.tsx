// Process discovery notes are hidden for client presentation.
//
// These panels listed open questions still to be confirmed with the client. They were useful while
// the prototype was an internal working document, but they read as unfinished business on screen
// during a demo. The component is kept as a no-op rather than deleted so the open questions stay
// recorded in each page's source, and so re-enabling them later is a one-line change.
//
// The questions themselves also live in docs/PROCESS-AUDIT.md and docs/CLIENT-WALKTHROUGH.md.

const SHOW_DISCOVERY_NOTES = false;

export function ProcessDiscoveryNote({ items }: { items: string[] }) {
  if (!SHOW_DISCOVERY_NOTES) return null;
  return (
    <div className="rounded-xl border border-dashed border-pine-200 bg-pine-50/40 p-4">
      <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-pine-700">
        Process Discovery Notes
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[12.5px] leading-snug text-paper-600">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pine-400" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
