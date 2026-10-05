const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.env.TRAINLIGHTS_SOURCE_ROOT || path.join(__dirname, '..');
const minute = 60_000;

// Execute the complete browser script with no hardware or network access.
function fixture(filename) {
  const contents = fs.readFileSync(path.join(root, filename), 'utf8');
  const source = filename.endsWith('.html') ? contents.match(/<script>([\s\S]*?)<\/script>/)[1] : contents;
  let now = 0, nextId = 0;
  const timers = new Map(), calls = [], pending = [], nodes = new Map(), listeners = {};
  const errors = [];
  let deferred = false;
  function element(name) {
    if (!nodes.has(name)) nodes.set(name, {
      checked: true, value: '15', style: {}, children: [],
      appendChild(node) { this.children.push(node); },
      addEventListener(event, callback) { this[event] = callback; },
    });
    return nodes.get(name);
  }
  const success = () => ({ ok: true, json: async () => ({ success: true }) });
  const context = vm.createContext({
    Date,
    console: { log() {}, error(...args) { errors.push(args); } },
    Audio: class { play() { return Promise.resolve(); } },
    setInterval() {},
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      getElementById: element,
      createElement: () => element(`created-${++nextId}`),
      querySelectorAll: () => [],
      addEventListener(event, callback) { listeners[event] = callback; },
    },
    fetch(url, options) {
      calls.push({ state: url.split('/').pop(), at: now, options });
      if (!deferred) return Promise.resolve(success());
      return new Promise((resolve, reject) => pending.push({ resolve: () => resolve(success()), reject }));
    },
  });
  vm.runInContext(source, context, { filename });
  listeners.DOMContentLoaded?.();
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return {
    calls, pending, timers, errors, element, flush,
    defer(value = true) { deferred = value; },
    start(duration) { context.turnOnLightWithTimer(duration); return flush(); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        let next;
        for (const entry of timers) {
          if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
        }
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

const commands = f => f.calls.map(({ state, at }) => ({ state, minute: at / minute }));

for (const file of ['index.html', 'app.js']) {
  test(`${file}: one timer switches off only after its selected duration`, async () => {
    const f = fixture(file);
    await f.start(15);
    await f.advance(15 * minute - 1);
    assert.deepEqual(commands(f), [{ state: 'on', minute: 0 }]);
    await f.advance(1);
    assert.deepEqual(commands(f), [{ state: 'on', minute: 0 }, { state: 'off', minute: 15 }]);
    assert.equal(f.timers.size, 0);
  });

  test(`${file}: a later longer timer replaces the earlier deadline`, async () => {
    const f = fixture(file);
    await f.start(15);
    await f.advance(5 * minute);
    await f.start(30);
    await f.advance(10 * minute);
    assert.deepEqual(commands(f), [{ state: 'on', minute: 0 }, { state: 'on', minute: 5 }]);
    await f.advance(20 * minute);
    assert.deepEqual(commands(f).at(-1), { state: 'off', minute: 35 });
    assert.equal(f.calls.filter(c => c.state === 'off').length, 1);
  });

  test(`${file}: a shorter replacement leaves no later duplicate shutdown`, async () => {
    const f = fixture(file);
    await f.start(30);
    await f.advance(5 * minute);
    await f.start(2);
    await f.advance(30 * minute);
    assert.deepEqual(commands(f), [{ state: 'on', minute: 0 }, { state: 'on', minute: 5 }, { state: 'off', minute: 7 }]);
  });

  test(`${file}: repeated clicks retain only one automatic shutdown`, async () => {
    const f = fixture(file);
    for (let i = 0; i < 5; i++) await f.start(15);
    assert.equal(f.timers.size, 1);
    await f.advance(15 * minute);
    assert.equal(f.calls.filter(c => c.state === 'off').length, 1);
  });

  test(`${file}: old successful response cannot replace a newer timer`, async () => {
    const f = fixture(file);
    f.defer();
    await f.start(1);
    await f.start(30);
    f.pending[1].resolve(); await f.flush();
    await f.advance(5 * minute);
    f.pending[0].resolve(); await f.flush();
    f.defer(false);
    await f.advance(25 * minute);
    assert.deepEqual(commands(f), [{ state: 'on', minute: 0 }, { state: 'on', minute: 0 }, { state: 'off', minute: 30 }]);
  });

  test(`${file}: failed restart preserves an already running timer`, async () => {
    const f = fixture(file);
    await f.start(15);
    await f.advance(5 * minute);
    f.defer(); await f.start(30);
    f.pending[0].reject(new Error('offline')); await f.flush();
    f.defer(false);
    await f.advance(10 * minute);
    assert.deepEqual(commands(f).at(-1), { state: 'off', minute: 15 });
    assert.equal(f.errors.length, 1);
  });

  for (const failureFirst of [false, true]) {
    test(`${file}: overlapping success survives a newer failure (${failureFirst ? 'failure' : 'success'} first)`, async () => {
      const f = fixture(file);
      f.defer();
      await f.start(15);
      await f.start(30);
      if (failureFirst) {
        f.pending[1].reject(new Error('offline')); await f.flush();
        f.pending[0].resolve(); await f.flush();
      } else {
        f.pending[0].resolve(); await f.flush();
        assert.equal(f.timers.size, 1);
        f.pending[1].reject(new Error('offline')); await f.flush();
      }
      f.defer(false);
      await f.advance(15 * minute);
      assert.deepEqual(commands(f).at(-1), { state: 'off', minute: 15 });
      assert.equal(f.calls.filter(c => c.state === 'off').length, 1);
      assert.equal(f.errors.length, 1);
    });
  }

  test(`${file}: a pending restart does not cancel the existing shutdown`, async () => {
    const f = fixture(file);
    await f.start(15);
    await f.advance(5 * minute);
    f.defer(); await f.start(30); f.defer(false);
    await f.advance(10 * minute);
    assert.deepEqual(commands(f).at(-1), { state: 'off', minute: 15 });
    f.pending[0].resolve(); await f.flush();
    await f.advance(30 * minute);
    assert.deepEqual(commands(f).at(-1), { state: 'off', minute: 45 });
  });

  test(`${file}: initial failure never schedules a shutdown`, async () => {
    const f = fixture(file);
    f.defer(); await f.start(15);
    f.pending[0].reject(new Error('offline')); await f.flush();
    await f.advance(60 * minute);
    assert.equal(f.timers.size, 0);
    assert.equal(f.calls.length, 1);
    assert.equal(f.errors.length, 1);
  });

  test(`${file}: shutdown failure is handled and later timers still work`, async () => {
    const f = fixture(file);
    await f.start(1); f.defer(); await f.advance(minute);
    f.pending[0].reject(new Error('offline')); await f.flush();
    assert.equal(f.errors.length, 1);
    f.defer(false); await f.start(2); await f.advance(2 * minute);
    assert.deepEqual(commands(f).at(-1), { state: 'off', minute: 3 });
  });
}

test('index.html: restarting with automatic shutdown disabled cancels the old timer', async () => {
  const f = fixture('index.html');
  await f.start(15); await f.advance(5 * minute);
  f.element('autoShutdown').checked = false;
  await f.start(30); await f.advance(60 * minute);
  assert.equal(f.calls.filter(c => c.state === 'off').length, 0);
  assert.equal(f.timers.size, 0);
});

test('index.html: timer button uses the current input duration on restart', async () => {
  const f = fixture('index.html');
  f.element('timerDuration').value = '15';
  f.element('timerLight').click(); await f.flush(); await f.advance(5 * minute);
  f.element('timerDuration').value = '30';
  f.element('timerLight').click(); await f.flush(); await f.advance(30 * minute);
  assert.deepEqual(commands(f), [{ state: 'on', minute: 0 }, { state: 'on', minute: 5 }, { state: 'off', minute: 35 }]);
});

test('index.html: invalid duration retains the existing 15-minute fallback', async () => {
  for (const duration of [undefined, 0, -2, NaN]) {
    const f = fixture('index.html');
    await f.start(duration); await f.advance(15 * minute);
    assert.deepEqual(commands(f).at(-1), { state: 'off', minute: 15 });
  }
});
