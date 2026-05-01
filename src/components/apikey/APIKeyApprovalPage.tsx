import * as React from 'react';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  Spinner,
  Alert,
} from '@patternfly/react-core';
import {
  useActiveNamespace,
  useK8sWatchResource,
  useAccessReview,
  consoleFetchJSON,
  k8sCreate,
  k8sGet,
  k8sUpdate,
  NamespaceBar,
} from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { RESOURCES } from '../../utils/resources';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { APIKeyRequest, APIKeyApproval } from './types';
import { getRequestStatus } from './utils';
import APIKeyApprovalToolbar, { FilterState } from './APIKeyApprovalToolbar';
import APIKeyApprovalTable from './APIKeyApprovalTable';
import ApprovalModal from './ApprovalModal';
import RejectionModal from './RejectionModal';
import NoPermissionsView from '../NoPermissionsView';
import '../kuadrant.css';

const APIKeyApprovalPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();

  const [selectedRequests, setSelectedRequests] = React.useState<Set<string>>(new Set());
  const [filters, setFilters] = React.useState<FilterState>({ product: '', requester: '' });
  const [currentUser, setCurrentUser] = React.useState('');
  const [approvalModalRequests, setApprovalModalRequests] = React.useState<APIKeyRequest[]>([]);
  const [rejectionModalRequests, setRejectionModalRequests] = React.useState<APIKeyRequest[]>([]);
  const [toastMessage, setToastMessage] = React.useState('');
  const [toastVariant, setToastVariant] = React.useState<'success' | 'danger'>('success');
  const [userLoaded, setUserLoaded] = React.useState(false);
  const [userError, setUserError] = React.useState(false);

  const ns = activeNamespace === '#ALL_NS#' ? '' : activeNamespace;

  const [canReadRequests, canReadRequestsLoaded] = useAccessReview({
    group: RESOURCES.APIKeyRequest.gvk.group,
    resource: 'apikeyrequests',
    verb: 'get',
    namespace: ns,
  });

  React.useEffect(() => {
    consoleFetchJSON('/apis/user.openshift.io/v1/users/~')
      .then((user: { metadata: { name: string } }) => {
        setCurrentUser(user.metadata.name);
        setUserLoaded(true);
      })
      .catch((err: unknown) => {
        console.error('Failed to get current user:', err);
        setUserError(true);
      });
  }, []);

  const requestResource = React.useMemo(
    () => ({
      groupVersionKind: RESOURCES.APIKeyRequest.gvk,
      isList: true,
      namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
    }),
    [activeNamespace],
  );

  const [requests, requestsLoaded, requestsError] =
    useK8sWatchResource<APIKeyRequest[]>(requestResource);

  const productResource = React.useMemo(
    () => ({
      groupVersionKind: RESOURCES.APIProduct.gvk,
      isList: true,
    }),
    [],
  );

  const [products, productsLoaded] =
    useK8sWatchResource<{ metadata: { name: string; namespace: string } }[]>(productResource);

  const productOptions = React.useMemo(() => {
    if (!productsLoaded || !Array.isArray(products)) return [];
    return products.map((p) => ({
      name: p.metadata.name,
      namespace: p.metadata.namespace,
    }));
  }, [products, productsLoaded]);

  const filteredRequests = React.useMemo(() => {
    if (!Array.isArray(requests)) return [];
    return requests.filter((req) => {
      if (filters.product && req.spec.apiProductRef.name !== filters.product) return false;
      if (
        filters.requester &&
        !req.spec.requestedBy.email.toLowerCase().includes(filters.requester.toLowerCase())
      )
        return false;
      return true;
    });
  }, [requests, filters]);

  const createApproval = async (
    request: APIKeyRequest,
    approved: boolean,
    message?: string,
  ): Promise<void> => {
    const suffix = approved ? 'approval' : 'rejection';
    const approval: APIKeyApproval = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKeyApproval',
      metadata: {
        name: `${request.metadata?.name}-${suffix}`,
        namespace: request.metadata?.namespace,
      },
      spec: {
        apiKeyRequestRef: { name: request.metadata?.name || '' },
        approved,
        reviewedBy: currentUser,
        reviewedAt: new Date().toISOString(),
        reason: approved ? 'ApprovedByOwner' : 'RejectedByOwner',
        message: message || (approved ? 'Approved' : 'Rejected'),
      },
    };
    const model = getModelFromResource(approval);
    try {
      await k8sCreate({ model, data: approval });
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 409) {
        const existing = await k8sGet<APIKeyApproval>({
          model,
          name: approval.metadata.name,
          ns: approval.metadata.namespace,
        });
        await k8sUpdate({
          model,
          data: {
            ...approval,
            metadata: { ...approval.metadata, resourceVersion: existing.metadata.resourceVersion },
          },
        });
      } else {
        throw err;
      }
    }
  };

  const handleApprove = async (requestsToApprove: APIKeyRequest[]) => {
    const results = await Promise.allSettled(
      requestsToApprove.map((req) => createApproval(req, true)),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      setToastMessage(
        t('{{succeeded}} API key(s) approved, {{failed}} failed', { succeeded, failed }),
      );
      setToastVariant('danger');
    } else {
      setToastMessage(t('{{count}} API key(s) approved successfully', { count: succeeded }));
      setToastVariant('success');
    }
    setSelectedRequests(new Set());
    setApprovalModalRequests([]);
  };

  const handleReject = async (requestsToReject: APIKeyRequest[], reason?: string) => {
    const results = await Promise.allSettled(
      requestsToReject.map((req) => createApproval(req, false, reason)),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      setToastMessage(
        t('{{succeeded}} API key(s) rejected, {{failed}} failed', { succeeded, failed }),
      );
      setToastVariant('danger');
    } else {
      setToastMessage(t('{{count}} API key(s) rejected', { count: succeeded }));
      setToastVariant('success');
    }
    setSelectedRequests(new Set());
    setRejectionModalRequests([]);
  };

  const handleSelectRequest = (requestName: string, selected: boolean) => {
    setSelectedRequests((prev) => {
      const next = new Set(prev);
      if (selected) next.add(requestName);
      else next.delete(requestName);
      return next;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      const pendingNames = filteredRequests
        .filter((r) => getRequestStatus(r) === 'Pending')
        .map((r) => r.metadata?.name || '');
      setSelectedRequests(new Set(pendingNames));
    } else {
      setSelectedRequests(new Set());
    }
  };

  const handleBulkApprove = () => {
    const toApprove = filteredRequests.filter((r) => selectedRequests.has(r.metadata?.name || ''));
    setApprovalModalRequests(toApprove);
  };

  const handleBulkReject = () => {
    const toReject = filteredRequests.filter((r) => selectedRequests.has(r.metadata?.name || ''));
    setRejectionModalRequests(toReject);
  };

  if (canReadRequestsLoaded && canReadRequests === false) {
    return (
      <>
        <NamespaceBar />
        <PageSection hasBodyWrapper={false}>
          <NoPermissionsView
            primaryMessage={t('You do not have permission to view API key requests')}
          />
        </PageSection>
      </>
    );
  }

  if (!requestsLoaded) {
    return (
      <>
        <NamespaceBar />
        <PageSection hasBodyWrapper={false}>
          <EmptyState>
            <Spinner size="xl" />
            <Title headingLevel="h2" size="lg">
              {t('Loading API key requests...')}
            </Title>
          </EmptyState>
        </PageSection>
      </>
    );
  }

  if (requestsError) {
    return (
      <>
        <NamespaceBar />
        <PageSection hasBodyWrapper={false}>
          <Alert variant="danger" title={t('Error loading API key requests')}>
            {String(requestsError)}
          </Alert>
        </PageSection>
      </>
    );
  }

  if (!Array.isArray(requests) || requests.length === 0) {
    const hasNoRequests = !Array.isArray(requests) || requests.length === 0;
    return (
      <>
        <NamespaceBar />
        <PageSection hasBodyWrapper={false}>
          <EmptyState>
            <Title headingLevel="h2" size="lg">
              {hasNoRequests ? t('No API key requests') : t('No pending approvals')}
            </Title>
            <EmptyStateBody>
              {hasNoRequests
                ? t('There are no API key requests yet')
                : t('All API key requests have been reviewed')}
            </EmptyStateBody>
          </EmptyState>
        </PageSection>
      </>
    );
  }

  return (
    <>
      <NamespaceBar />
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('API Key Approvals')}</Title>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        {userError && (
          <Alert
            variant="danger"
            isInline
            title={t('Unable to determine current user — approve and reject actions are disabled')}
          />
        )}

        {toastMessage && (
          <Alert
            variant={toastVariant}
            title={toastMessage}
            isInline
            timeout={5000}
            onTimeout={() => setToastMessage('')}
          />
        )}

        <APIKeyApprovalToolbar
          filters={filters}
          onFilterChange={setFilters}
          selectedCount={selectedRequests.size}
          onBulkApprove={handleBulkApprove}
          onBulkReject={handleBulkReject}
          productOptions={productOptions}
          isActionsDisabled={!userLoaded || userError}
        />

        <APIKeyApprovalTable
          requests={filteredRequests}
          selectedRequests={selectedRequests}
          onSelectRequest={handleSelectRequest}
          onSelectAll={handleSelectAll}
          onApprove={(req) => setApprovalModalRequests([req])}
          onReject={(req) => setRejectionModalRequests([req])}
        />
      </PageSection>

      <ApprovalModal
        isOpen={approvalModalRequests.length > 0}
        onClose={() => setApprovalModalRequests([])}
        requests={approvalModalRequests}
        onApprove={handleApprove}
      />

      <RejectionModal
        isOpen={rejectionModalRequests.length > 0}
        onClose={() => setRejectionModalRequests([])}
        requests={rejectionModalRequests}
        onReject={handleReject}
      />
    </>
  );
};

export default APIKeyApprovalPage;
