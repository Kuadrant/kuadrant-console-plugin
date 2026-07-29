import type {
  HTTPRouteFilter,
  RequestHeaderModifierFilter,
  ResponseHeaderModifierFilter,
  URLRewriteFilter,
  RequestRedirectFilter,
  RequestMirrorFilter,
  HeaderKV,
  HeaderNameOnly,
} from './filterTypes';

export const createDefaultFilter = (type: HTTPRouteFilter['type']): HTTPRouteFilter => {
  switch (type) {
    case 'RequestHeaderModifier':
      return { type: 'RequestHeaderModifier', requestHeaderModifier: {} };
    case 'ResponseHeaderModifier':
      return { type: 'ResponseHeaderModifier', responseHeaderModifier: {} };
    case 'URLRewrite':
      return { type: 'URLRewrite', urlRewrite: {} };
    case 'RequestRedirect':
      return { type: 'RequestRedirect', requestRedirect: { scheme: 'https', statusCode: 301 } };
    case 'RequestMirror':
      return { type: 'RequestMirror', requestMirror: { backendRef: { name: '' } } };
    default:
      return { type: 'RequestHeaderModifier', requestHeaderModifier: {} };
  }
};

// Helper: Strip UI-only fields (id) from header arrays for YAML
const cleanHeaders = (items: Array<{ id?: string; name: string; value: string }>) =>
  items
    .filter((i) => i.name?.trim() && i.value?.trim())
    .map(({ name, value }) => ({ name, value }));

const cleanRemove = (items: Array<string | { id?: string; name: string }>) =>
  items.map((e) => (typeof e === 'string' ? e : e.name)).filter((s) => s?.trim());

// Helper: Process header modifier for YAML (shared by Request/Response)
const processHeaderModifier = (hm: any) => {
  const add = cleanHeaders(hm.add || []);
  const set = cleanHeaders(hm.set || []);
  const remove = cleanRemove(hm.remove || []);

  if (!add.length && !set.length && !remove.length) return undefined;

  const result: any = {};
  if (add.length) result.add = add;
  if (set.length) result.set = set;
  if (remove.length) result.remove = remove;
  return result;
};

// Helper: Process path replacement for YAML (shared by Redirect/Rewrite)
const processPath = (path: any) => {
  if (!path || (path.type !== 'ReplaceFullPath' && path.type !== 'ReplacePrefixMatch')) {
    return undefined;
  }

  if (path.type === 'ReplaceFullPath' && path.replaceFullPath?.trim()) {
    return { type: 'ReplaceFullPath', replaceFullPath: path.replaceFullPath };
  }

  if (path.type === 'ReplacePrefixMatch' && path.replacePrefixMatch?.trim()) {
    return { type: 'ReplacePrefixMatch', replacePrefixMatch: path.replacePrefixMatch };
  }

  return undefined;
};

export const generateFiltersForYAML = (filters: HTTPRouteFilter[]): HTTPRouteFilter[] => {
  if (!Array.isArray(filters) || filters.length === 0) return [];

  return filters
    .map((f) => {
      switch (f.type) {
        case 'RequestHeaderModifier': {
          const modifier = processHeaderModifier(f.requestHeaderModifier || {});
          return modifier
            ? { type: 'RequestHeaderModifier', requestHeaderModifier: modifier }
            : { type: 'RequestHeaderModifier' };
        }

        case 'ResponseHeaderModifier': {
          const modifier = processHeaderModifier(f.responseHeaderModifier || {});
          return modifier
            ? { type: 'ResponseHeaderModifier', responseHeaderModifier: modifier }
            : { type: 'ResponseHeaderModifier' };
        }

        case 'RequestRedirect': {
          const rr = f.requestRedirect || {};
          const redirect: any = {};

          if (rr.scheme?.trim()) redirect.scheme = rr.scheme;
          if (rr.hostname?.trim()) redirect.hostname = rr.hostname;
          if (typeof rr.port === 'number') redirect.port = rr.port;
          if (typeof rr.statusCode === 'number') redirect.statusCode = rr.statusCode;

          const path = processPath(rr.path);
          if (path) redirect.path = path;

          return Object.keys(redirect).length > 0
            ? { type: 'RequestRedirect', requestRedirect: redirect }
            : { type: 'RequestRedirect' };
        }

        case 'URLRewrite': {
          const url = f.urlRewrite || {};
          const rewrite: any = {};

          if (url.hostname?.trim()) rewrite.hostname = url.hostname;

          const path = processPath(url.path);
          if (path) rewrite.path = path;

          return Object.keys(rewrite).length > 0
            ? { type: 'URLRewrite', urlRewrite: rewrite }
            : { type: 'URLRewrite', urlRewrite: {} };
        }

        case 'RequestMirror': {
          const rm = f.requestMirror || { backendRef: { name: '' } };
          const backendRef: any = {};

          if (rm.backendRef?.name?.trim()) {
            backendRef.name = rm.backendRef.name;
            if (typeof rm.backendRef.port === 'number') {
              backendRef.port = rm.backendRef.port;
            }
          }

          return {
            type: 'RequestMirror',
            requestMirror: { backendRef: backendRef.name ? backendRef : { name: '' } },
          };
        }

        default:
          return f;
      }
    })
    .filter(Boolean) as HTTPRouteFilter[];
};

export const getFilterSummary = (filter: HTTPRouteFilter) => {
  if (!filter) return '';
  switch (filter.type) {
    case 'RequestHeaderModifier':
    case 'ResponseHeaderModifier': {
      const hm =
        filter.type === 'RequestHeaderModifier'
          ? filter.requestHeaderModifier || {}
          : filter.responseHeaderModifier || {};
      const parts: string[] = [];
      if (Array.isArray(hm.add)) parts.push(`add:${hm.add.length}`);
      if (Array.isArray(hm.set)) parts.push(`set:${hm.set.length}`);
      if (hm.remove) parts.push(`remove:${hm.remove.length}`);
      return parts.length ? `${filter.type} — ${parts.join(' | ')}` : filter.type;
    }
    case 'URLRewrite': {
      const f = filter.urlRewrite || {};
      const parts: string[] = [];
      if (f.hostname) parts.push(`host → ${f.hostname}`);
      if (f.path?.type === 'ReplaceFullPath' && f.path.replaceFullPath)
        parts.push(`ReplaceFullPath → ${f.path.replaceFullPath}`);
      if (f.path?.type === 'ReplacePrefixMatch' && f.path.replacePrefixMatch)
        parts.push(`ReplacePrefixMatch → ${f.path.replacePrefixMatch}`);
      return parts.length ? `${filter.type} — ${parts.join(' | ')}` : filter.type;
    }
    case 'RequestRedirect': {
      const rr = filter.requestRedirect || {};
      const parts = [
        rr.scheme,
        rr.hostname,
        rr.port?.toString?.(),
        rr.statusCode?.toString?.(),
        rr.path?.type,
        rr.path?.replaceFullPath,
        rr.path?.replacePrefixMatch,
      ].filter(Boolean) as string[];
      return parts.length ? `${filter.type} — ${parts.join(' | ')}` : filter.type;
    }
    case 'RequestMirror': {
      const rm = filter.requestMirror || { backendRef: { name: '' } };
      const parts = [rm.backendRef.name, rm.backendRef.port?.toString?.()].filter(
        Boolean,
      ) as string[];
      return `${filter.type} — ${parts.join(' | ')}`;
    }
    default:
      return 'Filter';
  }
};

// Helper: Add IDs to header arrays for UI (React keys)
const addHeaderIds = (items: HeaderKV[] | undefined, prefix: string, filterIndex: number) =>
  Array.isArray(items)
    ? items.map((i, idx) => ({
        id: i.id || `${prefix}-${filterIndex}-${idx}-${Date.now()}`,
        name: i.name || '',
        value: i.value || '',
      }))
    : [];

const addRemoveIds = (items: Array<string | HeaderNameOnly> | undefined) =>
  Array.isArray(items)
    ? items.map((e) => (typeof e === 'string' ? e : e?.name || '')).filter((s) => s.trim())
    : [];

// Helper: Parse header modifier from YAML (shared by Request/Response)
const parseHeaderModifier = (hm: any, filterIndex: number) => ({
  add: addHeaderIds(hm.add, 'add', filterIndex),
  set: addHeaderIds(hm.set, 'set', filterIndex),
  remove: addRemoveIds(hm.remove),
});

// Helper: Parse path from YAML (shared by Redirect/Rewrite)
const parsePath = (path: any) => {
  if (!path || (path.type !== 'ReplaceFullPath' && path.type !== 'ReplacePrefixMatch')) {
    return undefined;
  }

  if (path.type === 'ReplaceFullPath') {
    return { type: 'ReplaceFullPath', replaceFullPath: path.replaceFullPath || '' };
  }

  return { type: 'ReplacePrefixMatch', replacePrefixMatch: path.replacePrefixMatch || '' };
};

export const parseFiltersFromYAML = (filters: HTTPRouteFilter[] | undefined): HTTPRouteFilter[] => {
  if (!Array.isArray(filters) || filters.length === 0) return [];

  return filters.map((f, fi) => {
    if (!f || !('type' in f)) return f as HTTPRouteFilter;

    switch (f.type) {
      case 'RequestHeaderModifier': {
        const hm = (f as RequestHeaderModifierFilter).requestHeaderModifier || {};
        return {
          type: 'RequestHeaderModifier',
          requestHeaderModifier: parseHeaderModifier(hm, fi),
        };
      }

      case 'ResponseHeaderModifier': {
        const hm = (f as ResponseHeaderModifierFilter).responseHeaderModifier || {};
        return {
          type: 'ResponseHeaderModifier',
          responseHeaderModifier: parseHeaderModifier(hm, fi),
        };
      }

      case 'RequestRedirect': {
        const rr = (f as RequestRedirectFilter).requestRedirect || {};
        const obj: any = {};
        if (typeof rr.scheme === 'string') obj.scheme = rr.scheme;
        if (typeof rr.hostname === 'string') obj.hostname = rr.hostname;
        if (typeof rr.port === 'number') obj.port = rr.port;
        if (typeof rr.statusCode === 'number') obj.statusCode = rr.statusCode;

        const path = parsePath(rr.path);
        if (path) obj.path = path;

        return { type: 'RequestRedirect', requestRedirect: obj };
      }

      case 'URLRewrite': {
        const url = (f as URLRewriteFilter).urlRewrite || {};
        const obj: any = {};
        if (typeof url.hostname === 'string') obj.hostname = url.hostname;

        const path = parsePath(url.path);
        if (path) obj.path = path;

        return { type: 'URLRewrite', urlRewrite: obj };
      }

      case 'RequestMirror': {
        const rm = (f as RequestMirrorFilter).requestMirror || { backendRef: { name: '' } };
        const backendRef = rm.backendRef || { name: '' };
        const next: RequestMirrorFilter = {
          type: 'RequestMirror',
          requestMirror: { backendRef: { name: backendRef.name || '' } },
        };
        if (typeof backendRef.port === 'number') {
          next.requestMirror.backendRef.port = backendRef.port;
        }
        return next;
      }

      default:
        return f as HTTPRouteFilter;
    }
  });
};

export const isFilterConfigValid = (f: HTTPRouteFilter): boolean => {
  switch (f.type) {
    case 'RequestHeaderModifier': {
      const hm = f.requestHeaderModifier || {};
      return Boolean(
        (hm.add && Object.keys(hm.add).length) ||
          (hm.set && Object.keys(hm.set).length) ||
          (hm.remove && hm.remove.length),
      );
    }
    case 'ResponseHeaderModifier': {
      const hm = f.responseHeaderModifier || {};
      return Boolean(
        (hm.add && Object.keys(hm.add).length) ||
          (hm.set && Object.keys(hm.set).length) ||
          (hm.remove && hm.remove.length),
      );
    }
    case 'RequestRedirect': {
      const rr = f.requestRedirect || {};
      const hasHostOrPort = Boolean((rr.hostname || '').trim?.() || rr.port);
      if (!rr.path) {
        return Boolean((rr.scheme || '').trim?.() || hasHostOrPort || rr.statusCode);
      }
      return Boolean(rr.path?.type && (rr.path.replaceFullPath || rr.path.replacePrefixMatch));
    }
    case 'URLRewrite': {
      const url = f.urlRewrite || {};
      return Boolean(
        (url.hostname || '').trim?.() ||
          (url.path?.type && (url.path.replaceFullPath || url.path.replacePrefixMatch)),
      );
    }
    case 'RequestMirror': {
      const rm = f.requestMirror || { backendRef: { name: '' } };
      return (rm.backendRef.name || '').trim().length > 0;
    }
    default:
      return true;
  }
};

export const validateFiltersStep = (filters: HTTPRouteFilter[]) => {
  if (!Array.isArray(filters) || filters.length === 0) return true;
  return filters.every(isFilterConfigValid);
};
