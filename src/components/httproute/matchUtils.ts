import {
  HTTPRouteMatch,
  HTTPRouteHeader,
  HTTPRouteQueryParam,
  HTTPRoutePathType,
  HTTPRouteMethod,
} from './types';

const VALID_PATH_TYPES: HTTPRoutePathType[] = ['Exact', 'PathPrefix', 'RegularExpression'];
const VALID_METHODS: HTTPRouteMethod[] = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'CONNECT',
  'OPTIONS',
  'TRACE',
  'PATCH',
];

export const generateMatchesForYAML = (matches: HTTPRouteMatch[]) => {
  if (!matches || matches.length === 0) {
    return [];
  }

  return matches
    .map((match) => {
      const yamlMatch: {
        path: { type: HTTPRouteMatch['pathType']; value: string };
        method?: string;
        headers?: {
          type: HTTPRouteMatch['headers'][number]['type'];
          name: string;
          value: string;
        }[];
        queryParams?: {
          type: HTTPRouteMatch['queryParams'][number]['type'];
          name: string;
          value: string;
        }[];
      } = {
        path: {
          type: match.pathType,
          value: match.pathValue,
        },
      };
      if (match.method) {
        yamlMatch.method = match.method;
      }

      if (match.headers && match.headers.length > 0) {
        const validHeaders = match.headers
          .filter((h) => h.name && h.value && h.name.trim() !== '' && h.value.trim() !== '')
          .map((h) => ({
            type: h.type,
            name: h.name,
            value: h.value,
          }));

        if (validHeaders.length > 0) {
          yamlMatch.headers = validHeaders;
        }
      }

      if (match.queryParams && match.queryParams.length > 0) {
        const validQueryParams = match.queryParams
          .filter((q) => q.name && q.value && q.name.trim() !== '' && q.value.trim() !== '')
          .map((q) => ({
            type: q.type,
            name: q.name,
            value: q.value,
          }));

        if (validQueryParams.length > 0) {
          yamlMatch.queryParams = validQueryParams;
        }
      }

      return yamlMatch;
    })
    .filter(Boolean);
};

export const parseMatchesFromYAML = (
  yamlMatches: Array<
    | undefined
    | null
    | {
        path?: { type?: string; value?: string };
        method?: string;
        headers?: Array<{ type?: string; name?: string; value?: string }>;
        queryParams?: Array<{ type?: string; name?: string; value?: string }>;
      }
  >,
): HTTPRouteMatch[] => {
  if (!yamlMatches || !Array.isArray(yamlMatches)) {
    return [];
  }

  return yamlMatches
    .filter((match) => match != null)
    .map((match, matchIndex: number) => ({
      id: `match-${Date.now()}-${matchIndex}`,
      pathType: VALID_PATH_TYPES.includes(match.path?.type as HTTPRoutePathType)
        ? (match.path.type as HTTPRoutePathType)
        : 'PathPrefix',
      pathValue: match.path?.value || '/',
      method: VALID_METHODS.includes(match.method as HTTPRouteMethod)
        ? (match.method as HTTPRouteMethod)
        : '',
      headers: match.headers
        ? match.headers.map(
            (header, headerIndex: number): HTTPRouteHeader => ({
              id: `header-${Date.now()}-${headerIndex}`,
              type: (header.type as HTTPRouteHeader['type']) || 'Exact',
              name: header.name || '',
              value: header.value || '',
            }),
          )
        : [],
      queryParams: match.queryParams
        ? match.queryParams.map(
            (queryParam, queryParamIndex: number): HTTPRouteQueryParam => ({
              id: `queryparam-${Date.now()}-${queryParamIndex}`,
              type: (queryParam.type as HTTPRouteQueryParam['type']) || 'Exact',
              name: queryParam.name || '',
              value: queryParam.value || '',
            }),
          )
        : [],
    }));
};

export const validateMatchesInRule = (matches: HTTPRouteMatch[]): boolean => {
  return matches.length === 0 || matches.every((match) => match.pathType && match.pathValue);
};

export const formatMatchesForDisplay = (matches: HTTPRouteMatch[]): string => {
  if (!matches || matches.length === 0) {
    return '—';
  }

  return matches
    .map((match) => `${match.pathType} ${match.pathValue} / ${match.method}`)
    .join(', ');
};
