# November 11 comparison snapshot

This branch publishes only the **2026-11-11** comparison batch.

- Session performance and browser throughput: the Lexmount light/normal files
  from `2026-11-10` are archived under `2026-11-11`, unchanged. No November 9
  Lexmount results were present. Other providers retain their November 11 files.
- Proxies: all retained files, including Lexmount normal, are from November 11.
- CAPTCHA: the November 10 `west-v5` and `lexmount-normal-r5` campaigns are
  published together under November 11 IDs. Their original start/end times,
  source revisions, attempts and metrics are preserved; the runs table and
  exports still identify their actual execution times.

The batch date is a publication date, not a claim that all measurements ran on
the same day. Sample counts differ; Lexmount has concurrency-1 results only.
Providers without November 11 results in a benchmark are not backfilled.
Other dated public result artifacts, including legacy v0 and diagnostics, have
been removed from this branch. They remain recoverable from Git history.
Regression tests keep frozen aggregate calibration summaries under
`web/lib/fixtures/`; these are test inputs and are not published results.
