import { PlanLimits } from './resources';

export const formatLimits = (limits: PlanLimits | undefined): string | null => {
  if (!limits) return null;

  if (limits.daily !== undefined) return `${limits.daily} requests per day`;
  if (limits.weekly !== undefined) return `${limits.weekly} requests per week`;
  if (limits.monthly !== undefined) return `${limits.monthly} requests per month`;
  if (limits.yearly !== undefined) return `${limits.yearly} requests per year`;
  if (limits.custom && limits.custom.length > 0) {
    const { limit, window } = limits.custom[0];
    return `${limit} requests per ${window}`;
  }

  return null;
};
