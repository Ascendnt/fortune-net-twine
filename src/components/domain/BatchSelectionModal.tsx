import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { BATCH_LABEL } from "@/lib/batches";
import type { BatchType } from "@/lib/types";

// Batch Selection (doc §3.2). One type per click — picking a type appends a single batch group and
// closes. Build a quotation out of as many groups as it needs by clicking Generate Batch Item again.

const TYPES: { type: BatchType; hint: string }[] = [
  { type: "assembled", hint: "A titled product built from several nets or twines" },
  { type: "normal", hint: "Standard net and twine line items" },
  { type: "lacing", hint: "Lacing twines priced by the kilo, plus flat lacing charges" },
  { type: "note", hint: "Free text — no pricing, no weight" },
];

export function BatchSelectionModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (type: BatchType) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Batch Selection"
      subtitle="Choose one group type to add."
      width="max-w-md"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-2">
        {TYPES.map(({ type, hint }) => (
          <button
            key={type}
            onClick={() => onPick(type)}
            className="w-full rounded-lg border border-paper-200 bg-white px-4 py-3 text-left transition-colors hover:border-pine-700 hover:bg-pine-50"
          >
            <span className="block font-mono text-sm font-semibold tracking-wide text-pine-800">{BATCH_LABEL[type]}</span>
            <span className="mt-0.5 block text-[11.5px] text-paper-500">{hint}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
