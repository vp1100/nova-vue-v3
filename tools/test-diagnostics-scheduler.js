"use strict";

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const {
  DIAGNOSTICS_FIRST_CHANGE_DELAY_MS,
  DIAGNOSTICS_CHANGE_DELAY_MS,
  DIAGNOSTICS_OPEN_DELAY_MS,
  DIAGNOSTICS_SAVE_DELAY_MS,
  DIAGNOSTICS_MAX_WAIT_MS,
  scheduleSmartDiagnostics
} = require(path.join(root, "Vue.novaextension", "Support", "proxy", "diagnostics-scheduler.js"));

async function main() {
  await testFirstChangeDelay();
  await testTrailingChangeDelay();
  await testMaxWaitRepeatsByWindow();
  await testOpenAndSaveDelays();
  await testRunningRequestDoesNotOverlap();
  await testStaleResultIsIgnored();
  console.log("Diagnostics scheduler timing test passed.");
}

async function testFirstChangeDelay() {
  const scenario = createScenario();

  scenario.schedule("change");
  await scenario.clock.tick(DIAGNOSTICS_FIRST_CHANGE_DELAY_MS - 1);
  assert.deepStrictEqual(scenario.calls, []);

  await scenario.clock.tick(1);
  assert.deepStrictEqual(scenario.calls.map((call) => call.trigger), ["change"]);
}

async function testTrailingChangeDelay() {
  const scenario = createScenario();

  scenario.schedule("change");
  await scenario.clock.tick(100);
  scenario.version += 1;
  scenario.schedule("change");

  await scenario.clock.tick(DIAGNOSTICS_CHANGE_DELAY_MS - 1);
  assert.deepStrictEqual(scenario.calls, []);

  await scenario.clock.tick(1);
  assert.deepStrictEqual(scenario.calls.map((call) => call.trigger), ["change"]);
  assert.strictEqual(scenario.calls[0].version, 2);
}

async function testMaxWaitRepeatsByWindow() {
  const scenario = createScenario();
  const startedAt = scenario.clock.now();

  scenario.schedule("change");
  for (let elapsed = 100; elapsed < DIAGNOSTICS_MAX_WAIT_MS; elapsed += 100) {
    await scenario.clock.tick(100);
    scenario.version += 1;
    scenario.schedule("change");
  }

  await scenario.clock.tick(startedAt + DIAGNOSTICS_MAX_WAIT_MS - scenario.clock.now() - 1);
  assert.deepStrictEqual(scenario.calls, []);

  await scenario.clock.tick(1);
  assert.deepStrictEqual(scenario.calls.map((call) => call.trigger), ["change"]);

  const secondWindowStartedAt = scenario.clock.now();
  scenario.version += 1;
  scenario.schedule("change");
  for (let elapsed = 100; elapsed < DIAGNOSTICS_MAX_WAIT_MS; elapsed += 100) {
    await scenario.clock.tick(100);
    scenario.version += 1;
    scenario.schedule("change");
  }

  await scenario.clock.tick(secondWindowStartedAt + DIAGNOSTICS_MAX_WAIT_MS - scenario.clock.now() - 1);
  assert.strictEqual(scenario.calls.length, 1, "second maxWait window should not fire early");

  await scenario.clock.tick(1);
  assert.strictEqual(scenario.calls.length, 2);
  assert.strictEqual(scenario.clock.now(), secondWindowStartedAt + DIAGNOSTICS_MAX_WAIT_MS);
}

async function testOpenAndSaveDelays() {
  const openScenario = createScenario();
  openScenario.schedule("open");
  await openScenario.clock.tick(DIAGNOSTICS_OPEN_DELAY_MS - 1);
  assert.deepStrictEqual(openScenario.calls, []);
  await openScenario.clock.tick(1);
  assert.deepStrictEqual(openScenario.calls.map((call) => call.trigger), ["open"]);

  const saveScenario = createScenario();
  saveScenario.schedule("save");
  await saveScenario.clock.tick(DIAGNOSTICS_SAVE_DELAY_MS - 1);
  assert.deepStrictEqual(saveScenario.calls, []);
  await saveScenario.clock.tick(1);
  assert.deepStrictEqual(saveScenario.calls.map((call) => call.trigger), ["save"]);
}

async function testRunningRequestDoesNotOverlap() {
  const scenario = createScenario({ deferRun: true });

  scenario.schedule("change");
  await scenario.clock.tick(DIAGNOSTICS_FIRST_CHANGE_DELAY_MS);
  assert.strictEqual(scenario.calls.length, 1);

  scenario.version += 1;
  scenario.schedule("change");
  await scenario.clock.tick(DIAGNOSTICS_CHANGE_DELAY_MS);
  assert.strictEqual(scenario.calls.length, 1, "diagnostics should not run in parallel");

  scenario.resolveRun();
  await scenario.clock.flush();
  await scenario.clock.tick(DIAGNOSTICS_FIRST_CHANGE_DELAY_MS - 1);
  assert.strictEqual(scenario.calls.length, 1);

  await scenario.clock.tick(1);
  assert.strictEqual(scenario.calls.length, 2);
}

async function testStaleResultIsIgnored() {
  const clock = new FakeClock();
  const schedules = new Map();
  const file = "/workspace/component.vue";
  const published = [];
  let version = 1;
  let resolveRequest;

  scheduleSmartDiagnostics(
    schedules,
    file,
    "change",
    async (_trigger, scheduledVersion) => {
      if (version !== scheduledVersion) {
        return;
      }
      await new Promise((resolve) => {
        resolveRequest = resolve;
      });
      if (version !== scheduledVersion) {
        return;
      }
      published.push({ version: scheduledVersion });
    },
    () => version,
    clock
  );

  await clock.tick(DIAGNOSTICS_FIRST_CHANGE_DELAY_MS);
  assert(resolveRequest, "expected diagnostics request to start");

  version = 2;
  resolveRequest();
  await clock.flush();

  assert.deepStrictEqual(published, [], "stale diagnostics should not be published");
}

function createScenario(options = {}) {
  const clock = new FakeClock();
  const schedules = new Map();
  const file = "/workspace/component.vue";
  const calls = [];
  const pendingRuns = [];
  const scenario = {
    clock,
    schedules,
    file,
    calls,
    version: 1,
    schedule(trigger) {
      scheduleSmartDiagnostics(
        schedules,
        file,
        trigger,
        (scheduledTrigger, version) => {
          calls.push({ trigger: scheduledTrigger, version, at: clock.now() });
          if (!options.deferRun) {
            return Promise.resolve();
          }
          return new Promise((resolve) => {
            pendingRuns.push(resolve);
          });
        },
        () => scenario.version,
        clock
      );
    },
    resolveRun() {
      const resolve = pendingRuns.shift();
      assert(resolve, "expected a pending diagnostics run");
      resolve();
    }
  };
  return scenario;
}

class FakeClock {
  constructor() {
    this.currentTime = 100000;
    this.nextId = 1;
    this.timers = new Map();
  }

  now() {
    return this.currentTime;
  }

  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.timers.set(id, {
      at: this.currentTime + delay,
      callback
    });
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  async tick(ms) {
    const target = this.currentTime + ms;
    while (true) {
      const next = this.nextTimerBefore(target);
      if (!next) {
        break;
      }
      this.currentTime = next.at;
      this.timers.delete(next.id);
      next.callback();
      await this.flush();
    }
    this.currentTime = target;
    await this.flush();
  }

  async flush() {
    await Promise.resolve();
    await Promise.resolve();
  }

  nextTimerBefore(target) {
    let next = null;
    for (const [id, timer] of this.timers) {
      if (timer.at > target) {
        continue;
      }
      if (!next || timer.at < next.at || (timer.at === next.at && id < next.id)) {
        next = { id, ...timer };
      }
    }
    return next;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
