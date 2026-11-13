// Stub for Jest — these modules use ESM exports that Jest cannot parse.
// Tests that need specific behaviour should add their own jest.mock() overrides.

import * as React from 'react';

// @openshift-console/dynamic-plugin-sdk
export const k8sCreate = () => Promise.resolve({});
export const k8sUpdate = () => Promise.resolve({});
export const k8sList = () => Promise.resolve([]);
export const k8sDelete = () => Promise.resolve({});
export const k8sGet = () => Promise.resolve({});
export const consoleFetchJSON = Object.assign(() => Promise.resolve({}), {
  post: () => Promise.resolve({}),
});
export const useK8sModel = () => [null, false];
export const useK8sWatchResource = () => [[], true, null];
export const useActiveNamespace = () => ['default', () => undefined];
export const ResourceLink = () => null;
export const getGroupVersionKindForResource = ({
  apiVersion,
  kind,
}: {
  apiVersion: string;
  kind: string;
}) => {
  const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion];
  return { group, version, kind };
};
// the real editor needs the host app; like it, this one shows the resource it is given and sends
// the whole document on each change
export const ResourceYAMLEditor = ({
  initialResource,
  onChange,
}: {
  initialResource?: unknown;
  onChange?: (yaml: string) => void;
}) =>
  React.createElement('textarea', {
    'data-test': 'yaml-editor',
    defaultValue:
      typeof initialResource === 'string' ? initialResource : JSON.stringify(initialResource),
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value),
  });

// @patternfly/react-topology
export const NodeShape = { rect: 'rect', ellipse: 'ellipse' };
export const LabelPosition = { bottom: 'bottom' };
export const EdgeStyle = { default: 'default', dashedMd: 'dashedMd' };
export const EdgeAnimationSpeed = { medium: 'medium' };
