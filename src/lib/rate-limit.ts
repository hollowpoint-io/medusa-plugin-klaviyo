export type MemoryRateLimiter = {
  consume: (key: string) => boolean
}

/**
 * Naive in-memory limiter. Fine for a single backend process; do not rely on
 * it across multiple instances — rate-limit at your edge instead.
 */
export function createMemoryRateLimiter(
  max: number,
  windowMs: number
): MemoryRateLimiter {
  const hits = new Map<string, number[]>()
  return {
    consume(key: string) {
      const now = Date.now()
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
      if (recent.length >= max) {
        hits.set(key, recent)
        return false
      }
      recent.push(now)
      hits.set(key, recent)
      return true
    },
  }
}

export function clientKeyFromHeaders(
  headers: Record<string, unknown>
): string {
  const forwarded = headers["x-forwarded-for"]
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const ip =
    typeof raw === "string" ? raw.split(",")[0]?.trim() : undefined
  return ip || "unknown"
}
