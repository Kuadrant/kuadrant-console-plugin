import * as React from 'react';  // Updated import style to avoid errors
import { Select, SelectOption, SelectList, MenuToggle, MenuToggleElement } from '@patternfly/react-core';
import { K8sResourceKind, k8sList } from '@openshift-console/dynamic-plugin-sdk';

const GatewayPicker: React.FunctionComponent = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedGateway, setSelectedGateway] = React.useState<string>('Select a Gateway');
  const [gatewayOptions, setGatewayOptions] = React.useState<K8sResourceKind[]>([]);

  const gatewayModel = {
    apiGroup: 'gateway.networking.k8s.io',
    apiVersion: 'v1',
    kind: 'Gateway',
    plural: 'gateways',
    abbr: 'GW',
    label: 'Gateway',
    labelPlural: 'Gateways',
  };

  React.useEffect(() => {
    const fetchGateways = async () => {
      try {
        const response = await k8sList({
          model: gatewayModel,
          queryParams: { ns: '' }
        });

        const gatewayList = Array.isArray(response) ? response : response.items;
        setGatewayOptions(gatewayList);
      } catch (error) {
        console.error('Error fetching Gateway objects:', error);
      }
    };

    fetchGateways();
  }, []);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };

  const onSelect = (_event: React.MouseEvent<Element, MouseEvent> | undefined, value: string | number | undefined) => {
    setSelectedGateway(value as string);
    setIsOpen(false);
  };

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={isOpen} style={{ width: '200px' }}>
      {selectedGateway}
    </MenuToggle>
  );

  return (
    <Select
      id="gateway-picker"
      isOpen={isOpen}
      selected={selectedGateway}
      onSelect={onSelect}
      onOpenChange={(isOpen) => setIsOpen(isOpen)}
      toggle={toggle}
      shouldFocusToggleOnSelect
    >
      <SelectList>
        {gatewayOptions.length > 0 ? (
          gatewayOptions.map((gateway: K8sResourceKind) => (
            <SelectOption key={gateway.metadata.uid} value={gateway.metadata.name}>
              {`${gateway.metadata.namespace}/${gateway.metadata.name}`}
            </SelectOption>
          ))
        ) : (
          <SelectOption value="" isDisabled>
            No Gateways available
          </SelectOption>
        )}
      </SelectList>
    </Select>
  );
};

export default GatewayPicker;
