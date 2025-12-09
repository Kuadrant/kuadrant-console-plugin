/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import {
  Visualization,
  DagreLayout,
  ModelKind,
  GraphComponent,
  DefaultEdge,
  DefaultGroup,
  ContextMenuItem,
  withPanZoom,
  withSelection,
  withContextMenu,
} from '@patternfly/react-topology';
import { CustomNode } from '../../components/topology/CustomNode';
import {
  goToResource,
  navigateToCreatePolicy,
  getPolicyConfigsForResource,
} from '../../utils/topology/navigationHelpers';

// custom layout factory for dagre layout
const customLayoutFactory = (type: string, graph: any): any => {
  return new DagreLayout(graph, {
    rankdir: 'TB',
    nodesep: 20,
    ranksep: 0,
    nodeDistance: 80,
  });
};

// create component factory
const createComponentFactory = () => {
  return (kind: ModelKind, type: string) => {
    const contextMenuItem = (resourceType: string, resourceName: string) => {
      const policyConfigs = getPolicyConfigsForResource(resourceType);
      return (
        <>
          <ContextMenuItem
            key="go-to-resource"
            onClick={() => goToResource(resourceType, resourceName)}
          >
            Go to Resource
          </ContextMenuItem>
          {policyConfigs.map((policy) => (
            <ContextMenuItem
              key={`create-${policy.key.toLowerCase()}`}
              onClick={() => navigateToCreatePolicy(policy.key)}
            >
              {policy.displayName}
            </ContextMenuItem>
          ))}
        </>
      );
    };

    const contextMenu = (element: any) => {
      const resourceType = element.getData().type;
      const resourceName = element.getLabel();
      return [contextMenuItem(resourceType, resourceName)];
    };

    switch (type) {
      case 'group':
        return DefaultGroup;
      default:
        switch (kind) {
          case ModelKind.graph:
            return withPanZoom()(GraphComponent);
          case ModelKind.node:
            return withContextMenu(contextMenu)(CustomNode);
          case ModelKind.edge:
            return withSelection()(DefaultEdge);
          default:
            return undefined;
        }
    }
  };
};

// hook to manage visualization controller lifecycle
// IMPORTANT: Returns stable controller reference to prevent re-rendering issues
export const useVisualizationController = () => {
  const controllerRef = React.useRef<Visualization | null>(null);
  const isInitializedRef = React.useRef(false);

  React.useEffect(() => {
    // create controller once on mount
    if (!isInitializedRef.current) {
      const initialModel = {
        nodes: [],
        edges: [],
        graph: {
          id: 'g1',
          type: 'graph',
          layout: 'Dagre',
        },
      };

      const visualization = new Visualization();
      visualization.registerLayoutFactory(customLayoutFactory);
      visualization.registerComponentFactory(createComponentFactory());
      visualization.fromModel(initialModel, false);
      controllerRef.current = visualization;
      isInitializedRef.current = true;
    }

    // cleanup on unmount only
    return () => {
      if (isInitializedRef.current) {
        controllerRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []);

  return controllerRef.current;
};
