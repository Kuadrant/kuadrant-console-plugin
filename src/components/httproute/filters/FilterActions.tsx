import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ButtonVariant,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  MenuToggle,
  Radio,
  Select,
  SelectList,
  SelectOption,
  Tab,
  Tabs,
  TabTitleText,
  TextInput,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type {
  FilterType,
  HTTPRouteFilter,
  RequestHeaderModifierFilter,
  ResponseHeaderModifierFilter,
  URLRewriteFilter,
  RequestRedirectFilter,
  RequestMirrorFilter,
  HeaderKV,
} from './filterTypes';
import { getFilterSummary, createDefaultFilter } from './filterUtils';

type FilterActionsProps = {
  filters: HTTPRouteFilter[];
  onChange: (filters: HTTPRouteFilter[]) => void;
};

const FilterActions: React.FC<FilterActionsProps> = ({ filters, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeFilterTab, setActiveFilterTab] = React.useState<number>(0);
  const [isFilterTypeOpen, setIsFilterTypeOpen] = React.useState<boolean>(false);
  const [headerRowsByTab, setHeaderRowsByTab] = React.useState<
    Record<number, Array<{ action: 'Add' | 'Set' | 'Delete'; name: string; value?: string }>>
  >({});

  const activeFilter = ((filters || [])[activeFilterTab] || null) as HTTPRouteFilter | null;
  const isHeaderModifier =
    activeFilter?.type === 'RequestHeaderModifier' ||
    activeFilter?.type === 'ResponseHeaderModifier';

  React.useEffect(() => {
    if (!isHeaderModifier || !activeFilter) return;
    if (headerRowsByTab[activeFilterTab]) return;
    const hm =
      activeFilter.type === 'RequestHeaderModifier'
        ? activeFilter.requestHeaderModifier || {}
        : activeFilter.responseHeaderModifier || {};
    const initRows: Array<{ action: 'Add' | 'Set' | 'Delete'; name: string; value?: string }> = [];
    if (Array.isArray(hm.add)) {
      hm.add.forEach(({ name, value }) => initRows.push({ action: 'Add', name, value }));
    }
    if (Array.isArray(hm.set)) {
      hm.set.forEach(({ name, value }) => initRows.push({ action: 'Set', name, value }));
    }
    if (hm.remove) {
      hm.remove.forEach((entry) =>
        initRows.push({
          action: 'Delete',
          name: typeof entry === 'string' ? entry : entry?.name || '',
        }),
      );
    }
    setHeaderRowsByTab((prev) => ({
      ...prev,
      [activeFilterTab]: initRows.length > 0 ? initRows : [{ action: 'Add', name: '', value: '' }],
    }));
  }, [activeFilterTab, isHeaderModifier, activeFilter?.type]);

  const handleAddFilter = () => {
    const newFilter = createDefaultFilter('RequestHeaderModifier');
    const updated = [...(filters || []), newFilter];
    onChange(updated);
    setActiveFilterTab(updated.length - 1);
  };

  const handleFilterTabSelect = (
    _event: React.MouseEvent<HTMLElement> | React.KeyboardEvent | unknown,
    tabIndex: number,
  ) => {
    setActiveFilterTab(Number(tabIndex));
  };

  const handleRemoveFilter = () => {
    const idx = activeFilterTab;
    const updated = (filters || []).filter((_, i) => i !== idx);
    onChange(updated);
    setHeaderRowsByTab((prev) => {
      const next: typeof prev = {};
      Object.keys(prev).forEach((key) => {
        const i = Number(key);
        if (i < idx) next[i] = prev[i];
        else if (i > idx) next[i - 1] = prev[i];
      });
      return next;
    });
    if (activeFilterTab >= updated.length && updated.length > 0) {
      setActiveFilterTab(updated.length - 1);
    } else if (updated.length === 0) {
      setActiveFilterTab(0);
    }
  };

  const handleFilterChangeAt = (
    index: number,
    updatedPartial:
      | Partial<NonNullable<RequestHeaderModifierFilter['requestHeaderModifier']>>
      | Partial<NonNullable<ResponseHeaderModifierFilter['responseHeaderModifier']>>
      | Partial<NonNullable<URLRewriteFilter['urlRewrite']>>
      | Partial<NonNullable<RequestRedirectFilter['requestRedirect']>>
      | Partial<NonNullable<RequestMirrorFilter['requestMirror']>>
      | undefined,
  ) => {
    const copy = [...(filters || [])];
    const current = copy[index] as HTTPRouteFilter;
    let updated: HTTPRouteFilter = current;
    if (current.type === 'RequestHeaderModifier') {
      updated = {
        ...current,
        requestHeaderModifier: {
          ...(current.requestHeaderModifier || {}),
          ...(updatedPartial || {}),
        },
      } as HTTPRouteFilter;
    } else if (current.type === 'ResponseHeaderModifier') {
      updated = {
        ...current,
        responseHeaderModifier: {
          ...(current.responseHeaderModifier || {}),
          ...(updatedPartial || {}),
        },
      } as HTTPRouteFilter;
    } else if (current.type === 'URLRewrite') {
      updated = {
        ...current,
        urlRewrite: { ...(current.urlRewrite || {}), ...(updatedPartial || {}) },
      } as HTTPRouteFilter;
    } else if (current.type === 'RequestRedirect') {
      updated = {
        ...current,
        requestRedirect: { ...(current.requestRedirect || {}), ...(updatedPartial || {}) },
      } as HTTPRouteFilter;
    } else if (current.type === 'RequestMirror') {
      updated = {
        ...current,
        requestMirror: { ...(current.requestMirror || {}), ...(updatedPartial || {}) },
      } as HTTPRouteFilter;
    }
    copy[index] = updated;
    onChange(copy);
  };

  const handleReplaceFilterType = (index: number, newType: FilterType) => {
    const replaced = createDefaultFilter(newType as HTTPRouteFilter['type']);
    const copy = [...(filters || [])];
    copy[index] = replaced;
    onChange(copy);
    setHeaderRowsByTab((prev) => {
      const next = { ...prev } as typeof prev;
      delete next[index];
      return next;
    });
  };

  const filterTypeOptions = [
    {
      value: 'RequestHeaderModifier',
      label: t('Request Header Modifier'),
      description: t('Add, set, or remove request headers.'),
    },
    {
      value: 'ResponseHeaderModifier',
      label: t('Response Header Modifier'),
      description: t('Add, set, or remove response headers.'),
    },
    {
      value: 'RequestRedirect',
      label: t('Request Redirect'),
      description: t('Redirect the request to a different hostname, path, or port.'),
    },
    {
      value: 'URLRewrite',
      label: t('URL Rewrite'),
      description: t('Rewrite the hostname or path of the request before forwarding.'),
    },
    {
      value: 'RequestMirror',
      label: t('Request Mirror'),
      description: t('Send a copy of the request to a different backend (for traffic shadowing).'),
    },
  ];

  // Helper to render path replacement fields (shared by URLRewrite and RequestRedirect)
  const renderPathFields = (
    pathValue: { type: string; replaceFullPath?: string; replacePrefixMatch?: string } | undefined,
    onTypeChange: (type: 'ReplaceFullPath' | 'ReplacePrefixMatch') => void,
    onValueChange: (value: string) => void,
  ) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <FormGroup label={t('Path replacement type')} fieldId="path-type">
        <FormSelect
          id="path-type"
          value={pathValue?.type || 'ReplaceFullPath'}
          onChange={(_, value) => onTypeChange(value as 'ReplaceFullPath' | 'ReplacePrefixMatch')}
        >
          <FormSelectOption value="ReplaceFullPath" label="ReplaceFullPath" />
          <FormSelectOption value="ReplacePrefixMatch" label="ReplacePrefixMatch" />
        </FormSelect>
      </FormGroup>
      <FormGroup label={t('Path value')} fieldId="path-value">
        <TextInput
          id="path-value"
          value={
            pathValue?.type === 'ReplaceFullPath'
              ? pathValue?.replaceFullPath || ''
              : pathValue?.replacePrefixMatch || ''
          }
          onChange={(_, value) => onValueChange(value)}
          placeholder={'/v2/$1'}
        />
      </FormGroup>
    </div>
  );

  return (
    <Form>
      <FormGroup fieldId="filters-section">
        <Title headingLevel="h3">{t('Filters')}</Title>
        <div style={{ marginBottom: 12 }}>
          {t(
            'A list of actions to perform on a request or response before it is sent to the backend.',
          )}
        </div>
        {(filters?.length ?? 0) === 0 ? (
          <Button
            variant={ButtonVariant.link}
            icon={<PlusCircleIcon />}
            isInline
            onClick={handleAddFilter}
          >
            {t('Add filter')}
          </Button>
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              <Tabs
                activeKey={activeFilterTab}
                onSelect={handleFilterTabSelect}
                onAdd={handleAddFilter}
              >
                {(filters || []).map((filter, idx) => (
                  <Tab
                    key={`${filter.type}-${idx}`}
                    eventKey={idx}
                    title={
                      <Tooltip content={getFilterSummary(filter, t)} position="top">
                        <TabTitleText>{`Filter-${idx + 1}`}</TabTitleText>
                      </Tooltip>
                    }
                  />
                ))}
              </Tabs>
            </div>

            {(filters || [])[activeFilterTab] && (
              <div
                style={{
                  border: '1px solid var(--pf-v6-global--BorderColor--100)',
                  borderRadius: 4,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    columnGap: 8,
                    alignItems: 'start',
                  }}
                >
                  <FormGroup label={t('Filter type')} isRequired fieldId="filter-type">
                    <Select
                      isOpen={isFilterTypeOpen}
                      onOpenChange={(open) => setIsFilterTypeOpen(open)}
                      selected={(filters || [])[activeFilterTab]?.type}
                      onSelect={(_e, value) => {
                        handleReplaceFilterType(activeFilterTab, value as FilterType);
                        setIsFilterTypeOpen(false);
                      }}
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef as React.Ref<HTMLButtonElement>}
                          onClick={() => setIsFilterTypeOpen((v) => !v)}
                          isExpanded={isFilterTypeOpen}
                          style={{ width: '100%', marginTop: 12 }}
                          id="filter-type"
                          aria-label={t('Filter type')}
                        >
                          {(filters || [])[activeFilterTab]?.type || t('Select type')}
                        </MenuToggle>
                      )}
                      shouldFocusFirstItemOnOpen
                      popperProps={{ appendTo: () => document.body }}
                    >
                      <SelectList style={{ maxHeight: 202, overflowY: 'auto' }}>
                        {filterTypeOptions.map((opt) => (
                          <SelectOption
                            key={opt.value}
                            value={opt.value}
                            description={opt.description}
                          >
                            {opt.label}
                          </SelectOption>
                        ))}
                      </SelectList>
                    </Select>
                  </FormGroup>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant={ButtonVariant.secondary} onClick={handleRemoveFilter}>
                      {t('Delete')}
                    </Button>
                  </div>
                </div>

                {(() => {
                  const filter = (filters || [])[activeFilterTab] as HTTPRouteFilter | undefined;
                  if (!filter) return null;

                  if (
                    filter.type === 'RequestHeaderModifier' ||
                    filter.type === 'ResponseHeaderModifier'
                  ) {
                    return (
                      <>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '180px 1fr 1fr 40px',
                            gap: 8,
                            alignItems: 'center',
                            marginTop: 8,
                            marginBottom: 8,
                          }}
                        >
                          <div>
                            <strong>{t('Type')}</strong>
                          </div>
                          <div>
                            <strong>{t('Header name')}</strong>
                          </div>
                          <div>
                            <strong>{t('Value')}</strong>
                          </div>
                          <div />
                        </div>
                        {(() => {
                          const initRows: Array<{
                            action: 'Add' | 'Set' | 'Delete';
                            name: string;
                            value?: string;
                          }> = [];
                          const hm =
                            filter.type === 'RequestHeaderModifier'
                              ? filter.requestHeaderModifier || {}
                              : filter.responseHeaderModifier || {};
                          if (Array.isArray(hm.add)) {
                            (hm.add as HeaderKV[]).forEach(({ name, value }) =>
                              initRows.push({ action: 'Add', name, value }),
                            );
                          }
                          if (Array.isArray(hm.set)) {
                            (hm.set as HeaderKV[]).forEach(({ name, value }) =>
                              initRows.push({ action: 'Set', name, value }),
                            );
                          }
                          if (hm.remove) {
                            hm.remove.forEach((entry) =>
                              initRows.push({
                                action: 'Delete',
                                name: typeof entry === 'string' ? entry : entry?.name || '',
                              }),
                            );
                          }
                          const rows =
                            headerRowsByTab[activeFilterTab] ||
                            (initRows.length > 0
                              ? initRows
                              : [{ action: 'Add', name: '', value: '' }]);

                          const commitRowsToSpec = (
                            all: Array<{
                              action: 'Add' | 'Set' | 'Delete';
                              name: string;
                              value?: string;
                            }>,
                          ) => {
                            const add: Array<{ name: string; value: string }> = [];
                            const set: Array<{ name: string; value: string }> = [];
                            const remove: string[] = [];
                            all.forEach((r) => {
                              const name = (r.name || '').trim();
                              if (!name) return;
                              if (r.action === 'Delete') remove.push(name);
                              if (r.action === 'Add') add.push({ name, value: r.value ?? '' });
                              if (r.action === 'Set') set.push({ name, value: r.value ?? '' });
                            });
                            handleFilterChangeAt(
                              activeFilterTab,
                              filter.type === 'RequestHeaderModifier'
                                ? { add, set, remove }
                                : { add, set, remove },
                            );
                          };

                          return rows.map((op, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '180px 1fr 1fr 40px',
                                gap: 12,
                                alignItems: 'center',
                                marginBottom: 8,
                              }}
                            >
                              <FormSelect
                                id={`hdr-action-${idx}`}
                                value={op.action}
                                onChange={(_, value) => {
                                  const updatedAction = value as 'Add' | 'Set' | 'Delete';
                                  const next = { ...op, action: updatedAction } as {
                                    action: 'Add' | 'Set' | 'Delete';
                                    name: string;
                                    value?: string;
                                  };
                                  if (updatedAction === 'Delete') next.value = '';
                                  const all = rows.map((r, i) => (i === idx ? next : r));
                                  setHeaderRowsByTab((prev) => ({
                                    ...prev,
                                    [activeFilterTab]: all,
                                  }));
                                  commitRowsToSpec(all);
                                }}
                                aria-label={t('Select header action')}
                              >
                                <FormSelectOption value="Add" label={t('Add')} />
                                <FormSelectOption value="Set" label={t('Set')} />
                                <FormSelectOption value="Delete" label={t('Delete')} />
                              </FormSelect>
                              <TextInput
                                id={`hdr-name-${idx}`}
                                value={op.name}
                                onChange={(_, value) => {
                                  const next = { ...op, name: value } as {
                                    action: 'Add' | 'Set' | 'Delete';
                                    name: string;
                                    value?: string;
                                  };
                                  const all = rows.map((r, i) => (i === idx ? next : r));
                                  setHeaderRowsByTab((prev) => ({
                                    ...prev,
                                    [activeFilterTab]: all,
                                  }));
                                  commitRowsToSpec(all);
                                }}
                                placeholder={op.action === 'Add' ? 'x-Request-ID' : 'Content-type'}
                              />
                              {op.action !== 'Delete' ? (
                                <TextInput
                                  id={`hdr-value-${idx}`}
                                  value={op.value}
                                  onChange={(_, value) => {
                                    const next = { ...op, value } as {
                                      action: 'Add' | 'Set' | 'Delete';
                                      name: string;
                                      value?: string;
                                    };
                                    const all = rows.map((r, i) => (i === idx ? next : r));
                                    setHeaderRowsByTab((prev) => ({
                                      ...prev,
                                      [activeFilterTab]: all,
                                    }));
                                    commitRowsToSpec(all);
                                  }}
                                  placeholder={op.action === 'Add' ? '{UUID}' : 'application/json'}
                                />
                              ) : (
                                <div role="presentation" />
                              )}
                              <Button
                                variant={ButtonVariant.plain}
                                aria-label={t('Remove')}
                                onClick={() => {
                                  const all = rows.filter((_, i) => i !== idx);
                                  setHeaderRowsByTab((prev) => ({
                                    ...prev,
                                    [activeFilterTab]: all,
                                  }));
                                  commitRowsToSpec(all);
                                }}
                              >
                                <MinusCircleIcon />
                              </Button>
                            </div>
                          ));
                        })()}
                        <Button
                          variant={ButtonVariant.link}
                          icon={<PlusCircleIcon />}
                          isInline
                          onClick={() => {
                            const rows = (headerRowsByTab[activeFilterTab] || [
                              { action: 'Add' as const, name: '', value: '' },
                            ]) as Array<{
                              action: 'Add' | 'Set' | 'Delete';
                              name: string;
                              value?: string;
                            }>;
                            const all: Array<{
                              action: 'Add' | 'Set' | 'Delete';
                              name: string;
                              value?: string;
                            }> = [...rows, { action: 'Add', name: '', value: '' }];
                            setHeaderRowsByTab(
                              (
                                prev: Record<
                                  number,
                                  Array<{
                                    action: 'Add' | 'Set' | 'Delete';
                                    name: string;
                                    value?: string;
                                  }>
                                >,
                              ) => ({
                                ...prev,
                                [activeFilterTab]: all,
                              }),
                            );
                          }}
                        >
                          {t('Add more')}
                        </Button>
                      </>
                    );
                  }

                  if (filter.type === 'URLRewrite') {
                    return (
                      <>
                        <div style={{ marginTop: 8 }}>
                          <FormGroup label={t('Hostname')} fieldId="url-hostname">
                            <TextInput
                              id="url-hostname"
                              value={filter.urlRewrite?.hostname || ''}
                              onChange={(_, value) =>
                                handleFilterChangeAt(activeFilterTab, { hostname: value })
                              }
                              placeholder={'elsewhere.example'}
                            />
                          </FormGroup>
                        </div>
                        {renderPathFields(
                          filter.urlRewrite?.path,
                          (type) => {
                            const v =
                              filter.urlRewrite?.path?.replaceFullPath ||
                              filter.urlRewrite?.path?.replacePrefixMatch ||
                              '';
                            handleFilterChangeAt(activeFilterTab, {
                              path:
                                type === 'ReplaceFullPath'
                                  ? { type, replaceFullPath: v }
                                  : { type, replacePrefixMatch: v },
                            });
                          },
                          (value) => {
                            const type = filter.urlRewrite?.path?.type || 'ReplaceFullPath';
                            handleFilterChangeAt(
                              activeFilterTab,
                              type === 'ReplaceFullPath'
                                ? { path: { type, replaceFullPath: value } }
                                : { path: { type, replacePrefixMatch: value } },
                            );
                          },
                        )}
                      </>
                    );
                  }

                  if (filter.type === 'RequestRedirect') {
                    const f = filter;
                    return (
                      <>
                        <div style={{ marginTop: 8 }}>
                          <FormGroup label={t('Redirect type')} fieldId="rr-kind">
                            <div style={{ display: 'flex', gap: 16 }}>
                              <Radio
                                id="rr-kind-scheme"
                                name="rr-kind"
                                label={t('Scheme redirect')}
                                isChecked={!f.requestRedirect?.path}
                                onChange={() =>
                                  handleFilterChangeAt(activeFilterTab, { path: undefined })
                                }
                              />
                              <Radio
                                id="rr-kind-path"
                                name="rr-kind"
                                label={t('Path redirect')}
                                isChecked={Boolean(f.requestRedirect?.path)}
                                onChange={() =>
                                  handleFilterChangeAt(activeFilterTab, {
                                    path: { type: 'ReplaceFullPath', replaceFullPath: '' },
                                  })
                                }
                              />
                            </div>
                          </FormGroup>

                          {!f.requestRedirect?.path ? (
                            <FormGroup label={t('Scheme')} fieldId="rr-scheme">
                              <FormSelect
                                id="rr-scheme"
                                value={f.requestRedirect?.scheme || 'https'}
                                onChange={(_, value) =>
                                  handleFilterChangeAt(activeFilterTab, { scheme: value })
                                }
                              >
                                <FormSelectOption value="http" label="http" />
                                <FormSelectOption value="https" label="https" />
                              </FormSelect>
                            </FormGroup>
                          ) : (
                            renderPathFields(
                              f.requestRedirect?.path,
                              (type) => {
                                const v =
                                  f.requestRedirect?.path?.replaceFullPath ||
                                  f.requestRedirect?.path?.replacePrefixMatch ||
                                  '';
                                handleFilterChangeAt(activeFilterTab, {
                                  path:
                                    type === 'ReplaceFullPath'
                                      ? { type, replaceFullPath: v }
                                      : { type, replacePrefixMatch: v },
                                });
                              },
                              (value) => {
                                const type = f.requestRedirect?.path?.type || 'ReplaceFullPath';
                                handleFilterChangeAt(
                                  activeFilterTab,
                                  type === 'ReplaceFullPath'
                                    ? { path: { type, replaceFullPath: value } }
                                    : { path: { type, replacePrefixMatch: value } },
                                );
                              },
                            )
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <FormGroup label={t('Hostname')} fieldId="rr-hostname">
                              <TextInput
                                id="rr-hostname"
                                value={f.requestRedirect?.hostname || ''}
                                onChange={(_, value) =>
                                  handleFilterChangeAt(activeFilterTab, { hostname: value })
                                }
                                placeholder={t('example.com')}
                              />
                            </FormGroup>
                            <FormGroup label={t('Port')} fieldId="rr-port">
                              <TextInput
                                id="rr-port"
                                value={
                                  (f.requestRedirect?.port as number | undefined)?.toString?.() ||
                                  ''
                                }
                                onChange={(_, value) => {
                                  const parsed = parseInt(value, 10);
                                  const portNum = value && !isNaN(parsed) ? parsed : undefined;
                                  handleFilterChangeAt(activeFilterTab, { port: portNum });
                                }}
                                placeholder={'8080'}
                              />
                            </FormGroup>
                            <FormGroup label={t('Status code')} fieldId="rr-status">
                              <FormSelect
                                id="rr-status"
                                value={
                                  (
                                    f.requestRedirect?.statusCode as number | undefined
                                  )?.toString?.() || '302'
                                }
                                onChange={(_, value) =>
                                  handleFilterChangeAt(activeFilterTab, {
                                    statusCode: Number(value),
                                  })
                                }
                              >
                                <FormSelectOption value="301" label="301" />
                                <FormSelectOption value="302" label="302" />
                              </FormSelect>
                            </FormGroup>
                          </div>
                        </div>
                      </>
                    );
                  }

                  if (filter.type === 'RequestMirror') {
                    const f = filter;
                    return (
                      <>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 8,
                            marginTop: 8,
                          }}
                        >
                          <FormGroup label={t('Mirror backend name')} fieldId="rm-name">
                            <TextInput
                              id="rm-name"
                              value={f.requestMirror?.backendRef?.name || ''}
                              onChange={(_, value) =>
                                handleFilterChangeAt(activeFilterTab, {
                                  backendRef: {
                                    ...(f.requestMirror?.backendRef || {}),
                                    name: value,
                                  },
                                })
                              }
                              placeholder={'foo-v2'}
                            />
                          </FormGroup>
                          <FormGroup label={t('Port')} fieldId="rm-port">
                            <TextInput
                              type="number"
                              id="rm-port"
                              value={
                                (
                                  f.requestMirror?.backendRef?.port as number | undefined
                                )?.toString?.() || ''
                              }
                              onChange={(_, value) => {
                                const parsed = parseInt(value, 10);
                                const portNum = value && !isNaN(parsed) ? parsed : undefined;
                                handleFilterChangeAt(activeFilterTab, {
                                  backendRef: {
                                    ...(f.requestMirror?.backendRef || {}),
                                    name: f.requestMirror?.backendRef?.name || '',
                                    port: portNum,
                                  },
                                });
                              }}
                              placeholder={'8080'}
                            />
                          </FormGroup>
                        </div>
                      </>
                    );
                  }

                  return null;
                })()}
              </div>
            )}
          </>
        )}
      </FormGroup>
    </Form>
  );
};

export default FilterActions;
