import { NavigateFunction } from 'react-router-dom-v5-compat';

export function handleCancel(navigate: NavigateFunction) {
  navigate(-1);
}
