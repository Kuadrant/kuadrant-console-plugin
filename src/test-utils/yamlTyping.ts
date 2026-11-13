import * as yaml from 'js-yaml';

const shapeOf = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shapeOf(item)]));
  }
  return value === null ? 'null' : typeof value;
};

// each prefix of `document` that parses to a new shape (keys and value types), then the whole
// document: every state a user passes through while typing it, without one render per character
export const typingStates = (document: string): string[] => {
  const seen = new Set<string>();
  const states: string[] = [];
  for (let end = 1; end <= document.length; end += 1) {
    const prefix = document.slice(0, end);
    let shape: string;
    try {
      shape = JSON.stringify(shapeOf(yaml.load(prefix)));
    } catch {
      shape = 'invalid';
    }
    if (!seen.has(shape)) {
      seen.add(shape);
      states.push(prefix);
    }
  }
  if (states[states.length - 1] !== document) states.push(document);
  return states;
};
