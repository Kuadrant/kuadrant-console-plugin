const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { createServer } = require('node:http');
const {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { promisify } = require('node:util');

// brokerStuck: discovery lacks 2026-07-28 until the broker restarts.
// staleAfterRestart: discover probes still answered that way after the restart.
// toolsLateProbes: tools/list probes that omit the stateless tool while discovery is complete.
async function runJourneys(
  t,
  {
    missingDemoGateway = false,
    brokerStuck = false,
    staleAfterRestart = 0,
    toolsLateProbes = 0,
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-inspector-journeys-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'e2e'));
  copyFileSync(
    join(__dirname, '../e2e/test-mcp-inspector.sh'),
    join(dir, 'e2e/test-mcp-inspector.sh'),
  );
  const log = join(dir, 'journeys');
  writeFileSync(log, '');
  const restartLog = join(dir, 'restarts');
  writeFileSync(restartLog, '');
  const restarts = () => readFileSync(restartLog, 'utf8').split('\n').filter(Boolean).length;
  let stale = brokerStuck;
  let staleLeft = staleAfterRestart;
  let toolsLeft = toolsLateProbes;
  const brokerReply = (method) => {
    if (method === 'server/discover') {
      if (stale && restarts() > 0) {
        if (staleLeft > 0) {
          staleLeft -= 1;
        } else {
          stale = false;
        }
      }
      return { supportedVersions: stale ? ['2025-11-25'] : ['2025-11-25', '2026-07-28'] };
    }
    if (method === 'tools/list') {
      if (stale) {
        return { tools: [] };
      }
      if (toolsLeft > 0) {
        toolsLeft -= 1;
        return { tools: [] };
      }
      return { tools: [{ name: 'stateless_hello_world' }] };
    }
    return {};
  };
  const probes = [];
  const gateway = async (host, token) => {
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
        } else if (token && authorization !== `Bearer ${token}`) {
          response.writeHead(401).end('{}');
        } else {
          response.end(JSON.stringify({ result: brokerReply(method) }));
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return server.address().port;
  };
  const openPort = await gateway('mcp.127-0-0-1.sslip.io');
  const authPort = await gateway('mcp-auth.127-0-0-1.sslip.io', 'token');
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
  *'rollout restart deployment/mcp-gateway -n mcp-gateway-system') echo restart >> "$INSPECTOR_TEST_RESTARTS" ;;
  *'rollout status deployment/mcp-gateway -n mcp-gateway-system --timeout=2m') ;;
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
    ({ stderr } = await promisify(execFile)('bash', [join(dir, 'e2e/test-mcp-inspector.sh')], {
      env: {
        ...process.env,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        MCP_INSPECTOR_E2E_TOKEN: '',
        INSPECTOR_TEST_OPEN_PORT: String(openPort),
        INSPECTOR_TEST_AUTH_PORT: String(authPort),
        INSPECTOR_TEST_MISSING_DEMO: String(missingDemoGateway),
        INSPECTOR_TEST_LOG: log,
        INSPECTOR_TEST_RESTARTS: restartLog,
      },
      timeout: 15000,
    }));
  } catch (error) {
    status = error.code;
    stderr = error.stderr;
  }
  return {
    status,
    stderr,
    probes,
    restarts: restarts(),
    journeys: readFileSync(log, 'utf8').trim().split('\n'),
  };
}

const allJourneys = [
  'mcp-gateway-system/mcp-gateway-extension anonymous 2025-11-25',
  'mcp-gateway-system/mcp-gateway-extension anonymous 2026-07-28',
  'mcp-gateway-system/mcp-gateway-extension anonymous auto',
  'mcp-gateway-auth-system/mcp-gateway-auth-extension token 2025-11-25',
];

test('live journeys probe and exercise the authenticated demo as well as the original gateway', async (t) => {
  const result = await runJourneys(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.journeys, allJourneys);
  assert.equal(result.restarts, 0);
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
});

test('live journeys fail when the authenticated demo gateway is unavailable', async (t) => {
  const result = await runJourneys(t, { missingDemoGateway: true });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /mcp-auth\.127-0-0-1\.sslip\.io authentication did not become ready/);
  assert.equal(result.journeys.length, 3);
});

test('live journeys restart a stuck broker once', async (t) => {
  const result = await runJourneys(t, { brokerStuck: true, staleAfterRestart: 1 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /broker advertises \["2025-11-25"\]; restarting it/);
  assert.equal(result.restarts, 1);
  assert.deepEqual(result.journeys, allJourneys);
});

test('live journeys wait for the stateless tools without restarting the broker', async (t) => {
  const result = await runJourneys(t, { toolsLateProbes: 2 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.restarts, 0);
  assert.equal(result.probes.filter((probe) => probe.method === 'tools/list').length, 3);
  assert.deepEqual(result.journeys, allJourneys);
});
