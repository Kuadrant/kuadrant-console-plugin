import { MCPServerRegistration } from '../../components/mcp/types';

interface PrefixedRegistration {
  prefix: string;
  name: string;
}

// the gateway prefixes tool names with the registration prefix and strips its
// own server metadata from tools/list, so the prefix is the only way back to
// the registration. longest prefix wins.
export const toolServerNameResolver = (
  registrations?: MCPServerRegistration[] | null,
): ((toolName: string) => string | undefined) => {
  const prefixed = (Array.isArray(registrations) ? registrations : [])
    .map((registration) => ({
      prefix: registration.spec?.prefix ?? '',
      name: registration.metadata?.name ?? '',
    }))
    .filter((entry): entry is PrefixedRegistration => Boolean(entry.prefix && entry.name))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return (toolName) => prefixed.find((entry) => toolName.startsWith(entry.prefix))?.name;
};
