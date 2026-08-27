import * as React from 'react';
import {
  FormGroup,
  Form,
  Button,
  FormSelect,
  FormSelectOption,
  TextInput,
  ButtonVariant,
  Tabs,
  Tab,
  TabTitleText,
  TabContent,
  TabContentBody,
  ExpandableSection,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Wizard,
  WizardStep,
  WizardHeader,
  ValidatedOptions,
} from '@patternfly/react-core';
import { PlusCircleIcon, MinusCircleIcon } from '@patternfly/react-icons';
import { HTTPRouteMatch, HTTPRouteHeader, HTTPRouteQueryParam } from './types';
import FilterActions from './filters/FilterActions';
import { HTTPRouteFilter } from './filters/filterTypes';
import { validateFiltersStep, getFilterSummary } from './filters/filterUtils';
import { formatMatchesForDisplay } from './matchUtils';
import { validateRequired, validateK8sName, validatePort } from '../../utils/validation';

interface HTTPRouteRuleWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  currentRule: {
    id: string;
    matches: HTTPRouteMatch[];
    filters: HTTPRouteFilter[];
    serviceName: string;
    servicePort: number;
  };
  setCurrentRule: (rule: {
    id: string;
    matches: HTTPRouteMatch[];
    filters: HTTPRouteFilter[];
    serviceName: string;
    servicePort: number;
  }) => void;
  editingRuleIndex: number | null;
  t: (key: string) => string;
}

const validateMatchesStep = (currentRule: { matches: HTTPRouteMatch[] }): boolean => {
  if (currentRule.matches.length === 0) {
    return true;
  }
  return currentRule.matches.every((match) => !!match.pathType && !!match.method);
};

export const HTTPRouteRuleWizard: React.FC<HTTPRouteRuleWizardProps> = ({
  isOpen,
  onClose,
  onSave,
  currentRule,
  setCurrentRule,
  editingRuleIndex,
  t,
}) => {
  const [activeMatchTab, setActiveMatchTab] = React.useState(0);
  const [isMatchesValid, setIsMatchesValid] = React.useState(true);
  const [isFiltersValid, setIsFiltersValid] = React.useState(true);
  const [isBackendValid, setIsBackendValid] = React.useState(false);

  // Validation state
  const [ruleIdError, setRuleIdError] = React.useState<string | null>(null);
  const [ruleIdTouched, setRuleIdTouched] = React.useState(false);
  const [serviceNameError, setServiceNameError] = React.useState<string | null>(null);
  const [serviceNameTouched, setServiceNameTouched] = React.useState(false);
  const [servicePortError, setServicePortError] = React.useState<string | null>(null);
  const [servicePortTouched, setServicePortTouched] = React.useState(false);

  // Validation functions
  const validateRuleId = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateServiceName = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateServicePort = React.useCallback(
    (value: number) => {
      const formatError = validatePort(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  React.useEffect(() => {
    setIsMatchesValid(validateMatchesStep(currentRule));
  }, [currentRule.matches]);

  React.useEffect(() => {
    setIsFiltersValid(validateFiltersStep(currentRule.filters || []));
  }, [currentRule.filters]);

  React.useEffect(() => {
    setIsBackendValid(
      validateRuleId(currentRule.id) === null &&
        validateServiceName(currentRule.serviceName) === null &&
        validateServicePort(currentRule.servicePort) === null,
    );
  }, [
    currentRule.id,
    currentRule.serviceName,
    currentRule.servicePort,
    validateRuleId,
    validateServiceName,
    validateServicePort,
  ]);

  // Matches handling functions
  const handleAddMatch = () => {
    const newMatch: HTTPRouteMatch = {
      id: `match-${Date.now().toString(36)}`,
      pathType: '',
      pathValue: '/',
      method: '',
      headers: [],
      queryParams: [],
    };

    const updatedMatches = [...currentRule.matches, newMatch];
    setCurrentRule({
      ...currentRule,
      matches: updatedMatches,
    });

    // Switch to a new tab
    setActiveMatchTab(updatedMatches.length - 1);
  };

  const handleMatchTabSelect = (
    _event: React.MouseEvent<HTMLElement> | React.KeyboardEvent | unknown,
    tabIndex: number,
  ) => {
    setActiveMatchTab(tabIndex);
  };

  const handleRemoveMatch = (matchIndex: number) => {
    const updatedMatches = currentRule.matches.filter((_, i) => i !== matchIndex);
    setCurrentRule({
      ...currentRule,
      matches: updatedMatches,
    });
    // Adjust the active tab
    if (activeMatchTab >= updatedMatches.length && updatedMatches.length > 0) {
      setActiveMatchTab(updatedMatches.length - 1);
    } else if (updatedMatches.length === 0) {
      setActiveMatchTab(0);
    }
  };

  const handleAddHeader = (matchIndex: number) => {
    const newHeader: HTTPRouteHeader = {
      id: `header-${Date.now().toString(36)}`,
      type: 'Exact',
      name: '',
      value: '',
    };

    const updatedMatches = [...currentRule.matches];
    updatedMatches[matchIndex] = {
      ...updatedMatches[matchIndex],
      headers: [...(updatedMatches[matchIndex].headers || []), newHeader],
    };

    setCurrentRule({
      ...currentRule,
      matches: updatedMatches,
    });
  };

  const handleAddQueryParam = (matchIndex: number) => {
    const newQueryParam: HTTPRouteQueryParam = {
      id: `queryparam-${Date.now().toString(36)}`,
      type: 'Exact',
      name: '',
      value: '',
    };

    const updatedMatches = [...currentRule.matches];
    updatedMatches[matchIndex] = {
      ...updatedMatches[matchIndex],
      queryParams: [...(updatedMatches[matchIndex].queryParams || []), newQueryParam],
    };

    setCurrentRule({
      ...currentRule,
      matches: updatedMatches,
    });
  };

  const handleQueryParamChange = (
    matchIndex: number,
    queryParamId: string,
    field: keyof HTTPRouteQueryParam,
    value: string,
  ) => {
    const updatedMatches = [...currentRule.matches];
    updatedMatches[matchIndex] = {
      ...updatedMatches[matchIndex],
      queryParams: (updatedMatches[matchIndex].queryParams || []).map(
        (queryParam: HTTPRouteQueryParam) =>
          queryParam.id === queryParamId ? { ...queryParam, [field]: value } : queryParam,
      ),
    };

    setCurrentRule({
      ...currentRule,
      matches: updatedMatches,
    });
  };

  const handleRemoveQueryParam = (matchIndex: number, queryParamId: string) => {
    const updatedMatches = [...currentRule.matches];
    updatedMatches[matchIndex] = {
      ...updatedMatches[matchIndex],
      queryParams: (updatedMatches[matchIndex].queryParams || []).filter(
        (queryParam: HTTPRouteQueryParam) => queryParam.id !== queryParamId,
      ),
    };

    setCurrentRule({
      ...currentRule,
      matches: updatedMatches,
    });
  };

  const handleHeaderChange = (
    matchIndex: number,
    headerId: string,
    field: keyof HTTPRouteHeader,
    value: string,
  ) => {
    const updatedMatches = [...currentRule.matches];
    updatedMatches[matchIndex] = {
      ...updatedMatches[matchIndex],
      headers: (updatedMatches[matchIndex].headers || []).map((header: HTTPRouteHeader) =>
        header.id === headerId ? { ...header, [field]: value } : header,
      ),
    };

    setCurrentRule({
      ...currentRule,
      matches: updatedMatches,
    });
  };

  const handleRemoveHeader = (matchIndex: number, headerId: string) => {
    const updatedMatches = [...currentRule.matches];
    updatedMatches[matchIndex] = {
      ...updatedMatches[matchIndex],
      headers: (updatedMatches[matchIndex].headers || []).filter(
        (header: HTTPRouteHeader) => header.id !== headerId,
      ),
    };

    setCurrentRule({
      ...currentRule,
      matches: updatedMatches,
    });
  };

  const ruleWizardSteps = [
    {
      name: t('Matches'),
      nextButtonText: t('Next'),
      canJumpTo: validateMatchesStep(currentRule),
      enableNext: validateMatchesStep(currentRule),
      form: (
        <Form>
          {/* If there are no matches, we show an empty state */}
          {currentRule.matches.length === 0 ? (
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ marginBottom: '16px', fontSize: '24px' }}>{t('Matches')}</h1>
              <p style={{ marginBottom: '16px', color: 'var(--pf-v6-global--Color--200)' }}>
                {t(
                  'Defines the criteria for a request to match this rule. If multiple matches are specified, they are OR ed. If omitted, this rule matches all requests. Multiple Matches in one Rule share all BackendRefs.',
                )}
              </p>
              <Button variant="link" icon={<PlusCircleIcon />} onClick={handleAddMatch}>
                {t('Add match')}
              </Button>
            </div>
          ) : (
            // If there are matches - show tabs
            <div>
              <div style={{ marginBottom: '10px' }}>
                <h1 style={{ marginBottom: '16px', fontSize: '24px' }}>{t('Matches')}</h1>
                <p style={{ marginBottom: '10px', color: 'var(--pf-v6-global--Color--200)' }}>
                  {t(
                    'Defines the criteria for a request to match this rule. If multiple matches are specified, they are OR ed. If omitted, this rule matches all requests.',
                  )}
                </p>
              </div>

              <Tabs
                activeKey={activeMatchTab}
                onSelect={handleMatchTabSelect}
                onAdd={handleAddMatch}
              >
                {currentRule.matches.map((match, index) => (
                  <Tab
                    key={match.id}
                    eventKey={index}
                    title={
                      <span
                        title={`${match.pathType || 'empty'} | ${match.pathValue || 'empty'} | ${
                          match.method || 'empty'
                        }`}
                      >
                        <TabTitleText>Match-{index + 1}</TabTitleText>
                      </span>
                    }
                    tabContentId={`match-content-${index}`}
                  />
                ))}
              </Tabs>

              {/* Tab Contents */}
              {currentRule.matches.map((match, index) => (
                <TabContent
                  key={match.id}
                  eventKey={index}
                  id={`match-content-${index}`}
                  hidden={activeMatchTab !== index}
                >
                  <TabContentBody style={{ padding: '16px 0' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            marginBottom: '16px',
                          }}
                        >
                          <Button
                            variant="secondary"
                            onClick={() => handleRemoveMatch(index)}
                            aria-label={t('Delete match')}
                            title={t('Delete it permanently')}
                          >
                            {t('Delete')}
                          </Button>
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '16px',
                            marginBottom: '16px',
                          }}
                        >
                          <FormGroup
                            label={t('Path type')}
                            isRequired
                            fieldId={`path-type-${index}`}
                          >
                            <FormSelect
                              id={`path-type-${index}`}
                              value={match.pathType}
                              onChange={(_, value) => {
                                const updatedMatches = [...currentRule.matches];
                                updatedMatches[index] = {
                                  ...match,
                                  pathType: value as HTTPRouteMatch['pathType'],
                                };
                                setCurrentRule({ ...currentRule, matches: updatedMatches });
                              }}
                              aria-label={t('Select path type')}
                            >
                              <FormSelectOption value="" label={t('Select...')} />
                              <FormSelectOption value="PathPrefix" label="PathPrefix" />
                              <FormSelectOption value="Exact" label="Exact" />
                              <FormSelectOption
                                value="RegularExpression"
                                label="RegularExpression"
                              />
                            </FormSelect>
                          </FormGroup>

                          <FormGroup label={t('Path value')} fieldId={`path-value-${index}`}>
                            <TextInput
                              id={`path-value-${index}`}
                              value={match.pathValue}
                              onChange={(_, value) => {
                                let newValue = value;
                                if (match.pathType !== 'RegularExpression') {
                                  newValue = '/' + value.replace(/^\/+/, '');
                                }

                                const updatedMatches = [...currentRule.matches];
                                updatedMatches[index] = { ...match, pathValue: newValue };
                                setCurrentRule({ ...currentRule, matches: updatedMatches });
                              }}
                              placeholder={
                                match.pathType === 'RegularExpression' ? '' : '/products'
                              }
                            />
                          </FormGroup>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                          <FormGroup
                            label={t('HTTP method')}
                            isRequired
                            fieldId={`http-method-${index}`}
                          >
                            <FormSelect
                              id={`http-method-${index}`}
                              value={match.method}
                              onChange={(_, value) => {
                                const updatedMatches = [...currentRule.matches];
                                updatedMatches[index] = {
                                  ...match,
                                  method: value as HTTPRouteMatch['method'],
                                };
                                setCurrentRule({ ...currentRule, matches: updatedMatches });
                              }}
                              aria-label={t('Select HTTP method')}
                            >
                              <FormSelectOption value="" label={t('Select...')} />
                              <FormSelectOption value="GET" label="GET" />
                              <FormSelectOption value="HEAD" label="HEAD" />
                              <FormSelectOption value="POST" label="POST" />
                              <FormSelectOption value="PUT" label="PUT" />
                              <FormSelectOption value="DELETE" label="DELETE" />
                              <FormSelectOption value="CONNECT" label="CONNECT" />
                              <FormSelectOption value="OPTIONS" label="OPTIONS" />
                              <FormSelectOption value="TRACE" label="TRACE" />
                              <FormSelectOption value="PATCH" label="PATCH" />
                            </FormSelect>
                          </FormGroup>
                        </div>
                      </div>
                    </div>

                    {/* Headers Section */}
                    <ExpandableSection
                      toggleText={(() => {
                        const completedHeaders = (match.headers || []).filter(
                          (h: HTTPRouteHeader) =>
                            h.name && h.value && h.name.trim() !== '' && h.value.trim() !== '',
                        );
                        return completedHeaders.length > 0
                          ? `${t('Headers')} (${completedHeaders.length})`
                          : t('Headers');
                      })()}
                      onToggle={(_, isExpanded) => {
                        if (isExpanded && (!match.headers || match.headers.length === 0)) {
                          handleAddHeader(index);
                        }
                      }}
                      style={{ marginBottom: '13px' }}
                      className="pf-v6-u-mt-md"
                    >
                      {(match.headers || []).map((header: HTTPRouteHeader) => (
                        <div
                          key={header.id}
                          className="pf-v6-c-form__group-control"
                          style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}
                        >
                          <FormSelect
                            value={header.type}
                            onChange={(_, value) =>
                              handleHeaderChange(index, header.id, 'type', value)
                            }
                            aria-label={t('Select header type')}
                            style={{ minWidth: '140px' }}
                          >
                            <FormSelectOption value="Exact" label="Exact" />
                            <FormSelectOption value="RegularExpression" label="RegularExpression" />
                          </FormSelect>
                          <TextInput
                            id={`header-name-${header.id}`}
                            type="text"
                            placeholder={t('Header name')}
                            value={header.name}
                            onChange={(_, value) =>
                              handleHeaderChange(index, header.id, 'name', value)
                            }
                          />
                          <TextInput
                            id={`header-value-${header.id}`}
                            type="text"
                            placeholder={t('Header value')}
                            value={header.value}
                            onChange={(_, value) =>
                              handleHeaderChange(index, header.id, 'value', value)
                            }
                          />
                          <Button
                            variant={ButtonVariant.plain}
                            onClick={() => handleRemoveHeader(index, header.id)}
                            aria-label="Remove header"
                          >
                            <MinusCircleIcon />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant={ButtonVariant.link}
                        icon={<PlusCircleIcon />}
                        onClick={() => handleAddHeader(index)}
                        isInline
                      >
                        {t('Add more')}
                      </Button>
                    </ExpandableSection>

                    {/* QueryParams Section */}
                    <ExpandableSection
                      toggleText={(() => {
                        const completedQueryParams = (match.queryParams || []).filter(
                          (q: HTTPRouteQueryParam) =>
                            q.name && q.value && q.name.trim() !== '' && q.value.trim() !== '',
                        );
                        return completedQueryParams.length > 0
                          ? `${t('Query Params')} (${completedQueryParams.length})`
                          : t('Query Params');
                      })()}
                      onToggle={(_, isExpanded) => {
                        if (isExpanded && (!match.queryParams || match.queryParams.length === 0)) {
                          handleAddQueryParam(index);
                        }
                      }}
                      className="pf-v6-u-mt-md"
                    >
                      {(match.queryParams || []).map((queryParam: HTTPRouteQueryParam) => (
                        <div
                          key={queryParam.id}
                          className="pf-v6-c-form__group-control"
                          style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}
                        >
                          <FormSelect
                            value={queryParam.type}
                            onChange={(_, value) =>
                              handleQueryParamChange(index, queryParam.id, 'type', value)
                            }
                            aria-label={t('Select query param type')}
                            style={{ minWidth: '140px' }}
                          >
                            <FormSelectOption value="Exact" label="Exact" />
                            <FormSelectOption value="RegularExpression" label="RegularExpression" />
                          </FormSelect>
                          <TextInput
                            id={`qp-name-${queryParam.id}`}
                            type="text"
                            placeholder={t('Query param name')}
                            value={queryParam.name}
                            onChange={(_, value) =>
                              handleQueryParamChange(index, queryParam.id, 'name', value)
                            }
                          />
                          <TextInput
                            id={`qp-value-${queryParam.id}`}
                            type="text"
                            placeholder={t('Query param value')}
                            value={queryParam.value}
                            onChange={(_, value) =>
                              handleQueryParamChange(index, queryParam.id, 'value', value)
                            }
                          />
                          <Button
                            variant={ButtonVariant.plain}
                            onClick={() => handleRemoveQueryParam(index, queryParam.id)}
                            aria-label="Remove query param"
                          >
                            <MinusCircleIcon />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant={ButtonVariant.link}
                        icon={<PlusCircleIcon />}
                        onClick={() => handleAddQueryParam(index)}
                        isInline
                      >
                        {t('Add more')}
                      </Button>
                    </ExpandableSection>
                  </TabContentBody>
                </TabContent>
              ))}
            </div>
          )}
        </Form>
      ),
    },
    {
      name: t('Filters'),
      nextButtonText: t('Next'),
      form: (
        <FilterActions
          filters={currentRule.filters || []}
          onChange={(filters) => setCurrentRule({ ...currentRule, filters })}
        />
      ),
    },
    {
      name: t('Backend Services'),
      nextButtonText: t('Next'),
      form: (
        <Form>
          <FormGroup label={t('Rule ID')} isRequired fieldId="rule-id">
            <TextInput
              id="rule-id"
              value={currentRule.id}
              onChange={(_, value) => setCurrentRule({ ...currentRule, id: value })}
              onBlur={() => {
                setRuleIdTouched(true);
                setRuleIdError(validateRuleId(currentRule.id));
              }}
              validated={
                ruleIdTouched && ruleIdError ? ValidatedOptions.error : ValidatedOptions.default
              }
              placeholder="rule-abc123"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={ruleIdTouched && ruleIdError ? 'error' : 'default'}>
                  {ruleIdTouched && ruleIdError
                    ? ruleIdError
                    : t('Unique identifier for this rule')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label={t('Service Name')} isRequired fieldId="service-name">
            <TextInput
              id="service-name"
              value={currentRule.serviceName}
              onChange={(_, value) => setCurrentRule({ ...currentRule, serviceName: value })}
              onBlur={() => {
                setServiceNameTouched(true);
                setServiceNameError(validateServiceName(currentRule.serviceName));
              }}
              validated={
                serviceNameTouched && serviceNameError
                  ? ValidatedOptions.error
                  : ValidatedOptions.default
              }
              placeholder="service-a"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem
                  variant={serviceNameTouched && serviceNameError ? 'error' : 'default'}
                >
                  {serviceNameTouched && serviceNameError
                    ? serviceNameError
                    : t('Name of the Kubernetes Service to route traffic to')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label={t('Service Port')} isRequired fieldId="service-port">
            <TextInput
              type="number"
              id="service-port"
              value={currentRule.servicePort.toString()}
              onChange={(_, value) =>
                setCurrentRule({ ...currentRule, servicePort: parseInt(value) || 80 })
              }
              onBlur={() => {
                setServicePortTouched(true);
                setServicePortError(validateServicePort(currentRule.servicePort));
              }}
              validated={
                servicePortTouched && servicePortError
                  ? ValidatedOptions.error
                  : ValidatedOptions.default
              }
              placeholder="80"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem
                  variant={servicePortTouched && servicePortError ? 'error' : 'default'}
                >
                  {servicePortTouched && servicePortError
                    ? servicePortError
                    : t('Port number of the service (1-65535)')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      ),
    },
    {
      name: t('Review'),
      nextButtonText: editingRuleIndex !== null ? t('Save') : t('Create'),
      form: (
        <Form>
          <h1 style={{ marginBottom: '16px', fontSize: '24px' }}>{t('Review')}</h1>
          <p style={{ marginBottom: '16px', color: 'var(--pf-v6-global--Color--200)' }}>
            {t('Review the rule configuration before saving.')}
          </p>

          <FormGroup label={t('Rule ID')} fieldId="review-rule-id">
            <div style={{ padding: '8px 0' }}>
              <strong>{currentRule.id || '—'}</strong>
            </div>
          </FormGroup>

          <FormGroup label={t('Matches')} fieldId="review-matches">
            <div style={{ padding: '8px 0' }}>
              {currentRule.matches.length > 0 ? (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>{currentRule.matches.length}</strong>{' '}
                    {currentRule.matches.length === 1 ? t('match') : t('matches')}
                  </div>
                  <div style={{ color: 'var(--pf-v6-global--Color--200)' }}>
                    {formatMatchesForDisplay(currentRule.matches)}
                  </div>
                </>
              ) : (
                <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>—</span>
              )}
            </div>
          </FormGroup>

          <FormGroup label={t('Filters')} fieldId="review-filters">
            <div style={{ padding: '8px 0' }}>
              {currentRule.filters && currentRule.filters.length > 0 ? (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>{currentRule.filters.length}</strong>{' '}
                    {currentRule.filters.length === 1 ? t('filter') : t('filters')}
                  </div>
                  <div style={{ color: 'var(--pf-v6-global--Color--200)' }}>
                    {currentRule.filters.map((filter, idx) => (
                      <div key={idx}>{getFilterSummary(filter, t)}</div>
                    ))}
                  </div>
                </>
              ) : (
                <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>—</span>
              )}
            </div>
          </FormGroup>

          <FormGroup label={t('Backend')} fieldId="review-backend">
            <div style={{ padding: '8px 0' }}>
              <div>
                <strong>{t('Service Name')}:</strong> {currentRule.serviceName || '—'}
              </div>
              <div>
                <strong>{t('Service Port')}:</strong> {currentRule.servicePort}
              </div>
            </div>
          </FormGroup>
        </Form>
      ),
    },
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <Wizard
      onClose={onClose}
      onSave={onSave}
      height="700px"
      header={
        <WizardHeader
          title={editingRuleIndex !== null ? t('Edit rule') : t('Add rule')}
          titleId="wiz-modal-demo-title"
          description={t('Configure routing rule with matches and backend services')}
          descriptionId="wiz-modal-demo-description"
          closeButtonAriaLabel={t('Close wizard')}
          onClose={onClose}
        />
      }
    >
      {ruleWizardSteps.map((step, index) => (
        <WizardStep
          key={index}
          name={step.name}
          id={`rule-step-${index}`}
          isDisabled={
            (index === 1 && !isMatchesValid) ||
            (index === 2 && (!isMatchesValid || !isFiltersValid)) ||
            (index === 3 && (!isMatchesValid || !isFiltersValid || !isBackendValid))
          }
          footer={{
            nextButtonText: step.nextButtonText,
            ...(index === 0
              ? {
                  isNextDisabled: !isMatchesValid,
                }
              : index === 1
              ? {
                  isNextDisabled: !isFiltersValid,
                }
              : index === 2
              ? {
                  isNextDisabled: !isBackendValid,
                }
              : {}),
          }}
        >
          {step.form}
        </WizardStep>
      ))}
    </Wizard>
  );
};

export default HTTPRouteRuleWizard;
