// Operator-side one-iteration job. Never imported by the browser or collector.
import { mkdir, open, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export const TARGET = Object.freeze({
  feed: "https://snowball-projects.github.io/sideline/current.json",
  workflow:
    "https://api.github.com/repos/snowball-projects/sideline/actions/workflows/tests.yml",
  branch: "main",
});
const ACTIVE = ["queued", "in_progress", "waiting", "pending", "requested"];
const MINUTE = 60_000;
const COOLDOWN = 45 * MINUTE;
const MAX_BODY = 4 * 1024 * 1024;

export class WatchdogError extends Error {
  constructor(code, { status, retryMs = 0, retryable = false } = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryMs = retryMs;
    this.retryable = retryable;
  }
}
const fail = (code, detail) => {
  throw new WatchdogError(code, detail);
};
const timestamp = (value, now, code) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)
  )
    fail(code);
  const ms = Date.parse(value);
  if (
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19) ||
    ms > now + 5 * MINUTE
  )
    fail(code);
  return ms;
};

/** Bounded HTTPS transport: no redirects, raw error bodies, or token on feed GETs. */
export function createTransport({
  token,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  return async (url, { method = "GET", timeoutMs = 10_000, body } = {}) => {
    const api = url.startsWith(`${TARGET.workflow}/`);
    if (url !== TARGET.feed && !api) fail("target_rejected");
    const headers = { Accept: "application/json", "Cache-Control": "no-cache" };
    if (api) {
      headers.Accept = "application/vnd.github+json";
      headers["X-GitHub-Api-Version"] = "2026-03-10";
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (body) headers["Content-Type"] = "application/json";
    try {
      const response = await fetchImpl(url, {
        method,
        headers,
        body: body && JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const after = response.headers.get("retry-after");
        const reset = response.headers.get("x-ratelimit-reset");
        let retryMs = /^\d+$/.test(after || "")
          ? Number(after) * 1000
          : after
            ? Math.max(0, Date.parse(after) - now())
            : 0;
        if (
          response.headers.get("x-ratelimit-remaining") === "0" &&
          /^\d+$/.test(reset || "")
        )
          retryMs = Math.max(retryMs, Number(reset) * 1000 - now());
        const limited =
          response.status === 429 ||
          (response.status === 403 &&
            (after || response.headers.get("x-ratelimit-remaining") === "0"));
        fail("http_error", {
          status: response.status,
          retryMs: Number.isFinite(retryMs) ? retryMs : 0,
          retryable: Boolean(limited || response.status >= 500),
        });
      }
      if (response.status === 204) return null;
      if (Number(response.headers.get("content-length")) > MAX_BODY) {
        await response.body?.cancel();
        fail("response_too_large");
      }
      if (!response.body) fail("invalid_response");
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BODY) {
            await reader.cancel();
            fail("response_too_large");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        fail("invalid_response");
      }
    } catch (error) {
      if (error instanceof WatchdogError) throw error;
      // Fetch/stream errors may contain request headers, URLs or response data.
      fail("transport_unavailable", { retryable: true });
    }
  };
}

/** A single host owns this state. Managed runners need an equivalent shared lease. */
export function fileState(path) {
  const filename = resolve(path);
  const lock = `${filename}.lock`;
  return {
    async acquire() {
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
      try {
        await mkdir(lock, { mode: 0o700 });
        return true;
      } catch (error) {
        if (error.code === "EEXIST") return false;
        throw error;
      }
    },
    async release() {
      await rmdir(lock);
    },
    async read() {
      let handle;
      try {
        handle = await open(filename, "r");
        const buffer = Buffer.alloc(4097);
        const { bytesRead } = await handle.read(buffer);
        if (bytesRead > 4096) fail("invalid_state");
        return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        fail("invalid_state");
      } finally {
        await handle?.close();
      }
    },
    async write(state) {
      const temporary = `${filename}.${randomUUID()}.pending`;
      try {
        await writeFile(temporary, `${JSON.stringify(state)}\n`, {
          mode: 0o600,
          flag: "wx",
        });
        await rename(temporary, filename);
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
}

/** Safeguards are scheduler-neutral; tests replace transport, time and state. */
export async function runWatchdog({
  dispatch = false,
  token,
  state,
  maxAgeMinutes = 90,
  waitMinutes = 20,
  request = createTransport({ token }),
  now = Date.now,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  report = () => {},
} = {}) {
  let locked = false;
  let attempted = false;
  let baseline;
  let phase = "configuration";
  let runId;
  const started = now();
  const deadline = started + waitMinutes * MINUTE;
  const result = (outcome, reason, extra = {}) => ({
    job: "sideline-freshness",
    outcome,
    reason,
    checked_at: new Date(now()).toISOString(),
    dispatch_attempted: attempted,
    ...(baseline === undefined
      ? {}
      : { generated_at: new Date(baseline).toISOString() }),
    ...(runId === undefined ? {} : { run_id: runId }),
    ...extra,
  });
  const remaining = () => {
    const ms = deadline - now();
    if (ms <= 0) fail("deadline_exceeded");
    return ms;
  };
  const pause = async (ms) => {
    if (ms >= remaining()) fail("deadline_exceeded");
    await sleep(ms);
  };
  const get = async (url) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await request(url, { timeoutMs: Math.min(10_000, remaining()) });
      } catch (error) {
        if (
          !(error instanceof WatchdogError) ||
          !error.retryable ||
          attempt === 2
        )
          throw error;
        await pause(Math.max([1000, 3000][attempt], error.retryMs));
      }
    }
  };
  const feed = async () => {
    phase = "feed";
    const data = await get(TARGET.feed);
    if (data?.schema_version !== 2 || data.mode !== "live")
      fail("invalid_feed");
    return timestamp(data.generated_at, now(), "invalid_feed_timestamp");
  };
  const busy = async () => {
    phase = "workflow_inspection";
    for (const status of ACTIVE) {
      // Query each active status explicitly: an old blocked run must not hide
      // beyond the first page of newer completed runs. Never infer absence
      // from truncated history. Fail closed when a status cannot be inspected.
      const data = await get(
        `${TARGET.workflow}/runs?branch=${TARGET.branch}&status=${status}&per_page=100`,
      );
      if (
        !Number.isSafeInteger(data?.total_count) ||
        data.total_count < 0 ||
        !Array.isArray(data.workflow_runs)
      )
        fail("invalid_workflow_response");
      for (const run of data.workflow_runs) {
        if (
          !Number.isSafeInteger(run.id) ||
          run.id <= 0 ||
          typeof run.status !== "string" ||
          typeof run.head_branch !== "string" ||
          typeof run.event !== "string"
        )
          fail("invalid_workflow_response");
        if (
          run.head_branch === TARGET.branch &&
          run.event !== "pull_request" &&
          run.status !== "completed"
        )
          return run.id;
      }
      if (data.total_count > data.workflow_runs.length)
        fail("incomplete_workflow_inspection");
    }
    return null;
  };
  try {
    if (
      !Number.isFinite(maxAgeMinutes) ||
      maxAgeMinutes < 60 ||
      maxAgeMinutes > 1440 ||
      !Number.isFinite(waitMinutes) ||
      waitMinutes < 1 ||
      waitMinutes > 30
    )
      fail("invalid_configuration");
    if (dispatch) {
      if (
        typeof token !== "string" ||
        !token ||
        /\s/.test(token) ||
        token.length > 4096
      )
        fail("missing_or_invalid_credential");
      if (!state) fail("state_required");
      phase = "state";
      locked = await state.acquire();
      if (!locked) return result("skipped-busy", "another_watchdog_owns_state");
    }
    baseline = await feed();
    if (now() - baseline <= maxAgeMinutes * MINUTE)
      return result("noop", "collection_current");
    const active = await busy();
    if (active)
      return result("skipped-busy", "workflow_active", { run_id: active });
    if (!dispatch) return result("noop", "dry_run_would_dispatch");
    phase = "state";
    const previous = await state.read();
    if (previous !== null) {
      if (previous.version !== 1) fail("invalid_state");
      const lastAttempt = timestamp(
        previous.attempted_at,
        now(),
        "invalid_state",
      );
      if (now() - lastAttempt < COOLDOWN)
        return result("skipped-busy", "recent_dispatch_intent");
    }
    // Recheck immediately before the mutation: publication or another run may
    // have arrived during inspection. GitHub offers no atomic check+dispatch.
    const latest = await feed();
    if (latest < baseline) fail("publication_regressed");
    if (now() - latest <= maxAgeMinutes * MINUTE)
      return result("noop", "collection_current");
    baseline = latest;
    const competing = await busy();
    if (competing)
      return result("skipped-busy", "workflow_active", { run_id: competing });
    phase = "state";
    // Durable intent precedes POST, protecting subsequent invocations when
    // the server accepted a request but the response was lost. Never retry POST.
    await state.write({
      version: 1,
      attempted_at: new Date(now()).toISOString(),
    });
    phase = "dispatch";
    attempted = true;
    let uncertain = false;
    try {
      const accepted = await request(`${TARGET.workflow}/dispatches`, {
        method: "POST",
        body: { ref: TARGET.branch },
        timeoutMs: Math.min(10_000, remaining()),
      });
      if (accepted !== null) {
        if (
          !Number.isSafeInteger(accepted?.workflow_run_id) ||
          accepted.workflow_run_id <= 0
        )
          fail("invalid_dispatch_response");
        runId = accepted.workflow_run_id;
      }
    } catch (error) {
      // A failed/invalid response can follow a successful enqueue. Verify the
      // feed instead of blindly retrying the mutation, including HTTP 5xx.
      if (
        !(error instanceof WatchdogError) ||
        (error.code === "http_error" && !error.retryable)
      )
        throw error;
      uncertain = true;
    }
    report(
      result(
        "dispatched",
        uncertain ? "dispatch_response_uncertain" : "awaiting_publication",
      ),
    );
    for (let poll = 0; poll < 20; poll++) {
      phase = "publication_verification";
      const delay = Math.min(120_000, 30_000 * 2 ** poll);
      if (delay >= remaining()) fail("publication_not_verified");
      await pause(delay);
      const published = await feed();
      if (published < baseline) fail("publication_regressed");
      if (published > baseline && now() - published <= maxAgeMinutes * MINUTE)
        return result("verified", "publication_advanced", {
          generated_at: new Date(published).toISOString(),
        });
    }
    fail("publication_not_verified");
  } catch (error) {
    return result(
      "failed",
      error instanceof WatchdogError ? error.code : "operation_failed",
      {
        phase,
        ...(error instanceof WatchdogError && error.status
          ? { http_status: error.status }
          : {}),
      },
    );
  } finally {
    if (locked) {
      try {
        await state.release();
      } catch {
        return result("failed", "state_release_failed", { phase: "state" });
      }
    }
  }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  try {
    const options = {
      dispatch: false,
      token: env.SIDELINE_GITHUB_TOKEN,
      report: (value) => console.log(JSON.stringify(value)),
    };
    let mode;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--dry-run" || arg === "--dispatch") {
        if (mode) fail("invalid_arguments");
        mode = arg;
        options.dispatch = arg === "--dispatch";
      } else if (
        ["--state-file", "--max-age-minutes", "--wait-minutes"].includes(arg)
      ) {
        const value = args[++i];
        if (!value || value.startsWith("--")) fail("invalid_arguments");
        if (arg === "--state-file") {
          if (!isAbsolute(value)) fail("invalid_arguments");
          options.state = fileState(value);
        } else
          options[
            arg === "--max-age-minutes" ? "maxAgeMinutes" : "waitMinutes"
          ] = Number(value);
      } else fail("invalid_arguments");
    }
    const output = await runWatchdog(options);
    console.log(JSON.stringify(output));
    return output.outcome === "failed" ? 1 : 0;
  } catch {
    console.log(
      JSON.stringify({
        job: "sideline-freshness",
        outcome: "failed",
        reason: "invalid_arguments_or_state",
      }),
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = await main();
