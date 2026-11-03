import { appendFile, readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

export function samePublicationData(left, right) {
  const content = ({ generated_at, sources, ...data }) => ({
    ...data,
    sources: sources.map(({ retrieved_at, ...source }) => source),
  });
  return isDeepStrictEqual(content(left), content(right));
}

export async function publicationNeeded({
  event = process.env.GITHUB_EVENT_NAME,
  current = new URL("../web/current.json", import.meta.url),
  fetchImpl = fetch,
} = {}) {
  // Source pushes publish code even when the collected data have not changed.
  if (event === "push") return true;
  const fresh = JSON.parse(await readFile(current, "utf8"));
  const response = await fetchImpl("https://snowball-projects.github.io/sideline/current.json", {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Live data comparison: HTTP ${response.status}`);
  return !samePublicationData(fresh, await response.json());
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const deploy = await publicationNeeded();
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
  console.log(deploy ? "Publication needed" : "Data unchanged apart from collection timestamps; publication skipped");
}
