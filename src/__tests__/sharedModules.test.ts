/** @jest-environment node */

import { createRequire } from 'module';

const loadPackage = createRequire(__filename);

// ConsoleRemotePlugin reads the SDK peer range at build time: it gates
// validateConsoleProvidedSharedModules and becomes the federation
// requiredVersion for the react-router singleton. See .yarn/patches/README.md.
describe('Console shared module configuration', () => {
  it('widens the SDK react-router peer range to accept any 7.x host router', () => {
    const sdkPackage = loadPackage('@openshift-console/dynamic-plugin-sdk/package.json');

    expect(sdkPackage.peerDependencies['react-router']).toBe('>=7.13.1 <8.0.0');
  });

  it('resolves react-router past the advisories affecting 7.13.x', () => {
    const [major, minor] = loadPackage('react-router/package.json').version.split('.').map(Number);

    expect(major).toBe(7);
    expect(minor).toBeGreaterThanOrEqual(18);
  });
});
