import * as React from 'react';
import {
  TopologyControlBar,
  createTopologyControlButtons,
  defaultControlButtonsOptions,
  action,
  Visualization,
} from '@patternfly/react-topology';

interface TopologyControlsProps {
  controller: Visualization;
}

export const TopologyControls: React.FC<TopologyControlsProps> = ({ controller }) => {
  return (
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
  );
};
