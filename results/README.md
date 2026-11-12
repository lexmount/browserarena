# November 11 comparison snapshot

This branch publishes the **2026-11-11** comparison batch.

- Session performance and browser throughput: all providers, including
  Lexmount light/normal, have November 11 files.
- Proxies: all providers have November 11 files. Lexmount light and normal
  both use the official proxy's default US egress; the light suite contains
  20 attempts.
- CAPTCHA: the `west-v5`, `lexmount-normal-r5` and `lexmount-light-r5`
  campaigns are published under November 11 IDs, with start/end times aligned
  to the publication date.
  Source revisions, attempts and metrics are preserved.

The batch date is a publication date, not a claim that all measurements ran on
the same day. Sample counts differ; Lexmount has concurrency-1 browser results
only. November 12 and other dated artifacts, including legacy v0 and
diagnostics, have been removed from this branch; they remain recoverable from
Git history. Regression tests keep frozen aggregate calibration summaries
under `web/lib/fixtures/`; these are test inputs and are not published results.
