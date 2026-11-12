# November 11 comparison snapshot

This branch publishes the **2026-11-11** comparison batch.

- Session performance and browser throughput: all providers, including
  Lexmount light/normal, have November 11 files.
- Proxies: all providers have November 11 files. Lexmount light and normal
  both use the official proxy's default US egress; the light suite contains
  20 attempts.
- CAPTCHA: the November 11 `west-v5` campaign is the real November 11 run.
  The November 10 `lexmount-normal-r5` campaign is published under a November
  11 publication ID; its original start/end times, source revision, attempts
  and metrics are preserved.

The batch date is a publication date, not a claim that all measurements ran on
the same day. Sample counts differ; Lexmount has concurrency-1 browser results
only. November 12 and other dated artifacts, including legacy v0 and
diagnostics, have been removed from this branch; they remain recoverable from
Git history. Regression tests keep frozen aggregate calibration summaries
under `web/lib/fixtures/`; these are test inputs and are not published results.
