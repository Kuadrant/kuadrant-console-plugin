import { formatLimits } from './apiKeyUtils';

describe('formatLimits', () => {
  it('returns null when limits is undefined', () => {
    expect(formatLimits(undefined)).toBeNull();
  });

  it('returns null when limits is an empty object', () => {
    expect(formatLimits({})).toBeNull();
  });

  it('returns daily format when daily is set', () => {
    expect(formatLimits({ daily: 100 })).toBe('100 requests per day');
  });

  it('returns weekly format when weekly is set', () => {
    expect(formatLimits({ weekly: 500 })).toBe('500 requests per week');
  });

  it('returns monthly format when monthly is set', () => {
    expect(formatLimits({ monthly: 2000 })).toBe('2000 requests per month');
  });

  it('returns yearly format when yearly is set', () => {
    expect(formatLimits({ yearly: 10000 })).toBe('10000 requests per year');
  });

  it('returns custom format from the first custom entry', () => {
    expect(formatLimits({ custom: [{ limit: 50, window: '10s' }] })).toBe('50 requests per 10s');
  });

  it('returns null when custom array is empty', () => {
    expect(formatLimits({ custom: [] })).toBeNull();
  });

  it('returns daily over weekly when both are set', () => {
    expect(formatLimits({ daily: 10, weekly: 70 })).toBe('10 requests per day');
  });

  it('treats zero as a valid limit value', () => {
    expect(formatLimits({ daily: 0 })).toBe('0 requests per day');
  });

  it('uses only the first entry when custom has multiple entries', () => {
    expect(
      formatLimits({
        custom: [
          { limit: 10, window: '1m' },
          { limit: 100, window: '1h' },
        ],
      }),
    ).toBe('10 requests per 1m');
  });
});
