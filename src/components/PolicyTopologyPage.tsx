import * as React from 'react';
import Helmet from 'react-helmet';
import {
  Page,
  PageSection,
  Title,
  Card,
  CardTitle,
  CardBody,
  TextContent,
  Text,
  Toolbar,
  ToolbarContent,
  ToolbarFilter,
  ToolbarItem,
  Badge,
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
} from '@patternfly/react-core';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import {
  DagreLayout,
  DefaultEdge,
  DefaultNode,
  ModelKind,
  GraphComponent,
  NodeShape,
  TopologyControlBar,
  TopologyView,
  Visualization,
  VisualizationProvider,
  VisualizationSurface,
  withPanZoom,
  withSelection,
  createTopologyControlButtons,
  defaultControlButtonsOptions,
  LabelPosition,
  EdgeStyle,
  EdgeAnimationSpeed,
  withContextMenu,
  ContextMenuItem,
  action,
  DefaultGroup,
} from '@patternfly/react-topology';
import { useTranslation } from 'react-i18next';

import { CubesIcon, CloudUploadAltIcon, TopologyIcon, RouteIcon } from '@patternfly/react-icons';

import * as dot from 'graphlib-dot';
import './kuadrant.css';
import resourceGVKMapping from '../utils/latest';

// Fetch the config.js file dynamically at runtime
// Normally served from <cluster-host>/api/plugins/kuadrant-console/config.js
const fetchConfig = async () => {
  const defaultConfig = {
    TOPOLOGY_CONFIGMAP_NAME: 'topology',
    TOPOLOGY_CONFIGMAP_NAMESPACE: 'kuadrant-system',
  };

  try {
    const response = await fetch('/api/plugins/kuadrant-console-plugin/config.js');
    if (!response.ok) {
      if (response.status === 404) {
        console.warn('config.js not found (running locally perhaps). Falling back to defaults.');
      } else {
        throw new Error(`Failed to fetch config.js: ${response.statusText}`);
      }
      return defaultConfig; // Fallback on 404
    }

    const script = await response.text();

    const configScript = document.createElement('script');
    configScript.innerHTML = script;
    document.head.appendChild(configScript);

    return (window as any).kuadrant_config || defaultConfig;
  } catch (error) {
    console.error('Error loading config.js:', error);
    return defaultConfig;
  }
};

export const kindToAbbr = (kind: string) => {
  return (kind.replace(/[^A-Z]/g, '') || kind.toUpperCase()).slice(0, 4);
};

// List of resource types to show by default in the filter toolbar.
// Only these kinds will be shown in the initial render if they exist in the parsed DOTfile
const showByDefault = new Set([
  'AuthPolicy',
  'Authorino',
  'ConfigMap',
  'ConsolePlugin',
  'DNSPolicy',
  'Gateway',
  'HTTPRoute',
  'HTTPRouteRule',
  'Kuadrant',
  'Limitador',
  'Listener',
  'RateLimitPolicy',
  'TLSPolicy',
]);

// Convert DOT graph to PatternFly node/edge models
const parseDotToModel = (dotString: string): { nodes: any[]; edges: any[] } => {
  try {
    const graph = dot.read(dotString);
    const nodes: any[] = [];
    const edges: any[] = [];
    const groups: any[] = [];
    const connectedNodeIds = new Set<string>();

    const shapeMapping: { [key: string]: NodeShape } = {
      Gateway: NodeShape.rect,
      HTTPRoute: NodeShape.rect,
      TLSPolicy: NodeShape.rect,
      DNSPolicy: NodeShape.rect,
      AuthPolicy: NodeShape.rect,
      RateLimitPolicy: NodeShape.rect,
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
    ]);

    // kinds for Kuadrant internals - these will be grouped also
    const kuadrantInternals = new Set([
      'ConfigMap',
      'Kuadrant',
      'Limitador',
      'Authorino',
      'ConsolePlugin',
    ]);

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

    // Group unassociated policies
    const unassociatedPolicyNodes = nodes.filter(
      (node) => !connectedNodeIds.has(node.id) && unassociatedPolicies.has(node.resourceType),
    );
    if (unassociatedPolicyNodes.length) {
      addGroup('group-unattached', unassociatedPolicyNodes, 'Unattached Policies');
    }

    // Group Kuadrant internals
    const kuadrantInternalNodes = nodes.filter((node) => kuadrantInternals.has(node.resourceType));
    if (kuadrantInternalNodes.length) {
      addGroup('group-kuadrant-internals', kuadrantInternalNodes, 'Kuadrant Internals');
    }

    // Filter out any remaining edges with missing nodes
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

// Custom node renderer
const CustomNode: React.FC<any> = ({
  element,
  onSelect,
  selected,
  onContextMenu,
  contextMenuOpen,
}) => {
  // Disable the context menu for these 'meta-kinds'
  const disabledContextMenuTypes = ['GatewayClass', 'HTTPRouteRule', 'Listener'];
  const data = element.getData();
  const { type, badge, badgeColor } = data;

  const isPolicyNode = ['TLSPolicy', 'DNSPolicy', 'AuthPolicy', 'RateLimitPolicy'].includes(type);

  let IconComponent;
  switch (type) {
    case 'Gateway':
      IconComponent = CubesIcon;
      break;
    case 'HTTPRoute':
      IconComponent = RouteIcon;
      break;
    case 'TLSPolicy':
    case 'DNSPolicy':
      IconComponent = CloudUploadAltIcon;
      break;
    case 'ConfigMap':
    case 'Listener':
      IconComponent = TopologyIcon;
      break;
    case 'GatewayClass':
      IconComponent = CubesIcon;
      break;
    case 'HttpRouteRule':
      IconComponent = RouteIcon;
      break;
    default:
      IconComponent = TopologyIcon;
      break;
  }

  const iconSize = 35;
  const paddingTop = 5;
  const paddingBottom = 15;
  const nodeHeight = element.getBounds().height;
  const nodeWidth = element.getBounds().width;

  return (
    <DefaultNode
      element={element}
      showStatusDecorator
      badge={badge}
      badgeColor={badgeColor}
      badgeTextColor="#fff"
      onSelect={onSelect}
      selected={selected}
      className={isPolicyNode ? 'policy-node' : ''}
      // Disable context menu for specified types
      onContextMenu={!disabledContextMenuTypes.includes(type) ? onContextMenu : undefined}
      contextMenuOpen={!disabledContextMenuTypes.includes(type) && contextMenuOpen}
    >
      <g transform={`translate(${nodeWidth / 2}, ${paddingTop})`}>
        <foreignObject width={iconSize} height={iconSize} x={-iconSize / 2}>
          <IconComponent
            style={{ color: '#393F44', width: `${iconSize}px`, height: `${iconSize}px` }}
          />
        </foreignObject>
      </g>
      <g transform={`translate(${nodeWidth / 2}, ${nodeHeight - paddingBottom})`}>
        <text
          className="kuadrant-topology-type-text"
          style={{
            fontWeight: 'bold',
            fontSize: '12px',
            fill: '#000',
            textAnchor: 'middle',
          }}
          dominantBaseline="central"
        >
          {type}
        </text>
      </g>
    </DefaultNode>
  );
};

const goToResource = (resourceType: string, resourceName: string) => {
  let finalResourceType = resourceType;
  let finalGVK = resourceGVKMapping[resourceType];

  // special case - Listener should go to associated Gateway
  if (resourceType === 'Listener') {
    finalResourceType = 'Gateway';
    finalGVK = resourceGVKMapping[finalResourceType];
  }

  const [namespace, name] = resourceName.includes('/')
    ? resourceName.split('/')
    : [null, resourceName];

  if (!finalGVK) {
    console.error(`GVK mapping not found for resource type: ${finalResourceType}`);
    return;
  }

  const url = namespace
    ? `/k8s/ns/${namespace}/${finalGVK.group}~${finalGVK.version}~${finalGVK.kind}/${name}`
    : `/k8s/cluster/${finalGVK.group}~${finalGVK.version}~${finalGVK.kind}/${name}`;

  window.location.href = url;
};

const customLayoutFactory = (type: string, graph: any): any => {
  return new DagreLayout(graph, {
    rankdir: 'TB',
    nodesep: 20,
    ranksep: 0,
    nodeDistance: 80,
  });
};

const customComponentFactory = (kind: ModelKind, type: string) => {
  const contextMenuItem = (resourceType: string, resourceName: string) => (
    <ContextMenuItem key="go-to-resource" onClick={() => goToResource(resourceType, resourceName)}>
      Go to Resource
    </ContextMenuItem>
  );

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

const PolicyTopologyPage: React.FC = () => {
  const [config, setConfig] = React.useState<any | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  // dynamically generated list of all resource types from the parsed DOT file
  const [allResourceTypes, setAllResourceTypes] = React.useState<string[]>([]);
  // Resource filter state. On initial render, show only resources in showByDefault
  const [selectedResourceTypes, setSelectedResourceTypes] = React.useState<string[]>([]);
  const [isResourceFilterOpen, setIsResourceFilterOpen] = React.useState(false);

  const onResourceSelect = (
    _event: React.MouseEvent | React.ChangeEvent | undefined,
    selection: string,
  ) => {
    // Toggle selection: remove if already selected, add if not
    if (selectedResourceTypes.includes(selection)) {
      setSelectedResourceTypes(selectedResourceTypes.filter((r) => r !== selection));
    } else {
      setSelectedResourceTypes([...selectedResourceTypes, selection]);
    }
  };

  const onDeleteResourceFilter = (_category: string, chip: string) => {
    if (chip) {
      setSelectedResourceTypes(selectedResourceTypes.filter((r) => r !== chip));
    }
  };

  const onDeleteResourceGroup = (_category: string) => {
    setSelectedResourceTypes([]);
  };

  const clearAllFilters = () => {
    setSelectedResourceTypes([]);
  };

  // Fetch configuration on mount
  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        const configData = await fetchConfig();
        setConfig(configData);
      } catch (error) {
        console.error('Error loading config.js:', error);
        setParseError('Failed to load configuration.');
      }
    };
    loadConfig();
  }, []);

  // Watch the ConfigMap named "topology" in the namespace provided by the config.js
  const [configMap, loaded, loadError] = useK8sWatchResource<any>(
    config
      ? {
          groupVersionKind: {
            version: 'v1',
            kind: 'ConfigMap',
          },
          name: config.TOPOLOGY_CONFIGMAP_NAME,
          namespace: config.TOPOLOGY_CONFIGMAP_NAMESPACE,
        }
      : null, // Only watch if config is loaded
  );

  const controllerRef = React.useRef<Visualization | null>(null);

  React.useEffect(() => {
    if (!controllerRef.current) {
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
      visualization.registerComponentFactory(customComponentFactory);
      visualization.fromModel(initialModel, false);
      controllerRef.current = visualization;
    }

    // Cleanup on unmount
    return () => {
      controllerRef.current = null;
    };
  }, []);

  // Handle data updates
  React.useEffect(() => {
    if (loaded && !loadError && configMap) {
      const dotString = configMap.data?.topology || '';
      if (dotString) {
        try {
          const { nodes, edges } = parseDotToModel(dotString);
          setParseError(null);

          // Separate group nodes from normal nodes
          const groupNodes = nodes.filter((n) => n.type === 'group');
          const normalNodes = nodes.filter((n) => n.type !== 'group');

          // Dynamically generate the list of resource types
          const uniqueTypes = Array.from(
            new Set(normalNodes.map((node) => node.resourceType)),
          ).sort();
          setAllResourceTypes(uniqueTypes);

          // If the user has not yet set any filter, default to those in the showByDefault set
          let newSelected = selectedResourceTypes.filter((r) => uniqueTypes.includes(r));
          if (selectedResourceTypes.length === 0) {
            newSelected = uniqueTypes.filter((t) => showByDefault.has(t));
            setSelectedResourceTypes(newSelected);
          }

          // Filter nodes by the selected resource types
          const filteredNormalNodes = normalNodes.filter((n) =>
            newSelected.includes(n.resourceType),
          );

          // For each group, only keep children that are in the filtered nodes
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

          // Filter edges to include only those connecting valid node IDs
          const validNodeIds = new Set(finalNodes.map((n) => n.id));
          const filteredEdges = edges.filter(
            (e) => validNodeIds.has(e.source) && validNodeIds.has(e.target),
          );

          if (controllerRef.current) {
            const newModel = {
              nodes: finalNodes,
              edges: filteredEdges,
              graph: {
                id: 'g1',
                type: 'graph',
                layout: 'Dagre',
              },
            };

            controllerRef.current.fromModel(newModel, false);
            controllerRef.current.getGraph().layout();
            controllerRef.current.getGraph().fit(80);
          }
        } catch (error) {
          setParseError('Failed to parse topology data.');
          console.error(error, dotString);
        }
      }
    } else if (loadError) {
      setParseError('Failed to load topology data.');
    }
  }, [configMap, loaded, loadError, selectedResourceTypes]);

  const controller = controllerRef.current;

  if (!config) {
    return <div>Loading configuration...</div>;
  }

  return (
    <>
      <Helmet>
        <title>Policy Topology</title>
      </Helmet>
      <Page>
        <PageSection variant="light">
          <Title headingLevel="h1">Policy Topology</Title>
        </PageSection>
        <PageSection className="policy-topology-section">
          <Card>
            <CardTitle>Topology View</CardTitle>
            <CardBody>
              <TextContent>
                <Text component="p" className="pf-u-mb-md">
                  {t(
                    'This view visualizes the relationships and interactions between different resources within your cluster related to Kuadrant, allowing you to explore connections between Gateways, HTTPRoutes and Kuadrant Policies.',
                  )}
                </Text>
              </TextContent>

              <Toolbar
                id="resource-filter-toolbar"
                className="pf-m-toggle-group-container"
                collapseListedFiltersBreakpoint="xl"
                clearAllFilters={clearAllFilters}
                clearFiltersButtonText={t('Reset Filters')}
              >
                <ToolbarContent>
                  <ToolbarItem variant="chip-group">
                    <ToolbarFilter
                      categoryName="Resource"
                      chips={selectedResourceTypes}
                      deleteChip={onDeleteResourceFilter}
                      deleteChipGroup={onDeleteResourceGroup}
                    >
                      <Select
                        aria-label="Resource filter"
                        role="menu"
                        isOpen={isResourceFilterOpen}
                        onOpenChange={(isOpen) => setIsResourceFilterOpen(isOpen)}
                        onSelect={onResourceSelect}
                        selected={selectedResourceTypes}
                        toggle={(toggleRef) => (
                          <MenuToggle
                            ref={toggleRef}
                            onClick={() => setIsResourceFilterOpen(!isResourceFilterOpen)}
                            isExpanded={isResourceFilterOpen}
                          >
                            Resource{' '}
                            {selectedResourceTypes.length > 0 && (
                              <Badge isRead>{selectedResourceTypes.length}</Badge>
                            )}
                          </MenuToggle>
                        )}
                      >
                        <SelectList>
                          {allResourceTypes.map((type) => (
                            <SelectOption
                              key={type}
                              value={type}
                              hasCheckbox
                              isSelected={selectedResourceTypes.includes(type)}
                            >
                              {type}
                            </SelectOption>
                          ))}
                        </SelectList>
                      </Select>
                    </ToolbarFilter>
                  </ToolbarItem>
                </ToolbarContent>
              </Toolbar>

              {!loaded ? (
                <div>Loading topology...</div>
              ) : loadError ? (
                <div>Error loading topology: {loadError.message}</div>
              ) : parseError ? (
                <div>Error parsing topology: {parseError}</div>
              ) : (
                controller && (
                  <TopologyView
                    style={{ height: '70vh' }}
                    className="kuadrant-policy-topology"
                    controlBar={
                      <TopologyControlBar
                        controlButtons={createTopologyControlButtons({
                          ...defaultControlButtonsOptions,
                          resetView: false,
                          zoomInCallback: action(() => {
                            controller.getGraph().scaleBy(4 / 3);
                          }),
                          zoomOutCallback: action(() => {
                            controller.getGraph().scaleBy(0.75);
                          }),
                          fitToScreenCallback: action(() => {
                            controller.getGraph().fit(80);
                          }),
                          legend: false,
                        })}
                      />
                    }
                  >
                    <VisualizationProvider controller={controller}>
                      <VisualizationSurface />
                    </VisualizationProvider>
                  </TopologyView>
                )
              )}
            </CardBody>
          </Card>
        </PageSection>
      </Page>
    </>
  );
};

export default PolicyTopologyPage;
