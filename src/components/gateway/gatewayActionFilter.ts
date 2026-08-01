import { Action } from '@openshift-console/dynamic-plugin-sdk/lib/extensions/actions';
import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

const gatewayActionFilter = (scope: K8sResourceCommon, action: Action): boolean => {
  if (scope?.kind === 'Gateway' && action.id === 'edit-resource') {
    return false;
  }
  return true;
};

export default gatewayActionFilter;
