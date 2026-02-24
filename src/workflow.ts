import type { Context } from "@resonatehq/sdk";
import { callExternalApi, type ApiRequest, type ApiResponse } from "./api";

// ---------------------------------------------------------------------------
// Rate-Limited Batch Workflow
// ---------------------------------------------------------------------------
// Processes N API requests at a controlled rate (requests per second).
// Uses ctx.sleep() between calls to enforce the rate limit durably.
//
// Why durable rate limiting matters:
//   Regular sleep():  crash at call 5 → resume from 0 → API gets 5 duplicate calls
//   ctx.sleep():      crash at call 5 → resume at call 5 → no duplicates, rate respected
//
// The sleep checkpoint is stored in Resonate's promise store.
// On resume, Resonate checks: "has this sleep already elapsed?"
//   - If yes: skip the sleep, proceed immediately
//   - If no:  wait the remaining duration
//
// This means the rate limit is globally respected across process restarts.
// A 3 req/sec limit remains 3 req/sec even if the worker crashes and restarts.

export interface RateLimitResult {
  totalRequests: number;
  completed: number;
  ratePerSec: number;
  responses: ApiResponse[];
}

export function* rateLimitedBatch(
  ctx: Context,
  requests: ApiRequest[],
  ratePerSec: number,
  crashAtId: string | null,
): Generator<any, RateLimitResult, any> {
  const intervalMs = Math.floor(1000 / ratePerSec);
  const responses: ApiResponse[] = [];

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i]!;

    // Enforce rate limit: sleep between calls (except before the first one)
    // This sleep is checkpointed — surviving crashes, preserving the rate window
    if (i > 0) {
      yield* ctx.sleep(intervalMs);
    }

    const response = yield* ctx.run(callExternalApi, req, crashAtId, i, requests.length);
    responses.push(response);
  }

  return {
    totalRequests: requests.length,
    completed: responses.length,
    ratePerSec,
    responses,
  };
}
