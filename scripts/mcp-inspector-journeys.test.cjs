const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { createServer } = require('node:http');
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { promisify } = require('node:util');

async function runJourneys(t, missingDemoGateway = false) {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-inspector-journeys-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'e2e'));
  copyFileSync(
    join(__dirname, '../e2e/test-mcp-inspector.sh'),
    join(dir, 'e2e/test-mcp-inspector.sh'),
  );
  const fixture = join(dir, 'auth-fixture');
  const log = join(dir, 'journeys');
  writeFileSync(log, '');
  const probes = [];
  const gateway = async (host, token, protectedGateway) => {
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        const method = JSON.parse(body).method;
        const authorization = request.headers.authorization;
        probes.push({ host: request.headers.host, authorization, method });
        response.setHeader('Content-Type', 'application/json');
        if (request.headers.host !== host) {
          response.writeHead(404).end('{}');
        } else if (
          (protectedGateway || existsSync(fixture)) &&
          authorization !== `Bearer ${token}`
        ) {
          response.writeHead(401).end('{}');
        } else {
          response.end(
            JSON.stringify({ result: { supportedVersions: ['2025-11-25', '2026-07-28'] } }),
          );
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return server.address().port;
  };
  const openPort = await gateway('mcp.127-0-0-1.sslip.io', 'inspector-e2e-token', false);
  const authPort = await gateway('mcp-auth.127-0-0-1.sslip.io', 'token', true);
  const stub = (name, script) =>
    writeFileSync(join(dir, 'bin', name), `#!/bin/bash\nset -eu\n${script}\n`, { mode: 0o755 });
  stub(
    'kubectl',
    `
case "$*" in
  'config current-context') echo oinc ;;
  *'port-forward '*)
    case "$*" in
      *'service/mcp-gateway-istio '*) port="$INSPECTOR_TEST_OPEN_PORT" ;;
      *'service/mcp-gateway-auth-istio '*)
        if [ "$INSPECTOR_TEST_MISSING_DEMO" = true ]; then exit 1; fi
        port="$INSPECTOR_TEST_AUTH_PORT" ;;
      *) exit 1 ;;
    esac
    echo "Forwarding from 127.0.0.1:$port -> 80"
    exec sleep 30 ;;
  *'apply -f e2e/manifests/mcp-inspector-auth.yaml') touch "$INSPECTOR_TEST_FIXTURE" ;;
  *'wait authpolicy/mcp-inspector-e2e '*) test -f "$INSPECTOR_TEST_FIXTURE" ;;
  *'delete -f e2e/manifests/mcp-inspector-auth.yaml --ignore-not-found') rm -f "$INSPECTOR_TEST_FIXTURE" ;;
  *) exit 1 ;;
esac`,
  );
  stub(
    'npx',
    'printf "%s %s %s\\n" "$MCP_INSPECTOR_E2E_EXTENSION" "${MCP_INSPECTOR_E2E_TOKEN:-anonymous}" "$MCP_INSPECTOR_E2E_PROTOCOL" >> "$INSPECTOR_TEST_LOG"',
  );
  let status = 0;
  let stderr = '';
  try {
    await promisify(execFile)('bash', [join(dir, 'e2e/test-mcp-inspector.sh')], {
      env: {
        ...process.env,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        MCP_INSPECTOR_E2E_TOKEN: '',
        INSPECTOR_TEST_OPEN_PORT: String(openPort),
        INSPECTOR_TEST_AUTH_PORT: String(authPort),
        INSPECTOR_TEST_MISSING_DEMO: String(missingDemoGateway),
        INSPECTOR_TEST_FIXTURE: fixture,
        INSPECTOR_TEST_LOG: log,
      },
      timeout: 15000,
    });
  } catch (error) {
    status = error.code;
    stderr = error.stderr;
  }
  return {
    status,
    stderr,
    probes,
    journeys: readFileSync(log, 'utf8').trim().split('\n'),
    fixtureExists: existsSync(fixture),
  };
}

test('live journeys probe and exercise the authenticated demo as well as the original gateway', async (t) => {
  const result = await runJourneys(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.journeys, [
    'mcp-gateway-system/mcp-gateway-extension anonymous 2025-11-25',
    'mcp-gateway-system/mcp-gateway-extension anonymous 2026-07-28',
    'mcp-gateway-system/mcp-gateway-extension anonymous auto',
    'mcp-gateway-system/mcp-gateway-extension inspector-e2e-token 2025-11-25',
    'mcp-gateway-auth-system/mcp-gateway-auth-extension token 2025-11-25',
  ]);
  assert.ok(
    result.probes.some(
      (probe) => probe.host === 'mcp-auth.127-0-0-1.sslip.io' && !probe.authorization,
    ),
  );
  assert.ok(
    result.probes.some(
      (probe) =>
        probe.host === 'mcp-auth.127-0-0-1.sslip.io' &&
        probe.authorization === 'Bearer token' &&
        probe.method === 'initialize',
    ),
  );
  assert.equal(result.fixtureExists, false);
});

test('live journeys fail when the authenticated demo gateway is unavailable', async (t) => {
  const result = await runJourneys(t, true);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /mcp-auth\.127-0-0-1\.sslip\.io authentication did not become ready/);
  assert.equal(result.journeys.length, 4);
  assert.equal(result.fixtureExists, false);
});
