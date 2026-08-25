/**
 * Pure helpers for deriving gateway traffic figures (total / successful requests
 * and error rate) from the Prometheus-backed metrics collected per gateway.
 *
 * These are extracted from KuadrantOverviewPage so the derivation logic can be
 * unit tested in isolation, in particular the case where Prometheus returns an
 * empty error vector (no errors) - which must be treated as zero errors rather
 * than "unknown". See issue #724.
 */

export interface GatewayTrafficMetrics {
  total?: number;
  errors?: number;
  codes?: {
    [responseCode: string]: number;
  };
}

/**
 * Total request count for a gateway.
 *
 * Returns null when there are no request metrics at all (nothing to show),
 * so callers can distinguish "no data" from a genuine zero.
 */
export const getTotalRequests = (metrics?: GatewayTrafficMetrics): number | null => {
  const total = metrics?.total;
  return Number.isFinite(total) ? Math.round(total) : null;
};

/**
 * Number of successful (non-error) requests for a gateway.
 *
 * Returns null when there are no request metrics at all (nothing to show).
 * When requests exist but the error vector is empty/absent, errors are treated
 * as 0 so that "all successful" renders the full request count rather than a
 * blank value.
 */
export const getSuccessfulRequests = (metrics?: GatewayTrafficMetrics): number | null => {
  const total = metrics?.total;
  // No request metrics for this gateway yet - nothing to show.
  if (!Number.isFinite(total)) return null;
  // An empty error vector from Prometheus means zero errors, not "unknown".
  const errors = metrics?.errors ?? 0;
  return Math.round(total - errors);
};

/**
 * Error rate as a percentage (0-100) for a gateway.
 *
 * Returns null when there is no request total (no data, and also avoids a
 * divide-by-zero). When requests exist but the error vector is empty/absent,
 * errors are treated as 0 so the rate is 0 rather than blank.
 */
export const getErrorRateValue = (metrics?: GatewayTrafficMetrics): number | null => {
  const total = metrics?.total;
  // Without a request total there is no rate to calculate (also avoids /0).
  if (!Number.isFinite(total) || total === 0) return null;
  // An empty error vector from Prometheus means zero errors, not "unknown".
  const errors = metrics?.errors ?? 0;
  return (errors / total) * 100;
};

/**
 * Error rate formatted for display, e.g. "0.0" or "5.3".
 * Returns "-" when there is no rate to show.
 */
export const formatErrorRate = (metrics?: GatewayTrafficMetrics): string => {
  const rate = getErrorRateValue(metrics);
  return rate !== null ? rate.toFixed(1) : '-';
};
