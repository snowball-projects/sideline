import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { samePublicationData, publicationNeeded } from "../scripts/publication.mjs";
import { fixture } from "./fixture.mjs";

test("only collection timestamps are ignored; source dates and published facts remain meaningful", () => {
  const live = fixture(), fresh = structuredClone(live);
  fresh.generated_at = "2026-11-03T12:00:00Z";
  for (const source of fresh.sources) source.retrieved_at = fresh.generated_at;
  assert.equal(samePublicationData(live, fresh), true);
  assert.equal(samePublicationData(live, Object.fromEntries(Object.entries(fresh).reverse())), true);
  for (const mutate of [
    data => data.injury_updated_at = "2026-11-03T11:00:00Z",
    data => data.sources[0].source_updated_at = "2026-11-03T11:00:00Z",
    data => data.sources[0].checked_on = "2026-11-03",
    data => data.weeks[0].teams.ARI.record = {wins:1, losses:0, ties:0},
    data => data.weeks[0].teams.ARI.report = !data.weeks[0].teams.ARI.report,
    data => data.weeks[0].teams.ARI.offense[0].players[0].name = "Changed starter",
    data => data.weeks.reverse(),
  ]) {
    const changed = structuredClone(fresh); mutate(changed);
    assert.equal(samePublicationData(live, changed), false);
  }
});

test("pushes always publish; scheduled and manual refreshes compare with the live JSON", async () => {
  assert.equal(await publicationNeeded({event:"push", current:"absent.json", fetchImpl:() => assert.fail("push must not fetch live data")}), true);
  const directory = await mkdtemp(join(tmpdir(), "sideline-publication-"));
  try {
    const output = join(directory, "outputs");
    execFileSync(process.execPath, [new URL("../scripts/publication.mjs", import.meta.url).pathname], {
      env:{...process.env, GITHUB_EVENT_NAME:"push", GITHUB_OUTPUT:output},
    });
    assert.equal(await readFile(output,"utf8"), "deploy=true\n");
    const current = join(directory, "current.json"), live = fixture(), fresh = structuredClone(live);
    fresh.generated_at = "2026-11-03T12:00:00Z";
    await writeFile(current, JSON.stringify(fresh));
    const fetchImpl = async (url, options) => {
      assert.equal(url, "https://snowball-projects.github.io/sideline/current.json");
      assert.equal(options.cache, "no-store");
      return Response.json(live);
    };
    for (const event of ["schedule", "workflow_dispatch"]) assert.equal(await publicationNeeded({event,current,fetchImpl}), false);
    live.weeks[0].stats_through = 4;
    assert.equal(await publicationNeeded({event:"schedule",current,fetchImpl}), true);
    await assert.rejects(publicationNeeded({event:"schedule",current,fetchImpl:async()=>new Response("Unavailable",{status:503})}), /HTTP 503/);
    await assert.rejects(publicationNeeded({event:"schedule",current,fetchImpl:async()=>new Response("not JSON")}), SyntaxError);
    await assert.rejects(publicationNeeded({event:"schedule",current,fetchImpl:async()=>{throw new Error("Network unavailable");}}), /Network unavailable/);
  } finally { await rm(directory, {recursive:true,force:true}); }
});
