"use client";

import { useEffect, useState } from "react";
import { DesignPreview } from "@/components/admin/DesignPreview";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow, Panel } from "@/components/ui/Panel";
import { usePoll } from "@/hooks/usePoll";
import { fetchAdminEvent, signedUrls } from "@/lib/admin/data";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatBytes, formatTime } from "@/lib/time";

type Row = {
  id: string;
  reference: string;
  version_count: number;
  participants: { code: string; name: string; usn: string };
  submission_versions: { id: string; version_number: number; storage_key: string; mime_type: string; original_filename: string; file_size_bytes: number; received_at: string; sha256: string }[];
  active_version_id: string;
};

async function load() {
  const e = await fetchAdminEvent();
  const { data, error } = await getBrowserSupabase()
    .from("submissions")
    .select("id, reference, version_count, active_version_id, participants(code, name, usn), submission_versions!submission_versions_submission_id_fkey(id, version_number, storage_key, mime_type, original_filename, file_size_bytes, received_at, sha256)")
    .eq("event_id", e.id)
    .order("first_received_at");
  if (error) throw new Error(error.message);
  return { server_now: e.server_now, rows: data as unknown as Row[] };
}

export default function SubmissionsPage() {
  const { data, error } = usePoll(load, 8000);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const keys = (data?.rows ?? []).flatMap((r) => r.submission_versions.map((v) => v.storage_key)).join("|");

  useEffect(() => {
    if (keys) signedUrls(keys.split("|")).then(setUrls);
  }, [keys]);

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Private bucket · signed links expire in 10 minutes</Eyebrow>
        <h1 className="mt-1 font-display text-5xl">Submissions</h1>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {data?.rows.length === 0 && <p className="text-muted">No submissions yet.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.rows.map((r) => {
          const versions = [...r.submission_versions].sort((a, b) => b.version_number - a.version_number);
          const active = versions.find((v) => v.id === r.active_version_id) ?? versions[0];
          return (
            <Panel key={r.id} as="article" className="space-y-3 p-3">
              <DesignPreview storageKey={active.storage_key} mime={active.mime_type} className="aspect-[3/4] w-full rounded" />
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold">
                  {r.participants.code} · {r.participants.name}
                </p>
                <Badge>v{r.version_count}</Badge>
              </div>
              <p className="text-xs text-muted">
                {r.reference} · {formatTime(active.received_at)} · {formatBytes(active.file_size_bytes)} · {active.mime_type.split("/")[1]}
              </p>
              {versions.length > 1 && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer">Version history</summary>
                  <ul className="mt-1 space-y-0.5">
                    {versions.map((v) => (
                      <li key={v.id}>
                        v{v.version_number} · {formatTime(v.received_at)} ·{" "}
                        <a className="underline" href={urls[v.storage_key]} target="_blank" rel="noreferrer">
                          {v.original_filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <a className="text-sm underline" href={urls[active.storage_key]} target="_blank" rel="noreferrer">
                Open original
              </a>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
