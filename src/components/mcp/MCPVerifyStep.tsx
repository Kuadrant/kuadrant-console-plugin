import * as React from 'react';
import { Title, Content, Spinner, Alert, Button, Flex, FlexItem } from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationCircleIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import {
  K8sResourceCommon,
  k8sCreate,
  k8sDelete,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate } from 'react-router';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { Condition } from '../../utils/resources';

type CheckStatus = 'pending' | 'in-progress' | 'success' | 'error';

interface VerifyCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message?: string;
}

export interface ResourceCreateItem {
  type: 'create';
  id: string;
  label: string;
  resource: K8sResourceCommon;
  successMessage: string;
  allowAlreadyExists?: boolean;
}

export interface InfoCheckItem {
  type: 'info';
  id: string;
  label: string;
  message: string;
}

export type VerifyStepItem = ResourceCreateItem | InfoCheckItem;

export interface WatchResourceConfig {
  gvk: { group: string; version: string; kind: string };
  name: string;
  namespace: string;
}

interface WatchedResource extends K8sResourceCommon {
  status?: {
    conditions?: Condition[];
  };
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  const response = error as {
    message?: string;
    reason?: string;
    json?: {
      message?: string;
      reason?: string;
      details?: { causes?: { message?: string }[] };
    };
  };
  return (
    response?.json?.message ||
    response?.json?.details?.causes?.find((cause) => cause.message)?.message ||
    response?.message ||
    response?.json?.reason ||
    response?.reason ||
    'The resource could not be created or verified.'
  );
};

interface MCPVerifyStepProps {
  items: VerifyStepItem[];
  watchResource: WatchResourceConfig;
  selectedNamespace: string;
  title?: string;
  description?: string;
  watchLabel?: string;
  watchSuccessMessage?: string;
  rollbackOnFailure?: boolean;
  onAllCreated?: () => void;
  showOverviewLink?: boolean;
}

const MCPVerifyStep: React.FC<MCPVerifyStepProps> = ({
  items,
  watchResource,
  selectedNamespace,
  title,
  description,
  watchLabel,
  watchSuccessMessage,
  rollbackOnFailure = false,
  onAllCreated,
  showOverviewLink = false,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();

  const [checks, setChecks] = React.useState<VerifyCheck[]>([]);
  const creationStartedRef = React.useRef(false);
  const [watchStarted, setWatchStarted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const watchReadyId = 'watch-ready';

  const [watchedData, watchedLoaded, watchedError] = useK8sWatchResource<WatchedResource>(
    watchStarted
      ? {
          groupVersionKind: watchResource.gvk,
          name: watchResource.name,
          namespace: watchResource.namespace,
          isList: false,
        }
      : null,
  );

  React.useEffect(() => {
    if (!watchStarted || !watchedLoaded) return;
    if (watchedError) {
      updateCheckById(watchReadyId, 'error', getErrorMessage(watchedError));
      return;
    }
    if (!watchedData) {
      updateCheckById(watchReadyId, 'error', 'The created resource could not be found.');
      return;
    }

    const conditions = watchedData.status?.conditions || [];
    const readyCondition = conditions.find((c) => c.type === 'Ready');

    if (readyCondition?.status === 'True') {
      updateCheckById(
        watchReadyId,
        'success',
        watchSuccessMessage || t('Resource is running and healthy'),
      );
    } else if (readyCondition?.status === 'False') {
      updateCheckById(
        watchReadyId,
        'error',
        readyCondition.message || readyCondition.reason || t('Resource is not ready'),
      );
    }
  }, [watchedData, watchedLoaded, watchedError, watchStarted, watchSuccessMessage, t]);

  const updateCheckById = React.useCallback((id: string, status: CheckStatus, message?: string) => {
    setChecks((prev) =>
      prev.map((check) => (check.id === id ? { ...check, status, message } : check)),
    );
  }, []);

  const createResources = React.useCallback(async () => {
    if (creationStartedRef.current) return;
    creationStartedRef.current = true;
    setError(null);

    const initialChecks: VerifyCheck[] = items.map((item) =>
      item.type === 'info'
        ? {
            id: item.id,
            label: item.label,
            status: 'success' as CheckStatus,
            message: item.message,
          }
        : { id: item.id, label: item.label, status: 'pending' as CheckStatus },
    );

    initialChecks.push({
      id: watchReadyId,
      label: watchLabel || t('Resource is ready'),
      status: 'pending',
    });

    setChecks(initialChecks);

    const createItems = items.filter((item): item is ResourceCreateItem => item.type === 'create');
    const createdResources: K8sResourceCommon[] = [];

    try {
      for (const item of createItems) {
        updateCheckById(item.id, 'in-progress');
        try {
          const model = getModelFromResource(item.resource);
          await k8sCreate({ model, data: item.resource });
          createdResources.push(item.resource);
          updateCheckById(item.id, 'success', item.successMessage);
        } catch (err: unknown) {
          const errStatus =
            (err as { code?: number })?.code ?? (err as { json?: { code?: number } })?.json?.code;
          if (errStatus === 409 && item.allowAlreadyExists !== false) {
            updateCheckById(item.id, 'success', t('Already exists'));
          } else {
            if (rollbackOnFailure) {
              const rollbackFailures: string[] = [];
              for (const created of [...createdResources].reverse()) {
                try {
                  await k8sDelete({
                    model: getModelFromResource(created),
                    resource: created,
                  });
                } catch (rollbackErr) {
                  console.error('Failed to roll back resource:', rollbackErr);
                  rollbackFailures.push(created.kind || 'resource');
                }
              }
              if (rollbackFailures.length) {
                throw new Error(
                  `${String(err instanceof Error ? err.message : err)} (${t(
                    'Rollback failed for',
                  )}: ${rollbackFailures.join(', ')})`,
                );
              }
            }
            throw err;
          }
        }
      }

      updateCheckById(watchReadyId, 'in-progress', t('Waiting for controller to reconcile...'));
      setWatchStarted(true);
      onAllCreated?.();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);

      setChecks((prev) =>
        prev.map((check) =>
          check.status === 'in-progress'
            ? { ...check, status: 'error' as CheckStatus, message }
            : check,
        ),
      );
    }
  }, [items, watchLabel, rollbackOnFailure, onAllCreated, updateCheckById, t]);

  React.useEffect(() => {
    createResources();
  }, [createResources]);

  const renderCheckIcon = (status: CheckStatus) => {
    switch (status) {
      case 'pending':
        return <Spinner size="md" aria-label={t('Pending')} />;
      case 'in-progress':
        return <Spinner size="md" aria-label={t('In progress')} />;
      case 'success':
        return (
          <CheckCircleIcon
            color="var(--pf-v6-global--success-color--100)"
            aria-label={t('Success')}
          />
        );
      case 'error':
        return (
          <ExclamationCircleIcon
            color="var(--pf-v6-global--danger-color--100)"
            aria-label={t('Error')}
          />
        );
    }
  };

  return (
    <>
      {title && (
        <Title headingLevel="h2" style={{ marginBottom: '16px' }}>
          {title}
        </Title>
      )}
      {description && (
        <Content component="p" style={{ marginBottom: '24px' }}>
          {description}
        </Content>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {checks.map((check) => (
          <Flex
            key={check.id}
            alignItems={{ default: 'alignItemsCenter' }}
            gap={{ default: 'gapMd' }}
          >
            <FlexItem style={{ width: '24px', textAlign: 'center' }}>
              {renderCheckIcon(check.status)}
            </FlexItem>
            <FlexItem>
              <strong>{check.label}</strong>
              {check.message && (
                <Content component="p" style={{ margin: 0, fontSize: '0.875rem' }}>
                  {check.message}
                </Content>
              )}
            </FlexItem>
          </Flex>
        ))}
      </div>

      {error && (
        <Alert
          variant="danger"
          title={t('Error creating resources')}
          isInline
          style={{ marginTop: '16px' }}
        >
          {error}
        </Alert>
      )}

      {checks.some((c) => c.status === 'success' && c.id === watchReadyId) && (
        <Alert
          variant="success"
          title={watchSuccessMessage || t('Resource is running and healthy')}
          isInline
          style={{ marginTop: '16px' }}
        />
      )}

      {showOverviewLink && (
        <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
          <Button
            variant="primary"
            onClick={() => navigate(`/kuadrant/mcp/overview/ns/${selectedNamespace}`)}
            data-test="mcp-view-overview-button"
          >
            {t('View in overview')}
          </Button>
        </div>
      )}
    </>
  );
};

export default MCPVerifyStep;
