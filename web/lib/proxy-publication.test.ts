import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { GET } from "../app/api/proxy-get/route";
import { loadProxyGetEntries } from "./proxy-get";
import { loadProxyGetHistory, summarizeProxyGetHistory } from "./proxy-get-history";

const results = fileURLToPath(new URL("../../results", import.meta.url));

test("published proxy index lists exactly the retained November 11 results", () => {
  const base = path.join(results, "proxy-get");
  const index = JSON.parse(fs.readFileSync(path.join(base, "index.json"), "utf8"));
  const providers = fs.readdirSync(base, { withFileTypes: true }).filter(item => item.isDirectory())
    .map(item => ({
      name: item.name,
      dates: fs.readdirSync(path.join(base, item.name), { withFileTypes: true })
        .filter(day => day.isDirectory() && fs.existsSync(path.join(base, item.name, day.name, "results.jsonl")))
        .map(day => day.name).sort(),
    }))
    .filter(provider => provider.dates.length)
    .sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(index.version, 1);
  assert.deepEqual(index.providers, providers);
  assert.deepEqual(providers.find(provider => provider.name === "lexmount-light")?.dates, ["2026-11-11"]);
  assert.deepEqual(providers.find(provider => provider.name === "lexmount-normal")?.dates, ["2026-11-11"]);
  assert.deepEqual(providers.find(provider => provider.name === "notte")?.dates, ["2026-11-11"]);
});

test("default proxy history and exports compare Lexmount with the retained providers", async () => {
  const previous = process.env.RESULTS_DIR;
  process.env.RESULTS_DIR = results;
  try {
    const entries = await loadProxyGetEntries(true);
    const history = summarizeProxyGetHistory(entries, "US");
    assert.deepEqual(history.dates, ["2026-11-11"]);
    assert.equal(history.selectedDate, "2026-11-11");
    assert.ok(history.overview.providers.some(row => row.provider === "LEXMOUNT_LIGHT" && row.attempts > 0));
    assert.ok(history.overview.providers.some(row => row.provider === "LEXMOUNT_NORMAL" && row.attempts > 0));
    assert.ok(history.overview.providers.some(row => row.provider === "NOTTE" && row.attempts > 0));
    for (const country of ["US", "FR", "BR", "IN", "JP"]) {
      const response = await GET(new Request(`https://example.test/api/proxy-get?country=${country}&view=overview`));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), (await loadProxyGetHistory(country)).overview);
    }
  } finally {
    if (previous === undefined) delete process.env.RESULTS_DIR;
    else process.env.RESULTS_DIR = previous;
  }
});
