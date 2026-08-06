import { NavigateFunction } from 'react-router';

export function handleCancel(navigate: NavigateFunction) {
  navigate(-1);
}
