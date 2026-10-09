/** @jest-environment node */

import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import * as path from 'path';
import { runInNewContext } from 'vm';
import type { Configuration } from 'webpack';

const webpack = createRequire(__filename)('webpack') as typeof import('webpack');

it('initializes Swagger UI API DOM identities in a production bundle', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  let config: Configuration;
  try {
    process.env.NODE_ENV = 'production';
    await jest.isolateModulesAsync(async () => {
      config = (await import('../../webpack.config')).default;
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  const outputPath = mkdtempSync(path.join(tmpdir(), 'kuadrant-production-bundle-'));
  try {
    await new Promise<void>((resolve, reject) => {
      webpack(
        {
          mode: config.mode,
          context: config.context,
          resolve: config.resolve,
          module: config.module,
          optimization: config.optimization,
          entry: path.join(__dirname, 'fixtures/apidom-identity.mjs'),
          output: { path: outputPath, filename: 'bundle.js' },
        },
        (error, stats) => {
          if (error) reject(error);
          else if (stats.hasErrors()) reject(new Error(stats.toString('errors-only')));
          else resolve();
        },
      );
    });

    const context = { generatedID: undefined };
    runInNewContext(readFileSync(path.join(outputPath, 'bundle.js'), 'utf8'), context, {
      filename: 'production-bundle.js',
      displayErrors: false,
    });
    expect(context.generatedID).toEqual(expect.any(String));
    expect(context.generatedID).toHaveLength(6);
  } finally {
    rmSync(outputPath, { recursive: true, force: true });
  }
}, 30000);
