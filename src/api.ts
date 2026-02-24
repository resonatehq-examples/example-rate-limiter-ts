import type { Context } from "@resonatehq/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiRequest {
  id: string;
  endpoint: string;
  payload: string;
}

export interface ApiResponse {
  requestId: string;
  endpoint: string;
  status: "ok";
  data: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Track call attempts for crash demo
const callAttempts = new Map<string, number>();

// ---------------------------------------------------------------------------
// Simulated rate-limited external API
// In production this would be a real HTTP call to e.g. OpenAI, Stripe, etc.
// ---------------------------------------------------------------------------

export async function callExternalApi(
  _ctx: Context,
  request: ApiRequest,
  crashAtId: string | null,
  index: number,
  total: number,
): Promise<ApiResponse> {
  const attempt = (callAttempts.get(request.id) ?? 0) + 1;
  callAttempts.set(request.id, attempt);

  if (crashAtId === request.id && attempt === 1) {
    // Simulate process crash mid-batch. When Resonate resumes:
    // - Calls before this one are checkpointed (not re-sent to the API)
    // - The rate-limit window is respected because the sleep checkpoints are replayed
    // - This call retries exactly once
    throw new Error(`Process crashed at ${request.id} — resuming from checkpoint`);
  }

  // Simulate API latency (50-150ms)
  const latency = 50 + Math.floor(Math.random() * 100);
  await sleep(latency);

  const response: ApiResponse = {
    requestId: request.id,
    endpoint: request.endpoint,
    status: "ok",
    data: `response for ${request.payload}`,
    latencyMs: latency,
  };

  console.log(
    `  [${String(index + 1).padStart(2, "0")}/${total}] ${request.id} ` +
      `${request.endpoint} → ${response.status} (${latency}ms)` +
      (attempt > 1 ? ` (retry ${attempt})` : ""),
  );

  return response;
}
