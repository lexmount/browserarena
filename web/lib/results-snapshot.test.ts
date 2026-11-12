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
const dates = ["2026-11-10", date];

test("public result files belong only to the retained November 10-11 snapshot", () => {
  for (const file of fs.readdirSync(results, { recursive: true }) as string[]) {
    for (const part of file.split(path.sep)) {
      if (/^\d{4}-\d{2}-\d{2}/.test(part)) assert.ok(dates.includes(part.slice(0, 10)), file);
    }
  }
});

test("default lifecycle and throughput results include both Lexmount modes and competitors", async () => {
  const lifecycle = await loadLeaderboard();
  assert.deepEqual(lifecycle.metadata.availableDates, dates);
  for (const provider of ["LEXMOUNT_NORMAL", "LEXMOUNT_LIGHT", "NOTTE"]) {
    assert.ok(lifecycle.providers.some(row => row.provider === provider), provider);
  }
  const history = await loadHistoricalLeaderboard("hello-browser", 1);
  assert.deepEqual(history.dates, dates);
  const throughput = await loadPublishedBrowserThroughput(1);
  assert.equal(throughput.publication.selectedDate, date);
  for (const provider of ["LEXMOUNT_NORMAL", "LEXMOUNT_LIGHT", "NOTTE"]) {
    assert.ok(throughput.leaderboard.providers.some(row => row.provider === provider), provider);
  }
});

test("November 11 CAPTCHA publication compares real attempts without changing execution times", async () => {
  const campaigns = await loadCaptchaCampaigns(path.join(results, "captcha"));
  assert.equal(campaigns.length, 3);
  const baseline = campaigns.filter(campaign => captchaRunDate(campaign) === "2026-11-10");
  const current = campaigns.filter(campaign => captchaRunDate(campaign) === date);
  assert.equal(baseline.length, 1);
  assert.equal(current.length, 2);
  const lexmount = current.find(campaign => campaign.id.includes("lexmount-normal-r5"));
  assert.ok(lexmount);
  assert.ok(lexmount.started_at.startsWith("2026-11-10"));
  const combined = { ...current[0], providers: [...new Set(current.flatMap(campaign => campaign.providers))],
    attempts: current.flatMap(campaign => campaign.attempts) };
  const rows = captchaLeaderboard(combined, current.flatMap(campaignCells), captchaColumns(combined), {});
  for (const provider of ["lexmount-normal", "notte"]) {
    assert.ok(rows.some(row => row.provider === provider && row.attempted > 0), provider);
  }
});
