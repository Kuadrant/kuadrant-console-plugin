import { promptText } from './prompts';
import { estimateTokens } from './tokens';
import { humanize } from './humanize';

describe('promptText', () => {
  it('returns a single text message verbatim', () => {
    expect(
      promptText({
        messages: [{ role: 'user', content: { type: 'text', text: 'Say hi to Ada' } }],
      }),
    ).toBe('Say hi to Ada');
  });

  it('prefixes roles and serialises non-text content when there are several messages', () => {
    expect(
      promptText({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Review this' } },
          { role: 'assistant', content: { type: 'image', data: 'abc', mimeType: 'image/png' } },
        ],
      }),
    ).toBe(
      'user: Review this\n\nassistant: {\n  "type": "image",\n  "data": "abc",\n  "mimeType": "image/png"\n}',
    );
  });

  it('is empty without messages', () => {
    expect(promptText({})).toBe('');
  });
});

describe('estimateTokens', () => {
  it('rounds up at four characters per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('Say hi to Ada')).toBe(4);
  });
});

describe('humanize', () => {
  it('splits camel and snake case into a capitalised label', () => {
    expect(humanize('incidentId')).toBe('Incident Id');
    expect(humanize('target_component')).toBe('Target component');
  });
});
