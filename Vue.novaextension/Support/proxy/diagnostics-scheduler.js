"use strict";

const DIAGNOSTICS_FIRST_CHANGE_DELAY_MS = 200;
const DIAGNOSTICS_CHANGE_DELAY_MS = 800;
const DIAGNOSTICS_OPEN_DELAY_MS = 100;
const DIAGNOSTICS_SAVE_DELAY_MS = 100;
const DIAGNOSTICS_MAX_WAIT_MS = 5000;
const DIAGNOSTICS_IDLE_RESET_MS = 2000;

const defaultClock = {
  now: Date.now,
  setTimeout,
  clearTimeout
};

function scheduleSmartDiagnostics(schedules, file, trigger, run, getVersion, clock = defaultClock) {
  const now = clock.now();
  const schedule = schedules.get(file) || {
    timer: null,
    running: false,
    pending: false,
    trigger: null,
    burstStartedAt: 0,
    lastEventAt: 0,
    clock
  };
  schedule.clock = clock;
  const delay = diagnosticsDelay(schedule, trigger, now);

  schedule.lastEventAt = now;
  schedule.trigger = mergeDiagnosticTrigger(schedule.trigger, trigger);
  setDiagnosticsTimer(schedules, file, schedule, delay, run, getVersion, clock);
}

function diagnosticsDelay(schedule, trigger, now) {
  if (trigger === "save") {
    schedule.burstStartedAt = 0;
    return DIAGNOSTICS_SAVE_DELAY_MS;
  }
  if (trigger === "open") {
    schedule.burstStartedAt = 0;
    return DIAGNOSTICS_OPEN_DELAY_MS;
  }

  if (!schedule.burstStartedAt || now - schedule.lastEventAt > DIAGNOSTICS_IDLE_RESET_MS) {
    schedule.burstStartedAt = now;
    return DIAGNOSTICS_FIRST_CHANGE_DELAY_MS;
  }

  const elapsed = now - schedule.burstStartedAt;
  return Math.min(DIAGNOSTICS_CHANGE_DELAY_MS, Math.max(0, DIAGNOSTICS_MAX_WAIT_MS - elapsed));
}

function setDiagnosticsTimer(schedules, file, schedule, delay, run, getVersion, clock) {
  if (schedule.timer) {
    clock.clearTimeout(schedule.timer);
  }
  schedule.timer = clock.setTimeout(() => {
    runScheduledDiagnostics(schedules, file, run, getVersion, clock);
  }, delay);
  schedules.set(file, schedule);
}

async function runScheduledDiagnostics(schedules, file, run, getVersion, clock = defaultClock) {
  const schedule = schedules.get(file);
  if (!schedule) {
    return;
  }

  schedule.timer = null;
  if (schedule.running) {
    schedule.pending = true;
    return;
  }

  const version = getVersion(file);
  if (version === undefined || version === null) {
    schedules.delete(file);
    return;
  }

  const trigger = schedule.trigger || "change";
  schedule.trigger = null;
  schedule.running = true;
  if (trigger === "change") {
    const now = clock.now();
    schedule.burstStartedAt = now;
    schedule.lastEventAt = now;
  }

  try {
    await run(trigger, version);
  } finally {
    const latest = schedules.get(file);
    if (!latest) {
      return;
    }
    latest.running = false;
    if (latest.pending) {
      latest.pending = false;
      if (!latest.timer) {
        setDiagnosticsTimer(
          schedules,
          file,
          latest,
          latest.trigger === "save"
            ? DIAGNOSTICS_SAVE_DELAY_MS
            : latest.trigger === "open"
              ? DIAGNOSTICS_OPEN_DELAY_MS
              : DIAGNOSTICS_FIRST_CHANGE_DELAY_MS,
          run,
          getVersion,
          clock
        );
      }
    }
  }
}

function clearDiagnosticsSchedule(schedules, file) {
  const schedule = schedules.get(file);
  if (schedule?.timer) {
    (schedule.clock || defaultClock).clearTimeout(schedule.timer);
  }
  schedules.delete(file);
}

function clearDiagnosticsTimers(schedules) {
  for (const schedule of schedules.values()) {
    if (schedule.timer) {
      (schedule.clock || defaultClock).clearTimeout(schedule.timer);
    }
  }
  schedules.clear();
}

function mergeDiagnosticTrigger(current, next) {
  if (current === "save" || next === "save") {
    return "save";
  }
  if (current === "open" || next === "open") {
    return "open";
  }
  return next;
}

module.exports = {
  DIAGNOSTICS_FIRST_CHANGE_DELAY_MS,
  DIAGNOSTICS_CHANGE_DELAY_MS,
  DIAGNOSTICS_OPEN_DELAY_MS,
  DIAGNOSTICS_SAVE_DELAY_MS,
  DIAGNOSTICS_MAX_WAIT_MS,
  DIAGNOSTICS_IDLE_RESET_MS,
  scheduleSmartDiagnostics,
  clearDiagnosticsSchedule,
  clearDiagnosticsTimers
};
