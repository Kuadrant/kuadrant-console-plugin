import {
  GatewayTrafficMetrics,
  getTotalRequests,
  getSuccessfulRequests,
  getErrorRateValue,
  formatErrorRate,
} from './gatewayTraffic';

describe('getTotalRequests', () => {
  it('rounds and returns the total request count', () => {
    expect(getTotalRequests({ total: 1000.4 })).toBe(1000);
  });

  it('returns 0 (not null) when the total is genuinely zero', () => {
    expect(getTotalRequests({ total: 0 })).toBe(0);
  });

  it('returns null when there are no metrics for the gateway', () => {
    expect(getTotalRequests(undefined)).toBeNull();
    expect(getTotalRequests({})).toBeNull();
  });
});

describe('getSuccessfulRequests', () => {
  // Regression test for #724: an empty error vector from Prometheus leaves
  // `errors` undefined; it must be treated as 0, not as unknown.
  it('returns the full total when the error vector is empty (all successful)', () => {
    const metrics: GatewayTrafficMetrics = { total: 1000 };
    expect(getSuccessfulRequests(metrics)).toBe(1000);
  });

  it('subtracts errors from the total when errors exist', () => {
    expect(getSuccessfulRequests({ total: 1000, errors: 50 })).toBe(950);
  });

  it('rounds the computed value', () => {
    expect(getSuccessfulRequests({ total: 1000.7, errors: 0.1 })).toBe(1001);
    expect(getSuccessfulRequests({ total: 1000.2, errors: 0.1 })).toBe(1000);
  });

  it('returns 0 (not null) when every request errored', () => {
    expect(getSuccessfulRequests({ total: 200, errors: 200 })).toBe(0);
  });

  it('returns null when there are no request metrics at all', () => {
    expect(getSuccessfulRequests(undefined)).toBeNull();
    expect(getSuccessfulRequests({})).toBeNull();
    expect(getSuccessfulRequests({ errors: 5 })).toBeNull();
  });
});

describe('getErrorRateValue', () => {
  // Regression test for #724: no errors should yield a 0% rate, not null/blank.
  it('returns 0 when the error vector is empty (all successful)', () => {
    expect(getErrorRateValue({ total: 1000 })).toBe(0);
  });

  it('computes the error percentage when errors exist', () => {
    expect(getErrorRateValue({ total: 1000, errors: 50 })).toBeCloseTo(5);
  });

  it('returns null when there are no request metrics at all', () => {
    expect(getErrorRateValue(undefined)).toBeNull();
    expect(getErrorRateValue({})).toBeNull();
  });

  it('returns null when the total is 0 (avoids divide-by-zero)', () => {
    expect(getErrorRateValue({ total: 0, errors: 0 })).toBeNull();
  });
});

describe('formatErrorRate', () => {
  // Regression test for #724: no errors should render "0.0", not "-".
  it('formats a zero error rate as "0.0" when requests are all successful', () => {
    expect(formatErrorRate({ total: 1000 })).toBe('0.0');
  });

  it('formats a non-zero rate to one decimal place', () => {
    expect(formatErrorRate({ total: 1000, errors: 53 })).toBe('5.3');
  });

  it('returns "-" when there are no request metrics', () => {
    expect(formatErrorRate(undefined)).toBe('-');
    expect(formatErrorRate({})).toBe('-');
  });
});
