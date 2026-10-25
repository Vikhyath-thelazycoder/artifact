"use client";

import { Eyebrow, Panel } from "@/components/ui/Panel";
import { usePoll } from "@/hooks/usePoll";
import { fetchAdminEvent } from "@/lib/admin/data";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Log = { id: number; action: string; target: string | null; reason: string | null; metadata: Record<string, unknown>; created_at: string; actor: string | null };

async function load() {
  const e = await fetchAdminEvent();
  const { data, error } = await getBrowserSupabase().from("audit_logs").select("*").eq("event_id", e.id).order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  return { server_now: e.server_now, logs: data as Log[] };
}

export default function AuditPage() {
  const { data } = usePoll(load, 5000);
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Insert-only · written by the database</Eyebrow>
        <h1 className="mt-1 font-display text-5xl">Audit log</h1>
      </div>
      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Target</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {data?.logs.map((l) => (
              <tr key={l.id} className="border-b border-line/60 align-top">
                <td className="tabular whitespace-nowrap px-4 py-2 font-mono text-muted">{new Date(l.created_at).toLocaleString("en-IN")}</td>
                <td className="px-4 py-2 font-mono">{l.action}</td>
                <td className="px-4 py-2 font-mono text-muted">{l.target ?? ""}</td>
                <td className="px-4 py-2">{l.reason ?? ""}</td>
                <td className="max-w-md truncate px-4 py-2 font-mono text-xs text-muted">{JSON.stringify(l.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
