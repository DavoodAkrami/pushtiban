export const FAILURE_CATEGORIES = [
  "provider_timeout",
  "provider_rate_limit",
  "provider_unavailable",
  "malformed_model_output",
  "retrieval_unavailable",
  "authorization_denied",
  "action_validation_failed",
  "database_unavailable",
  "lease_conflict",
  "delivery_failed",
  "delivery_unknown",
  "budget_exhausted",
  "deadline_exceeded",
  "quota_exceeded",
  "retry_exhausted",
  "late_event",
  "replay_unavailable",
  "action_unresolved",
  "internal_failure",
] as const;
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];
export class ProcessingFailure extends Error {
  constructor(readonly category: FailureCategory) {
    super(category);
  }
}
export const rethrowProcessingFailure = (error: unknown) => {
  if (error instanceof ProcessingFailure) throw error;
};
export const classifyFailure = (error: unknown): FailureCategory => {
  if (error instanceof ProcessingFailure) return error.category;
  const value = error as { status?: number; name?: string; message?: string };
  if (value?.status === 429) return "provider_rate_limit";
  if (/timeout|timed out|abort/i.test(value?.message ?? value?.name ?? ""))
    return "provider_timeout";
  if (value?.status && value.status >= 500) return "provider_unavailable";
  if (value?.status === 401 || value?.status === 403)
    return "authorization_denied";
  return "internal_failure";
};
export const retryDelay = (
  category: FailureCategory,
  attempt: number,
  random = Math.random,
): number | null => {
  if (
    attempt >= 4 ||
    ![
      "provider_timeout",
      "provider_rate_limit",
      "provider_unavailable",
      "retrieval_unavailable",
      "database_unavailable",
      "delivery_failed",
      "action_unresolved",
    ].includes(category)
  )
    return null;
  if (category === "action_unresolved") return 150;
  return Math.min(
    300,
    Math.ceil(5 * 2 ** (attempt - 1) * (0.8 + random() * 0.4)),
  );
};
