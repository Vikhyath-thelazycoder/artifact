"use client";

import { useEffect, useState } from "react";
import { AiJudging } from "@/components/admin/AiJudging";
import { ManualScoring } from "@/components/admin/ManualScoring";
import { ResultsPanel } from "@/components/admin/ResultsPanel";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Panel";
import { usePoll } from "@/hooks/usePoll";
import { fetchAdminEvent, rpc } from "@/lib/admin/data";

type Tab = "manual" | "ai" | "results";

export default function JudgingPage() {
  const { data: event, refresh } = usePoll(fetchAdminEvent, 5000);
  const [role, setRole] = useState<"admin" | "judge" | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    rpc<"admin" | "judge">("staff_role").then(setRole);
  }, []);
  useEffect(() => {
    if (event && role && !tab) setTab(role === "admin" ? (event.judging_mode === "ai" ? "ai" : "manual") : "manual");
  }, [event, role, tab]);

  if (!event || !role || !tab) return <p className="text-muted">Loading…</p>;
  const tabs: [Tab, string][] = role === "admin" ? [["ai", "AI judging"], ["manual", "Manual scoring"], ["results", "Results & publish"]] : [["manual", "Manual scoring"]];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{event.name}</Eyebrow>
          <h1 className="mt-1 font-display text-5xl">Judging</h1>
        </div>
        {role === "admin" && <Badge tone="signal">Mode: {event.judging_mode === "ai" ? "AI (Gemini)" : "Manual"}</Badge>}
      </div>
      <div role="tablist" className="flex gap-1 border-b border-line">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t ? "border-signal text-paper" : "border-transparent text-muted hover:text-paper"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "manual" && <ManualScoring />}
      {tab === "ai" && role === "admin" && <AiJudging event={event} onChange={refresh} />}
      {tab === "results" && role === "admin" && <ResultsPanel event={event} onChange={refresh} />}
    </div>
  );
}
