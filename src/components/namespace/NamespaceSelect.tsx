import { useK8sWatchResource } from "@openshift-console/dynamic-plugin-sdk";
import { FormGroup, FormSelect, FormSelectOption } from "@patternfly/react-core";
import * as React from "react";
import { useTranslation } from "react-i18next";

interface NamespaceSelectProps {
  selectedNamespace: string,
  onChange: (updated: string) => void;
}

const NamespaceSelect: React.FC<NamespaceSelectProps> = ({ selectedNamespace, onChange }) => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const [namespaces, setNamespaces] = React.useState([]);

  const namespaceResource = {
    kind: 'Namespace',
    isList: true,
    namespaced: false,
  };

  const [namespaceData, loaded, error] = useK8sWatchResource(namespaceResource);

  React.useEffect(() => {
    if (loaded && !error && Array.isArray(namespaceData)) {
      setNamespaces(namespaceData.map((ns) => ns.metadata.name));
    }
  }, [namespaceData, loaded, error]);

  const handleNamespaceChange = (event) => {
    onChange(event.currentTarget.value);
  };
  return (
    <FormGroup label={t('Namespace')} fieldId="namespace-select" isRequired>
      <FormSelect
id="namespace-select"
        value={selectedNamespace}
        onChange={handleNamespaceChange}
        aria-label={t('Namespace')}    
      >
        <FormSelectOption key="placeholder" value="" label={t('Select a Namespace')} isPlaceholder />
        {namespaces.map((namespace, index) => (
          <FormSelectOption key={index} value={namespace} label={namespace}></FormSelectOption>
        ))}
      </FormSelect>
    </FormGroup>
  );
};

export default NamespaceSelect;
