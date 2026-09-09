import { PromptsGetResult } from './client';

// flattens a prompts/get result to the text a client would send, one block
// per message, role-prefixed only when there is more than one message
export const promptText = (result: PromptsGetResult): string => {
  const messages = result.messages ?? [];
  return messages
    .map((message) => {
      const content = message.content;
      const body =
        content?.type === 'text' && typeof content.text === 'string'
          ? content.text
          : JSON.stringify(content, null, 2);
      return messages.length > 1 ? `${message.role}: ${body}` : body;
    })
    .join('\n\n');
};
