import { kindToAbbr, parseDotToModel, preserveTransitiveEdges } from './graphParser';

describe('kindToAbbr', () => {
  it('extracts uppercase letters from a mixed-case kind', () => {
    expect(kindToAbbr('Gateway')).toBe('G');
  });

  it('extracts multiple uppercase letters', () => {
    expect(kindToAbbr('HTTPRoute')).toBe('HTTP');
  });

  it('truncates to 4 characters when more than 4 uppercase letters', () => {
    expect(kindToAbbr('HTTPRouteRule')).toBe('HTTP');
  });

  it('falls back to toUpperCase when no uppercase letters exist', () => {
    expect(kindToAbbr('gateway')).toBe('GATE');
  });

  it('handles single character kind', () => {
    expect(kindToAbbr('A')).toBe('A');
  });

  it('extracts 2 uppercase letters from AuthPolicy', () => {
    expect(kindToAbbr('AuthPolicy')).toBe('AP');
  });
});

describe('parseDotToModel', () => {
  it('parses a single node with kind and name', () => {
    const dotString = 'digraph { n1 [label="Gateway\\nmy-gateway"] }';
    const { nodes, edges } = parseDotToModel(dotString);

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'n1',
          label: 'my-gateway',
          resourceType: 'Gateway',
          data: expect.objectContaining({ badge: 'G' }),
        }),
      ]),
    );
    expect(edges).toHaveLength(0);
  });

  it('parses nodes and edges', () => {
    const dotString = `digraph {
      n1 [label="Gateway\\nmy-gw"]
      n2 [label="HTTPRoute\\nmy-route"]
      n1 -> n2
    }`;
    const { nodes, edges } = parseDotToModel(dotString);

    const regularNodes = nodes.filter((n) => n.type === 'node');
    expect(regularNodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('n1');
    expect(edges[0].target).toBe('n2');
  });

  it('groups unconnected policy nodes as Unattached Policies', () => {
    const dotString = `digraph {
      n1 [label="Gateway\\nmy-gw"]
      n2 [label="AuthPolicy\\nmy-policy"]
    }`;
    const { nodes } = parseDotToModel(dotString);

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'group-unattached',
          label: 'Unattached Policies',
          children: expect.arrayContaining(['n2']),
        }),
      ]),
    );
  });

  it('does not group connected policy nodes', () => {
    const dotString = `digraph {
      n1 [label="Gateway\\nmy-gw"]
      n2 [label="AuthPolicy\\nmy-policy"]
      n1 -> n2
    }`;
    const { nodes } = parseDotToModel(dotString);

    const group = nodes.find((n) => n.id === 'group-unattached');
    expect(group).toBeUndefined();
  });

  it('groups kuadrant internal nodes', () => {
    const dotString = `digraph {
      n1 [label="Kuadrant\\nmy-kuadrant"]
      n2 [label="ConfigMap\\ntopology"]
    }`;
    const { nodes } = parseDotToModel(dotString);

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'group-kuadrant-internals',
          label: 'Kuadrant Internals',
          children: expect.arrayContaining(['n1', 'n2']),
        }),
      ]),
    );
  });

  it('throws on invalid DOT string', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseDotToModel('not a valid dot string {')).toThrow();
    jest.restoreAllMocks();
  });

  it('handles empty graph', () => {
    const dotString = 'digraph {}';
    const { nodes, edges } = parseDotToModel(dotString);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});

describe('preserveTransitiveEdges', () => {
  const makeNode = (id: string, resourceType: string) => ({ id, resourceType });
  const makeEdge = (source: string, target: string) => ({
    id: `edge-${source}-${target}`,
    type: 'edge',
    source,
    target,
    edgeStyle: 'default',
    style: { strokeWidth: 2, stroke: '#393F44' },
  });

  it('keeps original edges when all nodes are kept', () => {
    const nodes = [makeNode('gw', 'Gateway'), makeNode('route', 'HTTPRoute')];
    const edges = [makeEdge('gw', 'route')];
    const kept = new Set(['gw', 'route']);

    const result = preserveTransitiveEdges(nodes, edges, kept);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('gw');
    expect(result[0].target).toBe('route');
  });

  it('creates transitive edge when a Listener is filtered out', () => {
    const nodes = [
      makeNode('gw', 'Gateway'),
      makeNode('listener', 'Listener'),
      makeNode('route', 'HTTPRoute'),
    ];
    const edges = [makeEdge('gw', 'listener'), makeEdge('listener', 'route')];
    const kept = new Set(['gw', 'route']);

    const result = preserveTransitiveEdges(nodes, edges, kept);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('gw');
    expect(result[0].target).toBe('route');
  });

  it('creates transitive edge when an HTTPRouteRule is filtered out', () => {
    const nodes = [
      makeNode('route', 'HTTPRoute'),
      makeNode('rule', 'HTTPRouteRule'),
      makeNode('policy', 'AuthPolicy'),
    ];
    const edges = [makeEdge('route', 'rule'), makeEdge('rule', 'policy')];
    const kept = new Set(['route', 'policy']);

    const result = preserveTransitiveEdges(nodes, edges, kept);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('route');
    expect(result[0].target).toBe('policy');
  });

  it('does not create transitive edge for non-transitive node types', () => {
    const nodes = [
      makeNode('gw', 'Gateway'),
      makeNode('route', 'HTTPRoute'),
      makeNode('policy', 'AuthPolicy'),
    ];
    const edges = [makeEdge('gw', 'route'), makeEdge('route', 'policy')];
    const kept = new Set(['gw', 'policy']);

    const result = preserveTransitiveEdges(nodes, edges, kept);
    expect(result).toHaveLength(0);
  });

  it('deduplicates transitive edges from multiple intermediate nodes', () => {
    // Two Listeners both connect the same Gateway to the same HTTPRoute
    const nodes = [
      makeNode('gw', 'Gateway'),
      makeNode('listener1', 'Listener'),
      makeNode('listener2', 'Listener'),
      makeNode('route', 'HTTPRoute'),
    ];
    const edges = [
      makeEdge('gw', 'listener1'),
      makeEdge('listener1', 'route'),
      makeEdge('gw', 'listener2'),
      makeEdge('listener2', 'route'),
    ];
    const kept = new Set(['gw', 'route']);

    const result = preserveTransitiveEdges(nodes, edges, kept);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('gw');
    expect(result[0].target).toBe('route');
  });

  it('returns empty array when no nodes are kept', () => {
    const nodes = [makeNode('gw', 'Gateway')];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const edges: any[] = [];
    const kept = new Set<string>();

    const result = preserveTransitiveEdges(nodes, edges, kept);
    expect(result).toHaveLength(0);
  });

  it('handles chain of two transitive nodes filtered out', () => {
    // Gateway -> Listener -> HTTPRouteRule -> AuthPolicy
    // Both Listener and HTTPRouteRule filtered
    const nodes = [
      makeNode('gw', 'Gateway'),
      makeNode('listener', 'Listener'),
      makeNode('rule', 'HTTPRouteRule'),
      makeNode('policy', 'AuthPolicy'),
    ];
    const edges = [
      makeEdge('gw', 'listener'),
      makeEdge('listener', 'rule'),
      makeEdge('rule', 'policy'),
    ];
    const kept = new Set(['gw', 'policy']);

    const result = preserveTransitiveEdges(nodes, edges, kept);
    // Listener bridges gw -> rule, but rule is not kept
    // HTTPRouteRule bridges listener -> policy, but listener is not kept
    expect(result).toHaveLength(0);
  });
});
