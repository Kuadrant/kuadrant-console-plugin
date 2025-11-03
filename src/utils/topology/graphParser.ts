/* eslint-disable @typescript-eslint/no-explicit-any */
import * as dot from 'graphlib-dot';
import {
  NodeShape,
  LabelPosition,
  EdgeStyle,
  EdgeAnimationSpeed,
} from '@patternfly/react-topology';
import { getTopologyDefaultKinds } from '../resources';

// convert kind to abbreviated form for badge display
export const kindToAbbr = (kind: string) => {
  return (kind.replace(/[^A-Z]/g, '') || kind.toUpperCase()).slice(0, 4);
};

// resource types to show by default in filter toolbar
// derived from resources.ts registry
export const showByDefault = new Set([
  ...getTopologyDefaultKinds(),
  // add non-resource node types that should show by default
  'HTTPRouteRule',
]);

// node shape configuration by resource type
const shapeMapping: { [key: string]: NodeShape } = {
  Gateway: NodeShape.rect,
  HTTPRoute: NodeShape.rect,
  TLSPolicy: NodeShape.rect,
  DNSPolicy: NodeShape.rect,
  AuthPolicy: NodeShape.rect,
  RateLimitPolicy: NodeShape.rect,
  TokenRateLimitPolicy: NodeShape.rect,
  OIDCPolicy: NodeShape.rect,
  PlanPolicy: NodeShape.rect,
  ConfigMap: NodeShape.ellipse,
  Listener: NodeShape.rect,
  Kuadrant: NodeShape.ellipse,
};

// kinds for unassociated policies - these will be grouped
const unassociatedPolicies = new Set([
  'TLSPolicy',
  'DNSPolicy',
  'AuthPolicy',
  'RateLimitPolicy',
  'TokenRateLimitPolicy',
  'OIDCPolicy',
  'PlanPolicy',
]);

// kinds for kuadrant internals - these will be grouped also
const kuadrantInternals = new Set([
  'ConfigMap',
  'Kuadrant',
  'Limitador',
  'Authorino',
  'ConsolePlugin',
]);

// convert DOT graph string to PatternFly node/edge models
export const parseDotToModel = (dotString: string): { nodes: any[]; edges: any[] } => {
  try {
    const graph = dot.read(dotString);
    const nodes: any[] = [];
    const edges: any[] = [];
    const groups: any[] = [];
    const connectedNodeIds = new Set<string>();

    const addEdge = (source: string, target: string, type: string) => {
      edges.push({
        id: `edge-${source}-${target}`,
        type: 'edge',
        source,
        target,
        edgeStyle: type === 'policy' ? EdgeStyle.dashedMd : EdgeStyle.default,
        animationSpeed: type === 'policy' ? EdgeAnimationSpeed.medium : undefined,
        style: { strokeWidth: 2, stroke: '#393F44' },
      });
      connectedNodeIds.add(source);
      connectedNodeIds.add(target);
    };

    // process edges: add each edge directly
    graph
      .edges()
      .forEach(({ v: sourceNodeId, w: targetNodeId }: { v: string; w: string }) =>
        addEdge(sourceNodeId, targetNodeId, 'default'),
      );

    // create nodes
    graph.nodes().forEach((nodeId: string) => {
      const nodeData = graph.node(nodeId);
      const [resourceType, resourceName] = nodeData.label.split('\\n');
      nodes.push({
        id: nodeId,
        type: 'node',
        label: resourceName,
        resourceType,
        width: 120,
        height: 65,
        labelPosition: LabelPosition.bottom,
        shape: shapeMapping[resourceType] || NodeShape.rect,
        data: {
          label: resourceName,
          type: resourceType,
          badge: kindToAbbr(resourceType),
          badgeColor: '#2b9af3',
        },
      });
    });

    const addGroup = (id: string, children: any[], label: string) => {
      groups.push({
        id,
        children: children.map((node) => node.id),
        type: 'group',
        group: true,
        label,
        style: { padding: 40 },
      });
    };

    // group unassociated policies
    const unassociatedPolicyNodes = nodes.filter(
      (node) => !connectedNodeIds.has(node.id) && unassociatedPolicies.has(node.resourceType),
    );
    if (unassociatedPolicyNodes.length) {
      addGroup('group-unattached', unassociatedPolicyNodes, 'Unattached Policies');
    }

    // group kuadrant internals
    const kuadrantInternalNodes = nodes.filter((node) => kuadrantInternals.has(node.resourceType));
    if (kuadrantInternalNodes.length) {
      addGroup('group-kuadrant-internals', kuadrantInternalNodes, 'Kuadrant Internals');
    }

    // filter out any remaining edges with missing nodes
    const nodeIds = new Set(nodes.map((node) => node.id));
    const validEdges = edges.filter(
      ({ source, target }) => nodeIds.has(source) && nodeIds.has(target),
    );

    return { nodes: [...nodes, ...groups], edges: validEdges };
  } catch (error) {
    console.error('Error parsing DOT string:', error);
    throw error;
  }
};

// preserve transitive connections when intermediate nodes are filtered out
// e.g., if Gateway -> Listener -> HTTPRoute and Listener is filtered, create Gateway -> HTTPRoute
export const preserveTransitiveEdges = (
  allNodes: any[],
  allEdges: any[],
  keptNodeIds: Set<string>,
) => {
  const edgesBySource = new Map<string, any[]>();
  const edgesByTarget = new Map<string, any[]>();

  // build edge lookup maps
  allEdges.forEach((edge) => {
    if (!edgesBySource.has(edge.source)) {
      edgesBySource.set(edge.source, []);
    }
    edgesBySource.get(edge.source)?.push(edge);

    if (!edgesByTarget.has(edge.target)) {
      edgesByTarget.set(edge.target, []);
    }
    edgesByTarget.get(edge.target)?.push(edge);
  });

  const resultEdges: any[] = [];
  const processedEdges = new Set<string>();

  // node types that should preserve transitive connections when filtered
  const transitiveNodeTypes = new Set(['Listener', 'HTTPRouteRule']);

  // for each filtered-out node, create transitive edges
  allNodes.forEach((node) => {
    if (!keptNodeIds.has(node.id) && transitiveNodeTypes.has(node.resourceType)) {
      // this node is being filtered out and is a type we want to preserve connections for
      const incomingEdges = edgesByTarget.get(node.id) || [];
      const outgoingEdges = edgesBySource.get(node.id) || [];

      // create transitive edges from all predecessors to all successors
      incomingEdges.forEach((inEdge) => {
        outgoingEdges.forEach((outEdge) => {
          if (keptNodeIds.has(inEdge.source) && keptNodeIds.has(outEdge.target)) {
            const edgeKey = `${inEdge.source}-${outEdge.target}`;
            if (!processedEdges.has(edgeKey)) {
              processedEdges.add(edgeKey);
              resultEdges.push({
                id: `edge-${inEdge.source}-${outEdge.target}`,
                type: 'edge',
                source: inEdge.source,
                target: outEdge.target,
                edgeStyle: EdgeStyle.default,
                style: { strokeWidth: 2, stroke: '#393F44' },
              });
            }
          }
        });
      });
    }
  });

  // add original edges between kept nodes
  allEdges.forEach((edge) => {
    if (keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)) {
      const edgeKey = `${edge.source}-${edge.target}`;
      if (!processedEdges.has(edgeKey)) {
        processedEdges.add(edgeKey);
        resultEdges.push(edge);
      }
    }
  });

  return resultEdges;
};
