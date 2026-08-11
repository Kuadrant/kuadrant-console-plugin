/** @jest-environment node */

import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { Module, Stats, webpack } from 'webpack';
import config from '../../webpack.config';

const loadPackage = createRequire(__filename);
const sdkPackage = loadPackage('@openshift-console/dynamic-plugin-sdk/package.json');

type ConsumeSharedModule = Module & {
  options: {
    import?: string;
    importResolved?: string;
    requiredVersion: unknown;
    shareKey: string;
    shareScope: string;
    singleton: boolean;
  };
};

const compileConfig = (outputPath: string): Promise<Stats> =>
  new Promise((resolve, reject) => {
    const compiler = webpack({
      ...config,
      output: { ...config.output, path: outputPath },
      plugins: config.plugins?.filter(
        (plugin) => plugin?.constructor.name === 'ConsoleRemotePlugin',
      ),
    });

    compiler.run((error, stats) => {
      compiler.close((closeError) => {
        if (error || closeError) {
          reject(error || closeError);
        } else if (!stats) {
          reject(new Error('Webpack compilation returned no stats'));
        } else if (stats.hasErrors()) {
          reject(new Error(stats.toString({ all: false, errors: true })));
        } else {
          resolve(stats);
        }
      });
    });
  });

describe('Console shared module configuration', () => {
  it('emits the patched react-router compatibility contract', async () => {
    const consoleRemotePlugin = config.plugins?.find(
      (plugin) => plugin?.constructor.name === 'ConsoleRemotePlugin',
    ) as unknown as { adaptedOptions: { validateSharedModules: boolean } };
    const routerRange = sdkPackage.peerDependencies['react-router'];
    const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), 'kuadrant-webpack-config-'));

    try {
      const stats = await compileConfig(outputPath);
      const modules = [...stats.compilation.modules];
      const routerConsumes = modules.filter(
        (module): module is ConsumeSharedModule =>
          module.type === 'consume-shared-module' &&
          (module as ConsumeSharedModule).options.shareKey === 'react-router',
      );
      const routerProviders = modules.filter(
        (module) =>
          module.type === 'provide-module' && module.identifier().includes(' react-router@'),
      );

      expect(consoleRemotePlugin.adaptedOptions.validateSharedModules).toBe(true);
      expect(routerRange).toBe('~7.13.1 || ~7.18.1');
      expect(semver.satisfies('7.13.1', routerRange)).toBe(true);
      expect(semver.satisfies('7.18.2', routerRange)).toBe(true);
      expect(semver.satisfies('7.17.0', routerRange)).toBe(false);
      expect(routerConsumes).toHaveLength(1);
      expect(routerConsumes[0].readableIdentifier(stats.compilation.requestShortener)).toBe(
        'consume shared module (default) react-router@~7.13.1 || ~7.18.1 (singleton)',
      );
      expect(routerConsumes[0].options).toMatchObject({
        import: undefined,
        importResolved: undefined,
        shareKey: 'react-router',
        shareScope: 'default',
        singleton: true,
      });
      expect(routerConsumes[0].dependencies).toHaveLength(0);
      expect(routerConsumes[0].blocks).toHaveLength(0);
      expect(routerProviders).toHaveLength(0);
    } finally {
      fs.rmSync(outputPath, { recursive: true, force: true });
    }
  }, 30_000);
});
