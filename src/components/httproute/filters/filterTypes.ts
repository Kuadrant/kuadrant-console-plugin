export interface HeaderOperation {
  action: 'Add' | 'Set' | 'Delete';
  name: string;
  value?: string;
}

export type FilterType =
  | 'RequestHeaderModifier'
  | 'ResponseHeaderModifier'
  | 'URLRewrite'
  | 'RequestRedirect'
  | 'RequestMirror';

export interface HeaderKV {
  id?: string;
  name: string;
  value: string;
}

export interface HeaderNameOnly {
  id?: string;
  name: string;
}

export interface RequestHeaderModifierFilter {
  type: 'RequestHeaderModifier';
  requestHeaderModifier?: {
    add?: HeaderKV[];
    set?: HeaderKV[];
    remove?: Array<string | HeaderNameOnly>;
  };
}

export interface ResponseHeaderModifierFilter {
  type: 'ResponseHeaderModifier';
  responseHeaderModifier?: {
    add?: HeaderKV[];
    set?: HeaderKV[];
    remove?: Array<string | HeaderNameOnly>;
  };
}

export interface RequestRedirectFilter {
  type: 'RequestRedirect';
  requestRedirect: {
    scheme?: string;
    hostname?: string;
    port?: number;
    statusCode?: number;
    path?: {
      type: 'ReplaceFullPath' | 'ReplacePrefixMatch';
      replaceFullPath?: string;
      replacePrefixMatch?: string;
    };
  };
}

export interface RequestMirrorFilter {
  type: 'RequestMirror';
  requestMirror: { backendRef: { name: string; port?: number } };
}

export interface URLRewriteFilter {
  type: 'URLRewrite';
  urlRewrite: {
    hostname?: string;
    path?: {
      type: 'ReplaceFullPath' | 'ReplacePrefixMatch';
      replaceFullPath?: string;
      replacePrefixMatch?: string;
    };
  };
}

export type HTTPRouteFilter =
  | RequestHeaderModifierFilter
  | ResponseHeaderModifierFilter
  | RequestRedirectFilter
  | RequestMirrorFilter
  | URLRewriteFilter;
