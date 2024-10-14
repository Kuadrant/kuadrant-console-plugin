import * as React from 'react';

import { Button, FormGroup, FormSelect, FormSelectOption, TextInput } from '@patternfly/react-core';
import { LoadBalancing, MatchExpression, WeightedCustom } from './types';
import { useTranslation } from 'react-i18next';

interface LoadBalancingProps {
  loadBalancing: LoadBalancing;
  onChange: (updated: LoadBalancing) => void;
}

const LoadBalancingField: React.FC<LoadBalancingProps> = ({ loadBalancing, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const operatorOptions = ['In', 'NotIn', 'Exists', 'DoesNotExist'];
  const [customWeights, setCustomWeights] = React.useState<WeightedCustom[]>(loadBalancing.weighted.custom || []);

  const updateCustomWeights = (updatedWeights: WeightedCustom[]) => {
    setCustomWeights(updatedWeights);
    onChange({
      ...loadBalancing,
      weighted: { ...loadBalancing.weighted, custom: updatedWeights },
    });
  };

  const addCustomSelector = () => {
    const updatedWeights: WeightedCustom[] = [
      ...customWeights,
      {
        selector: {
          matchExpressions: [],
          matchLabels: [],
        },
        weight: null,
      },
    ];

    updateCustomWeights(updatedWeights);
  };

  const removeCustomSelector = (index: number) => {
    const updatedWeights = customWeights.filter((_, i) => i !== index);
    updateCustomWeights(updatedWeights);
  };

  const addMatchLabel = (index: number) => {
    const updatedCustoms = [...customWeights];
    const defaultKey = `key-${Object.keys(updatedCustoms[index].selector.matchLabels || []).length}`;

    updatedCustoms[index].selector.matchLabels = [
      ...(updatedCustoms[index].selector.matchLabels || []),
      {key: defaultKey, value: 'value'},
    ];

    updateCustomWeights(updatedCustoms);
  };

  const removeMatchLabel = (index: number, labelIndex: number) => {
    const updatedCustoms = [...customWeights];
    updatedCustoms[index].selector.matchLabels.splice(labelIndex, 1);
    updateCustomWeights(updatedCustoms);
  };

  const updateMatchLabel = (index: number, labelIndex: number, newKey: string, newValue: string) => {
    const updatedCustoms = [...customWeights];
    updatedCustoms[index].selector.matchLabels[labelIndex] = { key: newKey, value: newValue };
    updateCustomWeights(updatedCustoms);
  };

  const updateMatchExpression = (index: number, expIndex: number, field: keyof MatchExpression, value: any) => {
    const updatedCustoms = [...customWeights];
    const matchExpressions = updatedCustoms[index].selector.matchExpressions || [];
    matchExpressions[expIndex] = { ...matchExpressions[expIndex], [field]: value };

    // If the operator is 'Exists' or 'DoesNotExist', remove the 'values' field
    if (field === 'operator' && (value === 'Exists' || value === 'DoesNotExist')) {
      delete matchExpressions[expIndex].values; // Remove values if the operator does not need it
    }

    updatedCustoms[index].selector.matchExpressions = matchExpressions;
    updateCustomWeights(updatedCustoms);
  };

  const addMatchExpression = (index: number) => {
    const updatedCustoms = [...customWeights];

    const newExpression: MatchExpression = {
      key: '',
      operator: 'In', // Default to 'In', can be changed by the user
      values: [''],
    };

    updatedCustoms[index].selector.matchExpressions = [
      ...(updatedCustoms[index].selector.matchExpressions || []),
      newExpression,
    ];

    updateCustomWeights(updatedCustoms);
  };

  const removeMatchExpression = (index: number, expIndex: number) => {
    const updatedCustoms = [...customWeights];
    if (updatedCustoms[index].selector.matchExpressions) {
      delete updatedCustoms[index].selector.matchExpressions[expIndex];
    }
    updateCustomWeights(updatedCustoms);
  };

  const updateWeight = (index: number, value: number) => {
    const updatedCustoms = [...customWeights];
    updatedCustoms[index].weight = value;
    updateCustomWeights(updatedCustoms);
  };

  const addValue = (index: number, expIndex: number) => {
    const updatedCustoms = [...customWeights];
    updatedCustoms[index].selector.matchExpressions![expIndex].values = [
      ...(updatedCustoms[index].selector.matchExpressions![expIndex].values || []),
      ''
    ];
    updateCustomWeights(updatedCustoms);
  };
  const removeValue = (index: number, expIndex: number, valueIndex: number) => {
    const updatedCustoms = [...customWeights];
    updatedCustoms[index].selector.matchExpressions![expIndex].values!.splice(valueIndex, 1);
    updateCustomWeights(updatedCustoms);
  };

  const updateMatchExpressionValue = (index: number, expIndex: number, valueIndex: number, newValue: string) => {
    const updatedCustoms = [...customWeights];
    updatedCustoms[index].selector.matchExpressions![expIndex].values![valueIndex] = newValue;
    updateCustomWeights(updatedCustoms);
  };

  return (
    <>
      <FormGroup label={t('Default Geo')} isRequired fieldId="default-geo">
        <TextInput
          id="default-geo"
          value={loadBalancing.geo.defaultGeo}
          onChange={(event) =>
            onChange({ ...loadBalancing, geo: { ...loadBalancing.geo, defaultGeo: event.currentTarget.value } })
          }
          isRequired
        />
      </FormGroup>

      <FormGroup label={t('Default Weight')} isRequired fieldId="default-weight">
        <TextInput
          id="default-weight"
          type="number"
          value={loadBalancing.weighted.defaultWeight}
          onChange={(event) =>
            onChange({
              ...loadBalancing,
              weighted: { ...loadBalancing.weighted, defaultWeight: Number(event.currentTarget.value) },
            })
          }
          isRequired
        />
      </FormGroup>

      <FormGroup label={t('Custom Weight Selectors')} fieldId="custom-weights">
        {customWeights.map((custom, index) => (
          <div key={index} style={{ marginBottom: '16px', border: '1px solid #ccc', padding: '16px' }}>
            <h3>Custom Selector {index + 1}</h3>

            {/* Weight */}
            <FormGroup label="Weight" isRequired fieldId={`weight-${index}`}>
              <TextInput
                id={`weight-${index}`}
                type="number"
                value={custom.weight}
                onChange={(event) => updateWeight(index, Number(event.currentTarget.value))}
                isRequired
              />
            </FormGroup>

            {/* Match Labels */}
            {custom.selector.matchLabels?.map((label, labelIndex) => (
              <div key={`${index}-${labelIndex}`} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                {/* Key Input */}
                <TextInput
                  value={label.key}
                  onChange={(event) => updateMatchLabel(index, labelIndex, event.currentTarget.value, label.value)}
                  placeholder="Key"
                />
                {/* Value Input */}
                <TextInput
                  value={label.value}
                  onChange={(event) => updateMatchLabel(index, labelIndex, label.key, event.currentTarget.value)}
                  placeholder="Value"
                />
                <Button variant="danger" onClick={() => removeMatchLabel(index, labelIndex)}>
                  {t('Remove Match Label')}
                </Button>
              </div>
            ))}

            {/* Match Expressions */}
            {custom.selector.matchExpressions?.map((expression, expIndex) => {

              return (
                <div key={expIndex} style={{ marginBottom: '8px' }}>
                  <FormGroup label={t('Expression Key')} fieldId={`key-${index}-${expIndex}`}>
                    <TextInput
                      id={`key-${index}-${expIndex}`}
                      value={expression.key}
                      onChange={(event) => updateMatchExpression(index, expIndex, 'key', event.currentTarget.value)}
                    />
                  </FormGroup>

                  <FormGroup label={t('Expression Operator')} fieldId={`operator-${index}-${expIndex}`}>
                    <FormSelect
                      id={`operator-${index}-${expIndex}`}
                      value={expression.operator}
                      onChange={(event) => {
                        updateMatchExpression(index, expIndex, 'operator', event.currentTarget.value);
                      }}
                    >
                      {operatorOptions.map((opt) => (
                        <FormSelectOption key={opt} value={opt} label={opt} />
                      ))}
                    </FormSelect>
                  </FormGroup>
                  {/* Values Input (Always show one empty value for "In" and "NotIn") */}
                  {(expression.operator === 'In' || expression.operator === 'NotIn') && (
                    <FormGroup label={t('Expression Values')} fieldId={`values-${index}-${expIndex}`}>
                      {expression.values?.map((value, valueIndex) => (
                        <div key={valueIndex} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                          <TextInput
                            id={`value-${index}-${expIndex}-${valueIndex}`}
                            value={value}
                            onChange={(event) =>
                              updateMatchExpressionValue(index, expIndex, valueIndex, event.currentTarget.value)
                            }
                          />
                          <Button
                            variant="danger"
                            onClick={() => removeValue(index, expIndex, valueIndex)}
                            style={{ marginLeft: '8px' }}
                          >
                            {t('Remove Value')}
                          </Button>
                        </div>
                      ))}

                      <Button variant="primary" onClick={() => addValue(index, expIndex)}>
                        {t('Add Value')}
                      </Button>
                    </FormGroup>
                  )}
                  <Button variant="danger" onClick={() => removeMatchExpression(index, expIndex)}>
                    {t('Remove Match Expression')}
                  </Button>
                </div>
              );
            })}

            <Button variant="secondary" onClick={() => addMatchLabel(index)}>
              {t('Add Match Label')}
            </Button>
            <Button variant="secondary" onClick={() => addMatchExpression(index)}>
              {t('Add Match Expression')}
            </Button>

            <Button variant="danger" onClick={() => removeCustomSelector(index)}>
              {t('Remove Custom Selector')}
            </Button>
          </div>
        ))}

        <Button variant="primary" onClick={addCustomSelector}>
          {t('Add Custom Weight Selector')}
        </Button>
      </FormGroup>
    </>
  );
};

export default LoadBalancingField;