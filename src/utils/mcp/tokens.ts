// rough english average of four characters per token. sizes a prompt, it is
// not a tokenizer for any particular model.
export const CHARACTERS_PER_TOKEN = 4;

export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / CHARACTERS_PER_TOKEN);
