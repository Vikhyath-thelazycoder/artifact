import { Badge } from "@/components/ui/Badge";
import { formatBytes, formatTime } from "@/lib/time";
import type { Receipt } from "@/lib/types";

export function ReceiptCard({ receipt, canReplace }: { receipt: Receipt; canReplace: boolean }) {
  return (
    <div className="rounded-lg border border-ok/50 bg-ok/5 p-5" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-3xl">Submission received</p>
        <Badge tone="ok">✓ Accepted</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Reference</dt>
        <dd className="font-mono">{receipt.reference}</dd>
        <dt className="text-muted">Server time</dt>
        <dd className="tabular font-mono">{formatTime(receipt.received_at)}</dd>
        <dt className="text-muted">File</dt>
        <dd className="truncate">
          {receipt.filename} · {formatBytes(receipt.size)}
        </dd>
        <dt className="text-muted">Version</dt>
        <dd className="font-mono">v{receipt.version}</dd>
      </dl>
      <p className="mt-4 text-sm text-muted">
        {canReplace ? "You can replace it before the deadline. The latest version is judged." : "Replacing is not available."} You can close this page now.
      </p>
    </div>
  );
}
