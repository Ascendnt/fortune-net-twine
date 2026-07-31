import { HelpCircle } from "lucide-react";

export function ProcessDiscoveryNote({ items }: { items: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-manifest-300 bg-manifest-50/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-manifest-700" />
        <p className="text-xs font-semibold uppercase tracking-wide text-manifest-800">
          Process Discovery Notes — subject to client confirmation
        </p>
      </div>
      <ul className="space-y-1.5 text-sm text-manifest-900">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-manifest-500" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
