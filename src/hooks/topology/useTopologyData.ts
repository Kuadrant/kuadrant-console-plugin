/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { Visualization } from '@patternfly/react-topology';
import {
  parseDotToModel,
  preserveTransitiveEdges,
  showByDefault,
} from '../../utils/topology/graphParser';

interface UseTopologyDataProps {
  controller: Visualization | null;
  configMapData: string | null;
  selectedResourceTypes: string[];
  selectedNamespace: string | null;
  onInitialSelection?: (types: string[]) => void;
  loaded: boolean;
  loadError: any;
}

interface UseTopologyDataReturn {
  allResourceTypes: string[];
  allNamespaces: string[];
  parseError: string | null;
  isInitialLoad: boolean;
}

// hook to process and apply topology data to visualization controller
// handles filtering, transitive edge preservation, and zoom/pan state
export const useTopologyData = ({
  controller,
  configMapData,
  selectedResourceTypes,
  selectedNamespace,
  onInitialSelection,
  loaded,
  loadError,
}: UseTopologyDataProps): UseTopologyDataReturn => {
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [allResourceTypes, setAllResourceTypes] = React.useState<string[]>([]);
  const [allNamespaces, setAllNamespaces] = React.useState<string[]>([]);
  const [isInitialLoad, setIsInitialLoad] = React.useState(true);

  // track previous filter selections to detect changes
  const prevSelectedResourceTypesRef = React.useRef<string[]>([]);
  const prevSelectedNamespaceRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!loaded || loadError || !configMapData || !controller) {
      if (loadError) {
        setParseError('Failed to load topology data.');
      }
      return;
    }

    try {
      const { nodes, edges } = parseDotToModel(configMapData);
      setParseError(null);

      // separate group nodes from normal nodes
      const groupNodes = nodes.filter((n) => n.type === 'group');
      const normalNodes = nodes.filter((n) => n.type !== 'group');

      // dynamically generate the list of resource types
      const uniqueTypes = Array.from(new Set(normalNodes.map((node) => node.resourceType))).sort();
      setAllResourceTypes(uniqueTypes);

      // extract unique namespaces from node labels
      const namespaces = new Set<string>();
      normalNodes.forEach((node) => {
        const parts = node.label.split('/');
        if (parts.length > 1) {
          namespaces.add(parts[0]);
        }
      });
      setAllNamespaces(Array.from(namespaces).sort());

      // on initial load, default to showByDefault set
      let activeSelection = selectedResourceTypes.filter((r) => uniqueTypes.includes(r));
      if (selectedResourceTypes.length === 0 && isInitialLoad) {
        activeSelection = uniqueTypes.filter((t) => showByDefault.has(t));
        // notify parent component to update its state
        if (onInitialSelection && activeSelection.length > 0) {
          onInitialSelection(activeSelection);
        }
      }

      // filter by namespace first if one is selected (before resource type filtering)
      let namespacedNodes = normalNodes;
      if (selectedNamespace) {
        // extract namespace from label (format: "namespace/name" or just "name" for cluster-scoped)
        const getNamespace = (label: string) => {
          const parts = label.split('/');
          return parts.length > 1 ? parts[0] : null; // null = cluster-scoped
        };

        // first pass: find nodes in the selected namespace
        const nodesInNamespace = new Set(
          normalNodes
            .filter((n) => {
              const ns = getNamespace(n.label);
              return ns === selectedNamespace;
            })
            .map((n) => n.id),
        );

        // second pass: follow edges to find connected infrastructure
        // edge structure: Gateway -> Listener -> HTTPRoute -> HTTPRouteRule
        // policies point to their targets with dashed edges
        const connectedNodes = new Set(nodesInNamespace);
        const nodeMap = new Map(normalNodes.map((n) => [n.id, n]));

        // iterative traversal to build connected graph
        let changed = true;
        let iteration = 0;
        const maxIterations = 4;

        while (changed && iteration < maxIterations) {
          changed = false;
          iteration++;

          edges.forEach((edge) => {
            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);
            if (!sourceNode || !targetNode) return;

            const targetNs = getNamespace(targetNode.label);

            // forward traversal: if source is in our set
            if (connectedNodes.has(edge.source)) {
              // traverse to child resources
              if (
                targetNode.resourceType === 'Listener' ||
                targetNode.resourceType === 'HTTPRouteRule' ||
                targetNode.resourceType === 'HTTPRoute' ||
                targetNode.resourceType === 'DNSRecord'
              ) {
                if (!connectedNodes.has(edge.target)) {
                  connectedNodes.add(edge.target);
                  changed = true;
                }
              }
              // include cluster-scoped infrastructure except GatewayClass
              else if (targetNs === null && targetNode.resourceType !== 'GatewayClass') {
                if (!connectedNodes.has(edge.target)) {
                  connectedNodes.add(edge.target);
                  changed = true;
                }
              }
            }

            // backward traversal: if target is in our set
            if (connectedNodes.has(edge.target)) {
              // include parent infrastructure (Gateway, Listener)
              if (sourceNode.resourceType === 'Gateway' || sourceNode.resourceType === 'Listener') {
                if (!connectedNodes.has(edge.source)) {
                  connectedNodes.add(edge.source);
                  changed = true;
                }
              }
              // include policies targeting our resources
              else if (sourceNode.resourceType?.includes('Policy')) {
                if (!connectedNodes.has(edge.source)) {
                  connectedNodes.add(edge.source);
                  changed = true;
                }
              }
              // include HTTPRoutes that target our listeners
              else if (sourceNode.resourceType === 'HTTPRoute') {
                if (!connectedNodes.has(edge.source)) {
                  connectedNodes.add(edge.source);
                  changed = true;
                }
              }
            }
          });
        }

        namespacedNodes = normalNodes.filter((n) => connectedNodes.has(n.id));
      }

      // now filter by resource types
      const filteredNormalNodes = namespacedNodes.filter((n) =>
        activeSelection.includes(n.resourceType),
      );

      // for each group, only keep children that are in the filtered nodes
      const keptNormalNodeIds = new Set(filteredNormalNodes.map((n) => n.id));
      const updatedGroups = groupNodes.map((g) => {
        const validChildren = g.children?.filter((childId: string) =>
          keptNormalNodeIds.has(childId),
        );
        return {
          ...g,
          children: validChildren,
        };
      });
      const filteredGroups = updatedGroups.filter((g) => g.children?.length > 0);

      const finalNodes = [...filteredNormalNodes, ...filteredGroups];

      // filter edges to include transitive connections
      const validNodeIds = new Set(finalNodes.map((n) => n.id));
      const filteredEdges = preserveTransitiveEdges(nodes, edges, validNodeIds);

      // check if filter changed (resource types or namespace)
      const filterChanged =
        JSON.stringify([...prevSelectedResourceTypesRef.current].sort()) !==
          JSON.stringify([...activeSelection].sort()) ||
        prevSelectedNamespaceRef.current !== selectedNamespace;

      const newModel = {
        nodes: finalNodes,
        edges: filteredEdges,
        graph: {
          id: 'g1',
          type: 'graph',
          layout: 'Dagre',
        },
      };

      if (isInitialLoad && finalNodes.length > 0) {
        // INITIAL LOAD: fit to screen
        controller.fromModel(newModel, false);
        controller.getGraph().layout();

        // fit to screen after layout completes
        setTimeout(() => {
          if (controller) {
            controller.getGraph().fit(80);
          }
        }, 100);
        setIsInitialLoad(false);
      } else if (!isInitialLoad && finalNodes.length > 0) {
        // UPDATES: distinguish between filter changes and data changes
        if (filterChanged) {
          // FILTER CHANGED: refit to show new nodes
          controller.fromModel(newModel, false);
          controller.getGraph().layout();

          setTimeout(() => {
            if (controller) {
              controller.getGraph().fit(80);
            }
          }, 100);
        } else {
          // DATA CHANGED (ConfigMap updated): preserve zoom/pan
          // This prevents the "odd shifting" behavior when topology source changes
          const currentScale = controller.getGraph().getScale();
          const currentPosition = controller.getGraph().getPosition();

          controller.fromModel(newModel, false);
          controller.getGraph().layout();

          // restore user's view state
          controller.getGraph().setScale(currentScale);
          controller.getGraph().setPosition(currentPosition);
        }
      } else if (finalNodes.length === 0) {
        // no nodes to display
        controller.fromModel(newModel, false);
      }

      prevSelectedResourceTypesRef.current = [...activeSelection];
      prevSelectedNamespaceRef.current = selectedNamespace;
    } catch (error) {
      setParseError('Failed to parse topology data.');
      console.error('Topology parsing error:', error);
    }
  }, [
    controller,
    configMapData,
    selectedResourceTypes,
    selectedNamespace,
    loaded,
    loadError,
    isInitialLoad,
  ]);

  return {
    allResourceTypes,
    allNamespaces,
    parseError,
    isInitialLoad,
  };
};
