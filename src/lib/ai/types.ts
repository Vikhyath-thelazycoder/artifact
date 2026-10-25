export type DesignFile = { mimeType: string; bytes: Uint8Array };

/** One judging backend: Gemini in production, the fake judge in development and the bot test. */
export type Judge = {
  /** How many designs to score at once (one per Gemini key). */
  parallelism(): number;
  score(prompt: string, file: DesignFile): Promise<{ text: string; model: string }>;
  compare(prompt: string, files: { label: string; file: DesignFile }[]): Promise<{ text: string; model: string }>;
};
