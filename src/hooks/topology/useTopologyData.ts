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
  onInitialSelection?: (types: string[]) => void;
  loaded: boolean;
  loadError: any;
}

interface UseTopologyDataReturn {
  allResourceTypes: string[];
  parseError: string | null;
  isInitialLoad: boolean;
}

// hook to process and apply topology data to visualization controller
// handles filtering, transitive edge preservation, and zoom/pan state
export const useTopologyData = ({
  controller,
  configMapData,
  selectedResourceTypes,
  onInitialSelection,
  loaded,
  loadError,
}: UseTopologyDataProps): UseTopologyDataReturn => {
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [allResourceTypes, setAllResourceTypes] = React.useState<string[]>([]);
  const [isInitialLoad, setIsInitialLoad] = React.useState(true);

  // track previous filter selections to detect changes
  const prevSelectedResourceTypesRef = React.useRef<string[]>([]);

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

      // on initial load, default to showByDefault set
      let activeSelection = selectedResourceTypes.filter((r) => uniqueTypes.includes(r));
      if (selectedResourceTypes.length === 0 && isInitialLoad) {
        activeSelection = uniqueTypes.filter((t) => showByDefault.has(t));
        // notify parent component to update its state
        if (onInitialSelection && activeSelection.length > 0) {
          onInitialSelection(activeSelection);
        }
      }

      // filter nodes by the active resource types
      const filteredNormalNodes = normalNodes.filter((n) =>
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

      // check if filter changed
      const filterChanged =
        JSON.stringify([...prevSelectedResourceTypesRef.current].sort()) !==
        JSON.stringify([...activeSelection].sort());

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
    } catch (error) {
      setParseError('Failed to parse topology data.');
      console.error('Topology parsing error:', error);
    }
  }, [controller, configMapData, selectedResourceTypes, loaded, loadError, isInitialLoad]);

  return {
    allResourceTypes,
    parseError,
    isInitialLoad,
  };
};
