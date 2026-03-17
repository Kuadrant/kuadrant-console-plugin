import { NavigateFunction } from 'react-router-dom-v5-compat';

export function handleCancel(namespace: string, data, navigate: NavigateFunction) {
  navigate(-1);
}
