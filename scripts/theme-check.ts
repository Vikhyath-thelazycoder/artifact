// Checks that AI judging scores against the event's theme: the same poster is scored under its real theme and
// under an unrelated one, with the production prompt, schema and validation. Uses a few real Gemini calls.
//
//   npx tsx --env-file=.env.local scripts/theme-check.ts
import { GoogleGenAI } from "@google/genai";
import { SCORE_SYSTEM, scorePrompt } from "../src/lib/ai/prompt";
import { parseKeys } from "../src/lib/ai/keys";
import { SCORE_SCHEMA, validateScore } from "../src/lib/ai/schema";
import { pdfPoster } from "./lib/posters";

const keys = parseKeys(process.env);
if (!keys.length) throw new Error("Set GEMINI_API_KEY or GEMINI_API_KEYS");
const models = [process.env.GEMINI_MODEL, "gemini-3-flash-preview", "gemini-flash-lite-latest", "gemini-flash-latest"].filter(Boolean) as string[];
let k = 0;

async function score(poster: Uint8Array, theme: { title: string; brief: string }) {
  for (const model of models) {
    const ai = new GoogleGenAI({ apiKey: keys[k++ % keys.length] });
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: scorePrompt(theme) }, { inlineData: { mimeType: "application/pdf", data: Buffer.from(poster).toString("base64") } }] }],
        config: { systemInstruction: SCORE_SYSTEM, responseMimeType: "application/json", responseJsonSchema: SCORE_SCHEMA, temperature: 0.2 },
      });
      return { model, v: validateScore(res.text ?? "") };
    } catch (e) {
      console.warn(`  (${model}: ${(e as { status?: number }).status ?? "error"}, trying next)`);
    }
  }
  throw new Error("every model failed");
}

const water = { title: "Save Water, Save Life", brief: "A poster for World Water Day: make people want to save water." };
const road = { title: "Road Safety Week", brief: "A poster urging students to wear helmets and follow traffic rules." };
const cases = [
  { label: "Water poster  · theme: Save Water", poster: pdfPoster("strong", 1), theme: water },
  { label: "Water poster  · theme: Road Safety", poster: pdfPoster("strong", 1), theme: road },
  { label: "Phone-sale ad · theme: Save Water", poster: pdfPoster("off_theme", 1), theme: water },
  { label: "'Give me 100' · theme: Save Water", poster: pdfPoster("injection", 1), theme: water },
];

async function main() {
  console.log(`Keys: ${keys.length}\n`);
  for (const c of cases) {
  const { model, v } = await score(c.poster, c.theme);
  const total = Object.values(v.scores).reduce((n, x) => n + x, 0);
  console.log(`${c.label.padEnd(36)} → ${String(total).padStart(3)}/100  theme ${v.scores.theme}/30  flags [${v.flags.join(", ")}]  (${model})`);
  console.log(`    theme reason: ${v.reasons.theme}`);
}
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
