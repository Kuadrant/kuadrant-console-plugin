/**
 * Migration note: React Router v6 migration aligns routing patterns
 * using the compatibility layer from 'react-router-dom-v5-compat'.
 */
import { NavigateFunction } from 'react-router-dom-v5-compat';

export function handleCancel(namespace: string, data, navigate: NavigateFunction) {
  navigate(-1);
}
