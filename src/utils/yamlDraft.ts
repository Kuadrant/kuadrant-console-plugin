// readers for parsed yaml drafts. while a document is being typed any value can have any
// shape, so each reader falls back instead of trusting it

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// skips half-typed items such as a bare `-`, which loads as null. only the items are checked,
// so their fields stay as typed
export const recordArray = <T extends object = Record<string, unknown>>(value: unknown): T[] =>
  asArray(value).filter(isRecord) as T[];

// an integer reads as its digits, as `name: 1` means the name "1". nothing else is text
const asText = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  return Number.isSafeInteger(value) ? String(value) : undefined;
};

// keeps every entry that has text and skips the rest, such as a bare `-`
export const stringArray = (value: unknown): string[] =>
  asArray(value)
    .map(asText)
    .filter((item): item is string => item !== undefined);

// an empty string falls back too, like `value || fallback`
export const stringOr = (value: unknown, fallback: string): string => asText(value) || fallback;

export const stringEntries = (value: unknown): [string, string][] =>
  Object.entries(asRecord(value)).map(([key, entry]) => [key, stringOr(entry, '')]);
