import { History } from 'history';

export function handleCancel (namespace: string ,data , history: History)  {
  history.push(`/kuadrant/all-namespaces/policies`)
  };