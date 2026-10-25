import type { PublicResults } from "@/lib/types";

const place = [
  { tone: "text-gold border-gold/60", label: "1st", height: "h-40 sm:h-56" },
  { tone: "text-silver border-silver/50", label: "2nd", height: "h-28 sm:h-40" },
  { tone: "text-bronze border-bronze/50", label: "3rd", height: "h-20 sm:h-28" },
];

/** Top three as a podium (2nd · 1st · 3rd), then everyone else in a ranked table. */
export function Leaderboard({ results, big = false }: { results: PublicResults; big?: boolean }) {
  const top = results.rows.slice(0, 3);
  const rest = results.rows.slice(3);
  const order = [top[1], top[0], top[2]];
  return (
    <div className="space-y-10">
      <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Winners">
        {order.map((row, i) => {
          if (!row) return <li key={i} />;
          const p = place[row.rank - 1];
          return (
            <li key={row.code} className="rise flex flex-col items-center text-center" style={{ animationDelay: `${(3 - row.rank) * 350}ms` }}>
              <p className={`font-mono text-xs uppercase tracking-[0.2em] ${p.tone.split(" ")[0]}`}>{p.label}</p>
              <p className={`mt-1 line-clamp-2 font-display ${big ? "text-4xl sm:text-6xl" : "text-2xl sm:text-4xl"}`}>{row.name}</p>
              <p className="tabular font-mono text-sm text-muted">
                {row.code} · {Number(row.score).toFixed(1)}
              </p>
              <div className={`mt-3 w-full rounded-t-md border-x border-t bg-raised ${p.tone} ${p.height} flex items-start justify-center pt-3`}>
                <span className={`font-display ${big ? "text-7xl" : "text-5xl"}`}>{row.rank}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {rest.length > 0 && (
        <table className="w-full border-collapse text-left">
          <thead className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Rank</th>
              <th className="py-2 pr-3 font-medium">Participant</th>
              <th className="py-2 pr-3 font-medium">Code</th>
              <th className="py-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody className={big ? "text-2xl" : ""}>
            {rest.map((r) => (
              <tr key={r.code} className="border-b border-line/60">
                <td className="tabular py-2.5 pr-3 font-mono text-muted">{r.rank}</td>
                <td className="py-2.5 pr-3">{r.name}</td>
                <td className="py-2.5 pr-3 font-mono text-sm text-muted">{r.code}</td>
                <td className="tabular py-2.5 text-right font-mono">{Number(r.score).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
