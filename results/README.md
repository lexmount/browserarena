# November 10-11 comparison snapshot

This branch publishes the **2026-11-10** baseline and the **2026-11-11**
comparison batch.

- Session performance and browser throughput: all providers have files for
  both days. The Lexmount light/normal runs from November 10 are also archived
  under November 11, unchanged, so the November 11 rows stay full.
- Proxies: the retained files are from November 10 and November 11. Lexmount
  normal has November 11 only because that was its first verified US run.
- CAPTCHA: the November 10 and November 11 `west-v5` campaigns are published
  under their actual dates. The November 10 `lexmount-normal-r5` campaign is
  published under a November 11 publication ID. Original start/end times,
  source revisions, attempts and metrics are preserved; the runs table and
  exports still show actual execution times.

The batch date is a publication date, not a claim that all measurements ran on
the same day. Sample counts differ; Lexmount has concurrency-1 results only.
Providers without a November 11 run in a benchmark keep their November 10
baseline instead of borrowed data. November 12 partial results and other dated
artifacts, including legacy v0 and diagnostics, have been removed from this
branch; they remain recoverable from Git history. Regression tests keep frozen
aggregate calibration summaries under `web/lib/fixtures/`; these are test
inputs and are not published results.
