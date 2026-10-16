const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.env.TRAINLIGHTS_SOURCE_ROOT || path.join(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'cfworker.js'), 'utf8')
  .replace('export default', 'globalThis.worker =');

// Execute the actual Worker with its upstream fetch replaced. No request leaves
// this process, and the token and light ID below are inert fixtures.
function workerFixture(status, body) {
  let upstreamStatus = status;
  let upstreamBody = body;
  const context = vm.createContext({
    URL, Response,
    fetch: async () => new Response(JSON.stringify(upstreamBody), { status: upstreamStatus }),
  });
  vm.runInContext(workerSource, context, { filename: 'cfworker.js' });
  return {
    respond(nextStatus, nextBody) {
      upstreamStatus = nextStatus;
      upstreamBody = nextBody;
    },
    fetch(url = 'https://example.invalid/api/lifx/test-light/off', options = {}) {
      return context.worker.fetch({ url, method: options.method || 'POST' }, {
        LIFX_API_TOKEN: 'inert-test-token',
      });
    },
  };
}

// Contracts: https://api.developer.lifx.com/reference/errors
// and https://api.developer.lifx.com/reference/reachability
const cases = [
  ['accepted operation', 207, { results: [{ status: 'ok' }] }, 200],
  ['accepted operation with warning', 207, { results: [{ status: 'ok' }], warnings: [{ warning: 'Unknown params' }] }, 200],
  ['offline light', 207, { results: [{ status: 'offline' }] }, 502],
  ['unacknowledged operation', 207, { results: [{ status: 'timed_out' }] }, 502],
  ['mixed results', 207, { results: [{ status: 'ok' }, { status: 'offline' }] }, 502],
  ['empty results', 207, { results: [] }, 502],
  ['missing results', 207, {}, 502],
  ['invalid result entry', 207, { results: [null] }, 502],
  ['ordinary success', 200, { results: [{ status: 'ok' }] }, 200],
  ['ordinary success without results', 200, {}, 200],
  ['authorization error', 401, { error: 'Unauthorized' }, 401],
  ['rate limit', 429, { error: 'Rate limit' }, 429],
  ['upstream unavailable', 503, { error: 'Unavailable' }, 503],
];

for (const [name, status, body, expected] of cases) {
  test(`Worker: ${name}`, async () => {
    const response = await workerFixture(status, body).fetch();
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    const result = await response.json();
    assert.equal(result.success === true, expected === 200);
    assert.deepEqual(expected === 200 ? result.data : result.details, body);
  });
}

async function settle() {
  // Flush response-body processing and downstream promise handlers.
  for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
}

function frontendFixture(filename, worker) {
  const nodes = new Map();
  const logs = [], errors = [], timers = [];
  function element(id) {
    if (!nodes.has(id)) nodes.set(id, {
      style: {}, checked: true, appendChild() {}, addEventListener() {},
    });
    return nodes.get(id);
  }
  const context = vm.createContext({
    console: {
      log(...args) { logs.push(args.join(' ')); },
      error(...args) { errors.push(args.join(' ')); },
    },
    Date,
    document: {
      getElementById: element, createElement: () => element('created'),
      addEventListener() {}, querySelectorAll: () => [],
    },
    setInterval() {},
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
    fetch: (url, options) => worker.fetch(url, options),
    Audio: class { play() { return Promise.resolve(); } },
  });
  const content = fs.readFileSync(path.join(root, filename), 'utf8');
  const source = filename.endsWith('.html') ? content.match(/<script>([\s\S]*?)<\/script>/)[1] : content;
  vm.runInContext(source, context, { filename });
  if (filename !== '15minutes.html') context.turnOnLightWithTimer(15);
  return { logs, errors, timers };
}

for (const filename of ['index.html', 'app.js', '15minutes.html']) {
  for (const status of ['ok', 'offline', 'timed_out']) {
    test(`${filename}: handles ${status} ON result and failed automatic OFF`, async () => {
      const worker = workerFixture(207, { results: [{ status }] });
      const frontend = frontendFixture(filename, worker);
      await settle();
      assert.equal(frontend.timers.length, status === 'ok' ? 1 : 0);
      assert.equal(frontend.errors.length > 0, status !== 'ok');
      if (status === 'ok') {
        assert.equal(frontend.timers[0].delay, 15 * 60 * 1000);
        worker.respond(207, { results: [{ status: 'offline' }] });
        frontend.timers[0].callback();
        await settle();
        assert.equal(frontend.errors.length > 0, true);
        assert.equal(frontend.logs.some(message => message.includes('Light turned off automatically')), false);
      }
    });
  }
}
