import * as React from 'react';
import { useLocation } from 'react-router';
import { ResourceKind } from '../utils/resources';
import { getPolicyTargetFromSearch, PolicyTarget } from '../utils/policyTarget';

// target handed to a policy create page, e.g. from the topology context menu
export const usePolicyTargetPrefill = (policyKind: ResourceKind): PolicyTarget | null => {
  const { search } = useLocation();
  return React.useMemo(() => getPolicyTargetFromSearch(policyKind, search), [policyKind, search]);
};
