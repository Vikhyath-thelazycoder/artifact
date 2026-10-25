// Error codes raised by the RPCs and routes (TRD › APIs) → what a participant or organiser should read.
// Unknown text is never shown: it could leak internals (SECURITY.md › Secrets).

const messages: Record<string, string> = {
  NOT_AUTHENTICATED: "Your session expired. Log in again.",
  NOT_ADMIN: "Only an admin can do that.",
  NOT_STAFF: "Only organisers and judges can do that.",
  NO_EVENT: "There's no event set up yet.",
  NOT_REGISTERED: "You're not registered for this event yet.",
  STAFF_CANNOT_REGISTER: "Organiser accounts can't enter the competition.",
  REGISTRATION_CLOSED: "Registration is closed right now. Ask an organiser.",
  DUPLICATE_USN: "That USN is already registered. Log in instead.",
  USN_MISMATCH: "This account belongs to a different USN. Log out and try again.",
  VALIDATION: "Some details aren't valid. Check and try again.",
  RULES_NOT_ACKNOWLEDGED: "Read and accept the rules first.",
  BAD_PATH: "Upload failed. Reload the page and try again.",
  UPLOAD_MISSING: "The file didn't reach the server. Try uploading again.",
  SUBMISSIONS_CLOSED: "The submission window is closed.",
  EMPTY_FILE: "That file is empty.",
  FILE_TOO_LARGE: "That file is too large.",
  UNSUPPORTED_FILE: "Use a PNG, JPG or PDF file.",
  FILE_CONTENT_MISMATCH: "That file isn't really a PNG, JPG or PDF. Export it again from your design tool.",
  REPLACEMENT_NOT_ALLOWED: "You've already submitted, and replacing is turned off for this event.",
  THEME_LOCKED: "The theme and timing are locked once the round starts.",
  EVENT_PUBLISHED: "Results are published. Unpublish first to change settings.",
  INVALID_TRANSITION: "That step isn't available right now.",
  NO_THEME: "Enter the theme in Settings before starting the round.",
  ROUND_NOT_LIVE: "The round isn't live.",
  REASON_REQUIRED: "Give a short reason (3 to 200 characters).",
  JUDGING_NOT_OPEN: "Judging opens when the submission window has closed.",
  NOT_FOUND: "That isn't available any more.",
  AI_RUN_ACTIVE: "An AI judging run is already in progress.",
  AI_RUN_NOT_RUNNING: "That AI run has already stopped.",
  NO_SUBMISSIONS: "There are no submissions to judge.",
  NO_AI_RESULTS: "Run AI judging to completion first.",
  MISSING_SCORES: "Some submissions have no score yet. Score them (or finish the AI run) first.",
  NO_RESULTS: "Compute the results first.",
  FORBIDDEN: "Request blocked. Reload the page and try again.",
  // AI (Gemini)
  AI_NOT_CONFIGURED: "AI isn't set up: add GEMINI_API_KEY to the server environment.",
  AI_QUOTA: "The Gemini key hit its free-tier limit. AI judging will retry automatically.",
  AI_TIMEOUT: "Gemini took too long. It will retry.",
  AI_BAD_OUTPUT: "Gemini's reply didn't make sense. It will retry.",
  AI_FAILED: "The Gemini request failed. Check the API key.",
  // Supabase Auth messages
  "Invalid login credentials": "Wrong USN, email or PIN/password.",
  "User already registered": "That USN already has an account. Log in with your PIN.",
};

export function friendlyError(codeOrMessage: string | undefined | null): string {
  if (codeOrMessage && messages[codeOrMessage]) return messages[codeOrMessage];
  if (codeOrMessage && /rate limit|too many/i.test(codeOrMessage)) return "Too many attempts. Wait a minute and try again.";
  if (codeOrMessage && /network|fetch/i.test(codeOrMessage)) return "No connection. Check your internet and try again.";
  return "Something went wrong. Try again.";
}

/** Supabase errors carry the RPC's code in .message. */
export function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "UNKNOWN";
}
