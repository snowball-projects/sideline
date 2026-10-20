import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createTransport,
  fileState,
  runWatchdog,
  TARGET,
  WatchdogError,
} from "../scripts/freshness-watchdog.mjs";

const START = Date.parse("2026-10-13T16:00:00Z");
const OLD = "2026-10-13T11:54:41.110Z";
const current = (generated_at = OLD) => ({
  schema_version: 2,
  mode: "live",
  generated_at,
});
const empty = () => ({ total_count: 0, workflow_runs: [] });
const active = (status, overrides = {}) => ({
  total_count: 1,
  workflow_runs: [
    { id: 42, status, head_branch: "main", event: "schedule", ...overrides },
  ],
});

function harness(overrides = {}) {
  let clock = START,
    saved = null,
    owned = false;
  const calls = [],
    delays = [],
    events = [];
  const state = {
    acquire: async () => {
      if (owned) return false;
      owned = true;
      return true;
    },
    release: async () => {
      owned = false;
    },
    read: async () => saved,
    write: async (value) => {
      saved = value;
    },
  };
  const options = {
    dispatch: true,
    token: "fake_credential",
    state,
    now: () => clock,
    sleep: async (ms) => {
      delays.push(ms);
      clock += ms;
    },
    report: (value) => events.push(value),
    request: async (url, options = {}) => {
      calls.push({ url, ...options });
      if (options.method === "POST") return { workflow_run_id: 99 };
      return url === TARGET.feed ? current() : empty();
    },
    ...overrides,
  };
  return {
    options,
    calls,
    delays,
    events,
    state,
    saved: () => saved,
    clock: () => clock,
  };
}

test("fresh feed is a credential-free GET-only noop; dry-run does not acquire/write state", async () => {
  const h = harness({
    dispatch: false,
    token: undefined,
    state: { acquire: () => assert.fail("dry-run state write") },
    request: async (url) => {
      assert.equal(url, TARGET.feed);
      return current("2026-10-13T15:00:00Z");
    },
  });
  const result = await runWatchdog(h.options);
  assert.equal(result.outcome, "noop");
  assert.equal(result.reason, "collection_current");
  const overdue = harness({ dispatch: false, token: undefined });
  assert.equal(
    (await runWatchdog(overdue.options)).reason,
    "dry_run_would_dispatch",
  );
  assert.equal(overdue.calls.length, 6);
  assert.ok(overdue.calls.every((call) => !call.method));
  assert.equal(overdue.saved(), null);
});

test("every active main status blocks dispatch, including old runs hidden by completed history", async () => {
  for (const status of [
    "queued",
    "in_progress",
    "waiting",
    "pending",
    "requested",
  ]) {
    const h = harness({
      request: async (url, options = {}) => {
        assert.notEqual(options.method, "POST");
        return url === TARGET.feed
          ? current()
          : new URL(url).searchParams.get("status") === status
            ? active(status)
            : empty();
      },
    });
    const output = await runWatchdog(h.options);
    assert.equal(output.outcome, "skipped-busy");
    assert.equal(output.run_id, 42);
    assert.equal(h.saved(), null);
  }
});

test("uninspected/truncated workflow state fails closed, rather than treating absence as idle", async () => {
  for (const response of [
    null,
    { total_count: 1, workflow_runs: [] },
    { total_count: 1, workflow_runs: [{}] },
  ]) {
    const h = harness({
      request: async (url, options) => {
        assert.notEqual(options?.method, "POST");
        return url === TARGET.feed ? current() : response;
      },
    });
    assert.equal((await runWatchdog(h.options)).outcome, "failed");
    assert.equal(h.saved(), null);
  }
});

test("pull-request or another branch does not prevent a safe main refresh", async () => {
  const h = harness({
    dispatch: false,
    request: async (url) =>
      url === TARGET.feed
        ? current()
        : new URL(url).searchParams.get("status") === "queued"
          ? active("queued", { event: "pull_request" })
          : active("in_progress", { head_branch: "other" }),
  });
  assert.equal((await runWatchdog(h.options)).reason, "dry_run_would_dispatch");
});

test("final feed/run checks catch publication and competing runs arriving during initial inspection", async () => {
  for (const race of ["feed", "run"]) {
    let feeds = 0,
      inspections = 0;
    const h = harness({
      request: async (url, options) => {
        assert.notEqual(options?.method, "POST");
        if (url === TARGET.feed)
          return current(
            ++feeds === 2 && race === "feed" ? "2026-10-13T16:00:00Z" : OLD,
          );
        return ++inspections === 6 && race === "run"
          ? active("queued")
          : empty();
      },
    });
    const output = await runWatchdog(h.options);
    assert.equal(output.outcome, race === "feed" ? "noop" : "skipped-busy");
    assert.equal(h.saved(), null);
  }
});

test("writes intent before exactly one dispatch and verifies a fresh advancing public timestamp", async () => {
  const h = harness();
  let feeds = 0,
    posts = 0;
  h.options.request = async (url, options = {}) => {
    if (options.method === "POST") {
      posts++;
      assert.deepEqual(options.body, { ref: "main" });
      assert.ok(h.saved()?.attempted_at);
      return { workflow_run_id: 99 };
    }
    return url === TARGET.feed
      ? current(++feeds >= 4 ? "2026-10-13T16:00:30Z" : OLD)
      : empty();
  };
  const output = await runWatchdog(h.options);
  assert.equal(output.outcome, "verified");
  assert.equal(output.run_id, 99);
  assert.equal(posts, 1);
  assert.deepEqual(h.delays, [30_000, 60_000]);
  assert.equal(h.events[0].outcome, "dispatched");
  assert.ok(
    !JSON.stringify([output, h.events, h.saved()]).includes("fake_credential"),
  );
});

test("HTTP acknowledgement without fresh publication fails within the total deadline", async () => {
  const h = harness({ waitMinutes: 1 });
  const output = await runWatchdog(h.options);
  assert.equal(output.outcome, "failed");
  assert.equal(output.reason, "publication_not_verified");
  assert.equal(output.dispatch_attempted, true);
  assert.ok(h.clock() - START < 60_000);
  assert.equal(h.calls.filter((call) => call.method === "POST").length, 1);
});

test("lost POST response is not retried; eventual publication can still verify", async () => {
  const h = harness();
  let feeds = 0,
    posts = 0;
  h.options.request = async (url, options = {}) => {
    if (options.method === "POST") {
      posts++;
      throw new WatchdogError("transport_unavailable", { retryable: true });
    }
    return url === TARGET.feed
      ? current(++feeds >= 3 ? "2026-10-13T16:00:10Z" : OLD)
      : empty();
  };
  assert.equal((await runWatchdog(h.options)).outcome, "verified");
  assert.equal(posts, 1);
  assert.equal(h.events[0].reason, "dispatch_response_uncertain");
});

test("ambiguous mutation/failure retains cooldown across subsequent invocations", async () => {
  const h = harness({ waitMinutes: 1 });
  let posts = 0;
  h.options.request = async (url, options = {}) => {
    if (options.method === "POST") {
      posts++;
      throw new WatchdogError("http_error", { status: 503, retryable: true });
    }
    return url === TARGET.feed ? current() : empty();
  };
  assert.equal((await runWatchdog(h.options)).outcome, "failed");
  assert.equal((await runWatchdog(h.options)).reason, "recent_dispatch_intent");
  assert.equal(posts, 1);
  await h.options.sleep(45 * 60_000);
  await runWatchdog(h.options);
  assert.equal(posts, 2);
});

test("legacy 204 dispatch response verifies through the feed without a run ID", async () => {
  const h = harness();
  let feeds = 0;
  h.options.request = async (url, options = {}) =>
    options.method === "POST"
      ? null
      : url === TARGET.feed
        ? current(++feeds >= 3 ? "2026-10-13T16:00:10Z" : OLD)
        : empty();
  const output = await runWatchdog(h.options);
  assert.equal(output.outcome, "verified");
  assert.equal(output.run_id, undefined);
});

test("invalid, fictional, future or regressing feed never triggers or verifies publication", async () => {
  for (const response of [
    null,
    { generated_at: OLD },
    { ...current(), mode: "example" },
    current("2026-02-30T00:00:00Z"),
    current("tomorrow"),
    current("2026-10-13T17:00:00Z"),
  ]) {
    const h = harness({ request: async () => response });
    assert.equal((await runWatchdog(h.options)).outcome, "failed");
    assert.equal(h.saved(), null);
  }
  const h = harness();
  let feeds = 0;
  h.options.request = async (url, options = {}) =>
    options.method === "POST"
      ? { workflow_run_id: 99 }
      : url === TARGET.feed
        ? current(++feeds >= 3 ? "2026-10-12T11:54:41Z" : OLD)
        : empty();
  assert.equal((await runWatchdog(h.options)).reason, "publication_regressed");
});

test("transient GETs back off a bounded number of times; retry-after cannot exceed budget", async () => {
  let attempts = 0;
  const h = harness({
    dispatch: false,
    request: async () => {
      if (++attempts < 3)
        throw new WatchdogError("http_error", { status: 503, retryable: true });
      return current("2026-10-13T16:00:00Z");
    },
  });
  assert.equal((await runWatchdog(h.options)).outcome, "noop");
  assert.deepEqual(h.delays, [1000, 3000]);
  for (const retryMs of [0, 120_000]) {
    let failedCalls = 0;
    const failure = harness({
      dispatch: false,
      waitMinutes: 1,
      request: async () => {
        failedCalls++;
        throw new WatchdogError("http_error", {
          status: 429,
          retryable: true,
          retryMs,
        });
      },
    });
    assert.equal((await runWatchdog(failure.options)).outcome, "failed");
    assert.equal(failedCalls, retryMs ? 1 : 3);
  }
});

test("credentials/configuration/state faults fail closed and omit raw exception/credential text", async () => {
  for (const settings of [
    { token: undefined },
    { state: undefined },
    { maxAgeMinutes: 0 },
    { waitMinutes: Infinity },
  ]) {
    const h = harness(settings);
    h.options.request = () =>
      assert.fail("invalid configuration made network request");
    assert.equal((await runWatchdog(h.options)).outcome, "failed");
  }
  const h = harness({
    request: async () => {
      throw new Error("Authorization: Bearer private_secret\nresponse payload");
    },
  });
  const output = await runWatchdog(h.options);
  assert.equal(output.reason, "operation_failed");
  assert.ok(!JSON.stringify(output).includes("private_secret"));
  h.state.read = async () => ({ version: 9, attempted_at: "private_secret" });
  h.options.request = async (url) =>
    url === TARGET.feed ? current() : empty();
  assert.equal((await runWatchdog(h.options)).reason, "invalid_state");
  assert.equal(h.saved(), null);
  h.state.read = async () => null;
  h.state.write = async () => {
    throw new Error("private_secret");
  };
  assert.equal((await runWatchdog(h.options)).reason, "operation_failed");
});

test("real file state excludes concurrent invocations and preserves private durable intent", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sideline-watchdog-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "state.json"),
    first = fileState(path),
    second = fileState(path);
  assert.equal(await first.acquire(), true);
  const h = harness({ state: second });
  assert.equal(
    (await runWatchdog(h.options)).reason,
    "another_watchdog_owns_state",
  );
  assert.equal(h.calls.length, 0);
  await first.write({
    version: 1,
    attempted_at: new Date(START).toISOString(),
  });
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await first.release();
  assert.equal((await runWatchdog(h.options)).reason, "recent_dispatch_intent");
  assert.equal(JSON.parse(await readFile(path, "utf8")).version, 1);
  await writeFile(path, "broken private_secret");
  assert.equal((await runWatchdog(h.options)).reason, "invalid_state");
});

test("HTTP transport separates credentials, enforces HTTPS targets/redirect rejection, and sanitizes failures", async () => {
  const calls = [];
  const request = createTransport({
    token: "private_secret",
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      return Response.json(empty());
    },
  });
  await request(TARGET.feed);
  await request(`${TARGET.workflow}/runs`);
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[1].headers.Authorization, "Bearer private_secret");
  assert.equal(calls[1].headers["X-GitHub-Api-Version"], "2026-03-10");
  assert.equal(calls[1].redirect, "error");
  assert.ok(calls[1].signal instanceof AbortSignal);
  await assert.rejects(request("https://other.example/"), {
    code: "target_rejected",
  });
  const failure = createTransport({
    fetchImpl: async () => {
      throw new Error("private_secret");
    },
  });
  await assert.rejects(failure(TARGET.feed), {
    code: "transport_unavailable",
    message: "transport_unavailable",
  });
});

test("HTTP transport caps body reads and honors rate-limit timing without exposing server bodies", async () => {
  for (const response of [
    new Response("x".repeat(4 * 1024 * 1024 + 1)),
    new Response("x", { headers: { "content-length": "9999999" } }),
  ]) {
    const request = createTransport({ fetchImpl: async () => response });
    await assert.rejects(request(TARGET.feed), { code: "response_too_large" });
  }
  const request = createTransport({
    now: () => START,
    fetchImpl: async () =>
      new Response("private_secret", {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(START / 1000 + 100),
        },
      }),
  });
  await assert.rejects(request(`${TARGET.workflow}/runs`), {
    code: "http_error",
    status: 403,
    retryable: true,
    retryMs: 100_000,
  });
});

test("CLI invalid flags and unapproved dispatch fail before network or state mutation", () => {
  const script = new URL("../scripts/freshness-watchdog.mjs", import.meta.url);
  for (const args of [
    ["--dispatch"],
    ["--dispatch", "--dry-run"],
    ["--unknown-private_secret"],
  ]) {
    const env = { ...process.env };
    delete env.SIDELINE_GITHUB_TOKEN;
    const child = spawnSync(process.execPath, [script.pathname, ...args], {
      env,
      encoding: "utf8",
      timeout: 3000,
    });
    assert.equal(child.status, 1);
    assert.equal(JSON.parse(child.stdout).outcome, "failed");
    assert.ok(!child.stdout.includes("private_secret"));
    assert.equal(child.stderr, "");
  }
});
