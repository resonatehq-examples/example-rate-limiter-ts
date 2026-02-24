import { Resonate } from "@resonatehq/sdk";
import { rateLimitedBatch } from "./workflow";
import type { ApiRequest } from "./api";

// ---------------------------------------------------------------------------
// Resonate setup
// ---------------------------------------------------------------------------

const resonate = new Resonate();
resonate.register(rateLimitedBatch);

// ---------------------------------------------------------------------------
// Run the rate limiter demo
// ---------------------------------------------------------------------------

const crashMode = process.argv.includes("--crash");

const RATE_PER_SEC = 3; // 3 requests per second
const REQUEST_COUNT = 10;

// Generate 10 API requests (simulating calls to a rate-limited external API)
const requests: ApiRequest[] = Array.from({ length: REQUEST_COUNT }, (_, i) => ({
  id: `req_${String(i + 1).padStart(3, "0")}`,
  endpoint: `/api/v1/enrich`,
  payload: `record_${i + 1}`,
}));

// In crash mode, req_005 causes a process crash.
// Requests 1-4 are checkpointed. On resume: no duplicate API calls.
// The rate limit window is also respected — ctx.sleep() checkpoints count.
const crashAtId = crashMode ? "req_005" : null;

console.log("=== Rate Limiter Demo ===");
console.log(
  `Mode: ${crashMode ? "CRASH (process dies at req_005, resumes — no duplicate API calls)" : `HAPPY PATH (${REQUEST_COUNT} requests at ${RATE_PER_SEC}/sec)`}`,
);
const intervalMs = Math.floor(1000 / RATE_PER_SEC);
console.log(`\n[rate-limiter]  ${REQUEST_COUNT} requests at ${RATE_PER_SEC}/sec (${intervalMs}ms interval)`);
console.log(`[rate-limiter]  Expected: ~${((REQUEST_COUNT - 1) / RATE_PER_SEC).toFixed(1)}s\n`);

const wallStart = Date.now();

const result = await resonate.run(
  `rate-limited/${Date.now()}`,
  rateLimitedBatch,
  requests,
  RATE_PER_SEC,
  crashAtId,
);

const wallMs = Date.now() - wallStart;

console.log("\n=== Result ===");
console.log(JSON.stringify({
  totalRequests: result.totalRequests,
  completed: result.completed,
  ratePerSec: result.ratePerSec,
  wallTimeMs: wallMs,
  theoreticalMinMs: Math.floor(((REQUEST_COUNT - 1) / RATE_PER_SEC) * 1000),
}, null, 2));

if (crashMode) {
  console.log(
    "\nNotice: requests 1-4 logged once (checkpointed before crash).",
    "\nreq_005 failed → retried → succeeded.",
    "\nThe rate-limit window was preserved across the crash.",
  );
}
