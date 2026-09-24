import { act, renderHook } from '@testing-library/react';
import { useKuadrantNamespaceChange } from './useKuadrantNamespaceChange';

type Listener = () => void;

const ALL_NS = '#ALL_NS#';

const mockRoute = {
  pathname: '',
  listeners: new Set<Listener>(),
};

// console NamespaceContext. on /kuadrant routes the console finds no namespace in the url,
// so every lastNamespace change re-runs its detection: get the active namespace, then the
// preferred one, then the last one, else fall back to all namespaces
const mockConsole = {
  active: ALL_NS,
  last: undefined as string | undefined,
  preferred: undefined as string | undefined,
  gettable: new Set<string>(),
  detectPending: false,
  devPerspective: false,
  listeners: new Set<Listener>(),
};

const mockNotify = (listeners: Set<Listener>) => listeners.forEach((listener) => listener());

const mockGoTo = (pathname: string) => {
  mockRoute.pathname = pathname;
  mockNotify(mockRoute.listeners);
};

const mockUpdateNamespace = (ns: string) => {
  if (ns !== mockConsole.active) {
    mockConsole.active = ns;
    mockNotify(mockConsole.listeners);
  }
};

// console setNamespace, also used by the NamespaceBar
const mockSetNamespace = (ns: string) => {
  if (ns !== mockConsole.last) {
    mockConsole.last = ns;
    mockConsole.detectPending = true;
  }
  mockUpdateNamespace(ns);
};

// setNamespace as the hook sees it through useActiveNamespace
const mockSetActiveNamespace = jest.fn(mockSetNamespace);

const mockNavigate = jest.fn((to: string) => mockGoTo(to));

jest.mock('react-router', () => {
  const ReactLib = jest.requireActual('react');
  const subscribe = (listener: Listener) => {
    mockRoute.listeners.add(listener);
    return () => mockRoute.listeners.delete(listener);
  };
  const usePathname = () => ReactLib.useSyncExternalStore(subscribe, () => mockRoute.pathname);
  return {
    useLocation: () => ({ pathname: usePathname() }),
    useParams: () => {
      const match = usePathname().match(/\/ns\/([^/]+)/);
      return match ? { ns: match[1] } : {};
    },
    // like BrowserRouter, navigate changes identity on every pathname change
    useNavigate: () => {
      const pathname = usePathname();
      return ReactLib.useMemo(() => (to: string) => mockNavigate(to), [pathname]);
    },
  };
});

jest.mock('@openshift-console/dynamic-plugin-sdk', () => {
  const ReactLib = jest.requireActual('react');
  const subscribe = (listener: Listener) => {
    mockConsole.listeners.add(listener);
    return () => mockConsole.listeners.delete(listener);
  };
  return {
    useActiveNamespace: () => [
      ReactLib.useSyncExternalStore(subscribe, () => mockConsole.active),
      mockSetActiveNamespace,
    ],
  };
});

const exists = (ns?: string) => !!ns && (ns === ALL_NS || mockConsole.gettable.has(ns));

// run the console's async namespace checks until they stop, returning how many ran
const settleConsole = () => {
  let runs = 0;
  const devCheckFails = () =>
    mockConsole.devPerspective && mockConsole.active !== ALL_NS && !exists(mockConsole.active);
  while (mockConsole.detectPending || devCheckFails()) {
    runs += 1;
    if (runs > 10) throw new Error('console namespace checks did not settle');
    if (mockConsole.detectPending) {
      mockConsole.detectPending = false;
      const detected = [mockConsole.active, mockConsole.preferred, mockConsole.last].find(exists);
      act(() => mockUpdateNamespace(detected ?? ALL_NS));
    } else {
      // dev perspective NamespaceBar sets all namespaces when the get fails
      act(() => mockSetNamespace(ALL_NS));
    }
  }
  return runs;
};

const setup = (
  pathname: string,
  active: string,
  { gettable = [] as string[], devPerspective = false } = {},
) => {
  mockRoute.pathname = pathname;
  mockConsole.active = active;
  mockConsole.last = active;
  mockConsole.preferred = undefined;
  mockConsole.gettable = new Set(gettable);
  mockConsole.detectPending = false;
  mockConsole.devPerspective = devPerspective;
  mockSetActiveNamespace.mockClear();
  mockNavigate.mockClear();
  return renderHook(() => useKuadrantNamespaceChange('/policies'));
};

describe('useKuadrantNamespaceChange', () => {
  it('sets the console namespace from a /ns/:ns deep link', () => {
    setup('/kuadrant/policies/ns/bar/auth', 'foo', { gettable: ['foo', 'bar'] });
    settleConsole();

    expect(mockConsole.active).toBe('bar');
    expect(mockRoute.pathname).toBe('/kuadrant/policies/ns/bar/auth');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('keeps a /ns/:ns deep link when the console falls back to all namespaces', () => {
    setup('/kuadrant/policies/ns/kuadrant-test', ALL_NS);
    expect(settleConsole()).toBe(1);

    expect(mockConsole.active).toBe('kuadrant-test');
    expect(mockRoute.pathname).toBe('/kuadrant/policies/ns/kuadrant-test');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('sets all namespaces from an /all-namespaces deep link and keeps the tab', () => {
    setup('/kuadrant/policies/all-namespaces/auth', 'foo', { gettable: ['foo'] });
    settleConsole();

    expect(mockConsole.active).toBe(ALL_NS);
    expect(mockRoute.pathname).toBe('/kuadrant/policies/all-namespaces/auth');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate on a tab change under /all-namespaces', () => {
    setup('/kuadrant/policies/all-namespaces', ALL_NS);
    act(() => mockGoTo('/kuadrant/policies/all-namespaces/auth'));

    expect(mockRoute.pathname).toBe('/kuadrant/policies/all-namespaces/auth');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('follows a namespace created from the NamespaceBar and keeps the tab', () => {
    setup('/kuadrant/policies/ns/old/auth', 'old', { gettable: ['old', 'new-ns'] });
    act(() => mockSetNamespace('new-ns'));
    settleConsole();

    expect(mockConsole.active).toBe('new-ns');
    expect(mockRoute.pathname).toBe('/kuadrant/policies/ns/new-ns/auth');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('follows a namespace created from the NamespaceBar under /all-namespaces', () => {
    setup('/kuadrant/policies/all-namespaces/auth', ALL_NS, { gettable: ['new-ns'] });
    act(() => mockSetNamespace('new-ns'));
    settleConsole();

    expect(mockConsole.active).toBe('new-ns');
    expect(mockRoute.pathname).toBe('/kuadrant/policies/ns/new-ns/auth');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('navigates once when a namespace is selected from the NamespaceBar', () => {
    const { result } = setup('/kuadrant/policies/ns/old/auth', 'old', {
      gettable: ['old', 'bar'],
    });
    act(() => {
      result.current.handleNamespaceChange('bar');
      mockSetNamespace('bar');
    });
    settleConsole();

    expect(mockConsole.active).toBe('bar');
    expect(mockRoute.pathname).toBe('/kuadrant/policies/ns/bar/auth');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('navigates once when all namespaces is selected from the NamespaceBar', () => {
    const { result } = setup('/kuadrant/policies/ns/old/auth', 'old', { gettable: ['old'] });
    act(() => {
      result.current.handleNamespaceChange(ALL_NS);
      mockSetNamespace(ALL_NS);
    });
    settleConsole();

    expect(mockConsole.active).toBe(ALL_NS);
    expect(mockRoute.pathname).toBe('/kuadrant/policies/all-namespaces/auth');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('settles after a redirect from /all-namespaces to a namespace the user cannot get', () => {
    setup('/kuadrant/policies/all-namespaces', ALL_NS);
    act(() => mockGoTo('/kuadrant/policies/ns/default'));
    expect(settleConsole()).toBe(1);

    expect(mockConsole.active).toBe('default');
    expect(mockRoute.pathname).toBe('/kuadrant/policies/ns/default');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('follows the url on back and forward navigation', () => {
    setup('/kuadrant/policies/ns/a', 'a', { gettable: ['a', 'b'] });
    act(() => mockGoTo('/kuadrant/policies/ns/b/auth'));
    settleConsole();

    expect(mockConsole.active).toBe('b');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('re-asserts the url namespace once per url, then accepts the console', () => {
    setup('/kuadrant/policies/ns/a', ALL_NS);
    settleConsole();
    expect(mockConsole.active).toBe('a');

    const sets = mockSetActiveNamespace.mock.calls.length;
    act(() => mockUpdateNamespace(ALL_NS));
    expect(mockConsole.active).toBe(ALL_NS);
    expect(mockSetActiveNamespace).toHaveBeenCalledTimes(sets);

    act(() => mockGoTo('/kuadrant/policies/ns/b'));
    settleConsole();
    expect(mockConsole.active).toBe('b');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not loop against the dev perspective NamespaceBar check', () => {
    setup('/kuadrant/policies/ns/kuadrant-test', ALL_NS, { devPerspective: true });
    settleConsole();

    // the NamespaceBar's own fallback is accepted
    expect(mockConsole.active).toBe(ALL_NS);
    expect(mockRoute.pathname).toBe('/kuadrant/policies/ns/kuadrant-test');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSetActiveNamespace).toHaveBeenCalledTimes(2);
  });
});
