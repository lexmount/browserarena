import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadHistoricalLeaderboard, loadLeaderboard } from "./data";
import { loadPublishedBrowserThroughput } from "./browser-throughput-data";
import { captchaRunDate, loadCaptchaCampaigns } from "./captcha-data";
import { campaignCells } from "../../src/benchmarks/captcha/publication";
import { captchaColumns, captchaLeaderboard } from "./captcha-leaderboard";

const results = fileURLToPath(new URL("../../results", import.meta.url));
const date = "2026-11-11";

test("public result files belong only to the November 11 snapshot", () => {
  for (const file of fs.readdirSync(results, { recursive: true }) as string[]) {
    for (const part of file.split(path.sep)) {
      if (/^\d{4}-\d{2}-\d{2}/.test(part)) assert.equal(part.slice(0, 10), date, file);
    }
  }
});

test("default lifecycle and throughput results include both Lexmount modes and competitors", async () => {
  const lifecycle = await loadLeaderboard();
  assert.deepEqual(lifecycle.metadata.availableDates, [date]);
  for (const provider of ["LEXMOUNT_NORMAL", "LEXMOUNT_LIGHT", "NOTTE"]) {
    assert.ok(lifecycle.providers.some(row => row.provider === provider), provider);
  }
  const history = await loadHistoricalLeaderboard("hello-browser", 1);
  assert.deepEqual(history.dates, [date]);
  const throughput = await loadPublishedBrowserThroughput(1);
  assert.equal(throughput.publication.selectedDate, date);
  for (const provider of ["LEXMOUNT_NORMAL", "LEXMOUNT_LIGHT", "NOTTE"]) {
    assert.ok(throughput.leaderboard.providers.some(row => row.provider === provider), provider);
  }
});

test("November 11 CAPTCHA publication compares real attempts without changing execution times", async () => {
  const campaigns = await loadCaptchaCampaigns(path.join(results, "captcha"));
  assert.equal(campaigns.length, 2);
  assert.ok(campaigns.every(campaign => captchaRunDate(campaign) === date));
  assert.ok(campaigns.every(campaign => campaign.started_at.startsWith("2026-11-10")));
  const combined = { ...campaigns[0], providers: [...new Set(campaigns.flatMap(campaign => campaign.providers))],
    attempts: campaigns.flatMap(campaign => campaign.attempts) };
  const rows = captchaLeaderboard(combined, campaigns.flatMap(campaignCells), captchaColumns(combined), {});
  for (const provider of ["lexmount-normal", "notte"]) {
    assert.ok(rows.some(row => row.provider === provider && row.attempted > 0), provider);
  }
});
