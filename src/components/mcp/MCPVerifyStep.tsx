import * as React from 'react';
import { Title, Content, Spinner, Alert, Button, Flex, FlexItem } from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationCircleIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import {
  K8sResourceCommon,
  k8sCreate,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate } from 'react-router';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { RESOURCES } from '../../utils/resources';
import { MCPWizardFormState, MCPGatewayExtension, ReferenceGrantResource } from './types';
import { GatewayResource } from '../gateway/types';
import { HTTPRouteResource } from '../httproute/types';

type CheckStatus = 'pending' | 'in-progress' | 'success' | 'error';

interface VerifyCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message?: string;
}

interface MCPVerifyStepProps {
  formState: MCPWizardFormState;
  selectedNamespace: string;
  newGatewayResource?: GatewayResource | null;
  newRouteResource?: HTTPRouteResource | null;
}

const MCPVerifyStep: React.FC<MCPVerifyStepProps> = ({
  formState,
  selectedNamespace,
  newGatewayResource,
  newRouteResource,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();

  const [checks, setChecks] = React.useState<VerifyCheck[]>([]);
  const creationStartedRef = React.useRef(false);
  const [extensionCreated, setExtensionCreated] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Determine if cross-namespace (extension namespace vs gateway namespace)
  const extensionNamespace = formState.extensionNamespace || selectedNamespace;
  const gatewayNamespace = formState.selectedGatewayNamespace || selectedNamespace;
  const isCrossNamespace = extensionNamespace !== gatewayNamespace;

  // Watch the MCPGatewayExtension after creation for Ready condition
  const extensionWatchResource = React.useMemo(
    () =>
      extensionCreated
        ? {
            groupVersionKind: RESOURCES.MCPGatewayExtension.gvk,
            name: formState.extensionName,
            namespace: extensionNamespace,
            isList: false,
          }
        : null,
    [extensionCreated, formState.extensionName, extensionNamespace],
  );

  const [extensionData, extensionLoaded] =
    useK8sWatchResource<MCPGatewayExtension>(extensionWatchResource);

  // Check Ready condition on the watched MCPGatewayExtension
  React.useEffect(() => {
    if (!extensionCreated || !extensionLoaded || !extensionData) return;

    const conditions = extensionData.status?.conditions || [];
    const readyCondition = conditions.find((c) => c.type === 'Ready');

    if (readyCondition?.status === 'True') {
      updateCheckById('extension-ready', 'success', t('MCP Extension is running and healthy'));
    } else if (readyCondition?.status === 'False') {
      updateCheckById(
        'extension-ready',
        'error',
        readyCondition.message || readyCondition.reason || t('Extension is not ready'),
      );
    }
  }, [extensionData, extensionLoaded, extensionCreated, t]);

  const updateCheckById = React.useCallback((id: string, status: CheckStatus, message?: string) => {
    setChecks((prev) =>
      prev.map((check) => (check.id === id ? { ...check, status, message } : check)),
    );
  }, []);

  // Build and create resources sequentially
  const createResources = React.useCallback(async () => {
    if (creationStartedRef.current) return;
    creationStartedRef.current = true;
    setError(null);

    // Build the check list based on what will be created
    const initialChecks: VerifyCheck[] = [];

    if (formState.gatewayMode === 'new') {
      initialChecks.push({ id: 'create-gateway', label: t('Create Gateway'), status: 'pending' });
    }
    if (formState.routeMode === 'new') {
      initialChecks.push({
        id: 'create-route',
        label: t('Create HTTPRoute'),
        status: 'pending',
      });
    }

    // Namespace check
    if (isCrossNamespace) {
      initialChecks.push({
        id: 'create-ref-grant',
        label: t('Create ReferenceGrant'),
        status: 'pending',
      });
    } else {
      initialChecks.push({
        id: 'ref-grant-check',
        label: t('ReferenceGrant check'),
        status: 'success',
        message: t('No reference grant needed'),
      });
    }

    initialChecks.push({
      id: 'create-extension',
      label: t('Create MCPGatewayExtension'),
      status: 'pending',
    });
    initialChecks.push({
      id: 'extension-ready',
      label: t('MCP Extension is ready'),
      status: 'pending',
    });

    setChecks(initialChecks);

    const createOrSkipExisting = async (
      model: ReturnType<typeof getModelFromResource>,
      data: K8sResourceCommon,
      checkId: string,
      successMsg: string,
    ) => {
      updateCheckById(checkId, 'in-progress');
      try {
        await k8sCreate({ model, data });
        updateCheckById(checkId, 'success', successMsg);
      } catch (err: unknown) {
        const errStatus =
          (err as { code?: number })?.code ?? (err as { json?: { code?: number } })?.json?.code;
        if (errStatus === 409) {
          updateCheckById(checkId, 'success', t('Already exists'));
        } else {
          throw err;
        }
      }
    };

    try {
      // 1. Create Gateway if new
      if (formState.gatewayMode === 'new' && newGatewayResource) {
        const model = getModelFromResource(newGatewayResource);
        await createOrSkipExisting(
          model,
          newGatewayResource,
          'create-gateway',
          t('Gateway created successfully'),
        );
      }

      // 2. Create HTTPRoute if new
      if (formState.routeMode === 'new' && newRouteResource) {
        const model = getModelFromResource(newRouteResource);
        await createOrSkipExisting(
          model,
          newRouteResource,
          'create-route',
          t('HTTPRoute created successfully'),
        );
      }

      // 3. Create ReferenceGrant if cross-namespace
      if (isCrossNamespace) {
        const refGrantResource: ReferenceGrantResource = {
          apiVersion: 'gateway.networking.k8s.io/v1beta1',
          kind: 'ReferenceGrant',
          metadata: {
            name: `${formState.extensionName}-ref-grant`,
            namespace: gatewayNamespace,
          },
          spec: {
            from: [
              {
                group: 'mcp.kuadrant.io',
                kind: 'MCPGatewayExtension',
                namespace: extensionNamespace,
              },
            ],
            to: [
              {
                group: 'gateway.networking.k8s.io',
                kind: 'Gateway',
                name: formState.targetGateway,
              },
            ],
          },
        };
        const model = getModelFromResource(refGrantResource);
        await createOrSkipExisting(
          model,
          refGrantResource,
          'create-ref-grant',
          t('ReferenceGrant created successfully'),
        );
      }

      // 4. Create MCPGatewayExtension
      const mcpExtensionResource: MCPGatewayExtension = {
        apiVersion: 'mcp.kuadrant.io/v1alpha1',
        kind: 'MCPGatewayExtension',
        metadata: {
          name: formState.extensionName,
          namespace: extensionNamespace,
        },
        spec: {
          targetRef: {
            group: 'gateway.networking.k8s.io',
            kind: 'Gateway',
            name: formState.targetGateway,
            namespace: gatewayNamespace,
            sectionName: formState.sectionName,
          },
          ...(formState.overrideHostnames && formState.publicHost
            ? { publicHost: formState.publicHost }
            : {}),
          ...(formState.overrideHostnames && formState.privateHost
            ? { privateHost: formState.privateHost }
            : {}),
          ...(formState.sessionStorageEnabled && formState.sessionStoreSecretName
            ? { sessionStore: { secretName: formState.sessionStoreSecretName } }
            : {}),
          ...(formState.oauthEnabled && formState.oauthAuthorizationServers
            ? {
                oauthProtectedResource: {
                  authorizationServers: formState.oauthAuthorizationServers
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  ...(formState.oauthResourceName
                    ? { resourceName: formState.oauthResourceName }
                    : {}),
                },
              }
            : {}),
        },
      };

      const extensionModel = getModelFromResource(mcpExtensionResource);
      await createOrSkipExisting(
        extensionModel,
        mcpExtensionResource,
        'create-extension',
        t('MCPGatewayExtension created successfully'),
      );

      // 5. Start watching for Ready condition
      updateCheckById(
        'extension-ready',
        'in-progress',
        t('Waiting for controller to reconcile...'),
      );
      setExtensionCreated(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);

      // Mark current in-progress check as error
      setChecks((prev) =>
        prev.map((check) =>
          check.status === 'in-progress'
            ? { ...check, status: 'error' as CheckStatus, message }
            : check,
        ),
      );
    }
  }, [
    formState,
    selectedNamespace,
    extensionNamespace,
    gatewayNamespace,
    isCrossNamespace,
    newGatewayResource,
    newRouteResource,
    updateCheckById,
    t,
  ]);

  // Auto-start creation when the step mounts
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
      <Title headingLevel="h2" style={{ marginBottom: '16px' }}>
        {t('Verify configuration')}
      </Title>
      <Content component="p" style={{ marginBottom: '24px' }}>
        {t(
          'Creating and verifying your MCP infrastructure. You can navigate away at any time — resources that have been created will persist.',
        )}
      </Content>

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

      {checks.some((c) => c.status === 'success' && c.id === 'extension-ready') && (
        <Alert
          variant="success"
          title={t('MCP Extension is running and healthy')}
          isInline
          style={{ marginTop: '16px' }}
        />
      )}

      <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
        <Button
          variant="primary"
          onClick={() => navigate(`/kuadrant/mcp/overview/ns/${selectedNamespace}`)}
          data-test="mcp-view-overview-button"
        >
          {t('View in overview')}
        </Button>
      </div>
    </>
  );
};

export default MCPVerifyStep;
