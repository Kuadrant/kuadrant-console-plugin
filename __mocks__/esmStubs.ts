// Stub for Jest — these modules use ESM exports that Jest cannot parse.
// Tests that need specific behaviour should add their own jest.mock() overrides.

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

// @patternfly/react-topology
export const NodeShape = { rect: 'rect', ellipse: 'ellipse' };
export const LabelPosition = { bottom: 'bottom' };
export const EdgeStyle = { default: 'default', dashedMd: 'dashedMd' };
export const EdgeAnimationSpeed = { medium: 'medium' };
