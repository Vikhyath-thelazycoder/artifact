import Link from "next/link";
import { Eyebrow } from "@/components/ui/Panel";
import { SiteHeader } from "@/components/ui/Wordmark";
import { RUBRIC, RUBRIC_TOTAL } from "@/lib/rubric";

export const metadata = { title: "Rules · ARTIFEX" };

const rules: [string, React.ReactNode][] = [
  ["Common theme", "One official theme is announced to everyone when the round starts. It's hidden until then."],
  ["Time limit", "One shared 10-minute round. The server's clock decides; joining late doesn't give you extra time."],
  ["Individual", "This is an individual competition. No teams, no help, one entry per USN."],
  ["Permitted tools", "Figma, Canva, Adobe Photoshop, Adobe Illustrator, and other tools the organisers permit."],
  ["Originality", "Your design must be your own, made during the round. Don't copy, share or modify someone else's work. You confirm this before uploading."],
  ["Required elements", "A suitable headline, relevant visuals and a clear message. Supporting text must fit the theme."],
  ["Files", "PNG, JPG or PDF, up to 10 MB. Export from your tool, then upload."],
  [
    "Deadline policy",
    <>
      <strong>Your upload must be fully received by the server by the deadline plus a 10-second network grace.</strong> A file that arrives later is
      rejected, for everyone, with no individual exceptions. Don&apos;t leave it to the last seconds.
    </>,
  ],
  ["Replacing", "You may replace your submission before the deadline. The latest accepted version is judged; earlier versions are kept on record."],
  ["Extensions", "If organisers extend or end the round, it changes for everyone at once and is announced."],
  ["Final decision", "Designs are judged on the rubric below. The judges' decision is final."],
];

export default function RulesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
        <Eyebrow>Official rules</Eyebrow>
        <h1 className="mt-3 font-display text-6xl">The rules</h1>
        <dl className="mt-10 divide-y divide-line border-y border-line">
          {rules.map(([t, d], i) => (
            <div key={t} className="grid gap-2 py-5 sm:grid-cols-[200px_1fr]">
              <dt className="flex gap-3 font-semibold">
                <span className="tabular font-mono text-sm text-signal">{String(i + 1).padStart(2, "0")}</span>
                {t}
              </dt>
              <dd className="text-muted">{d}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-16 font-display text-4xl">Judging rubric</h2>
        <table className="mt-4 w-full text-left">
          <tbody>
            {RUBRIC.map((c) => (
              <tr key={c.key} className="border-b border-line align-top">
                <td className="py-3 pr-4 font-semibold">{c.label}</td>
                <td className="py-3 pr-4 text-sm text-muted">{c.hint}</td>
                <td className="tabular py-3 text-right font-mono text-lg">{c.max}</td>
              </tr>
            ))}
            <tr>
              <td className="py-3 font-semibold">Total</td>
              <td />
              <td className="tabular py-3 text-right font-mono text-lg text-signal">{RUBRIC_TOTAL}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-sm text-muted">Ties are broken by theme score, then originality, then hierarchy, then the earlier submission.</p>

        <div className="mt-12">
          <Link href="/play" className="inline-flex min-h-14 items-center rounded-md bg-signal px-6 font-semibold text-ink">
            Register / Enter event
          </Link>
        </div>
      </main>
    </>
  );
}
