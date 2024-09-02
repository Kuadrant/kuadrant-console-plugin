import { History } from 'history';

export function handleCancel (namespace: string, policyType:string ,data , history: History)  {
  history.push(`/k8s/all-namespaces/kuadrant.io~v1alpha1~TLSPolicy`)
  };