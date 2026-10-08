# Rewrite validation

Validation targets the browser workflow and actual mobgap execution rather than a separate Python wrapper test suite. Upstream scientific tests remain in the mobgap submodule.

Verified on 2026-10-08:

- Clean baseline and rewritten TypeScript/Vite builds pass, including the `/mobgap-wasm/` deployment base and generated route entry documents.
- Official CWA reader 0.5.0 release archive, module, source receipts and ABI dependencies verified. Upstream Xeus release reports 128 passing tests.
- Public HA and MS Test11 examples execute through the stateless wrapper in native Python and browser Xeus. All eight tables match exactly, including every numeric cell, column and row count. Healthy: 6 walking bouts, 60 initial contacts, 47 strides. Impaired: 5 walking bouts, 98 initial contacts, 84 strides. Explicit Healthy/Impaired and cohort-based Auto also ran natively.
- A fresh browser visit makes no runtime asset downloads. First use downloads and starts before returning to selection. Preparation is fullscreen with no application navigation. Local-server first preparation took approximately 20 seconds; this is not an internet-download benchmark.
- Evicting one cached asset prevents automatic startup without triggering a download. Preparation recovers on the next explicit request.
- A later page visit starts the cached runtime in the background with zero runtime downloads. Cached fetches report zero network transfer. Cancelling and reopening selection also reuses downloaded assets.
- Running navigation redirects to the running page with cancel-first guidance. Cancelling after one of three rows completes preserves that result and marks remaining rows incomplete; results remain inspectable and navigation is unlocked.
- Empty selection disables Run; selected dataset row keys survive URL encoding. New datasets discard stale selection. Healthy and impaired examples load from the upstream GitHub registry and original files on demand, without bundled copies.
- Required metadata validation and the timezone combobox were exercised: typing Berlin filters to Europe/Berlin. The public accelerometer-only CWA example loads its index and reports a row error without locking navigation. Native and browser whole-file and calendar-day CWA indexing pass. Successful six-axis CWA analysis was not checked because the public fixture lacks gyroscope channels.
- Native dataset RAM caches are empty after successful operations and index/process failures, including a simulated MemoryError after one completed row. Metadata drafts survive page navigation and invalidate a previous configuration when edited.
- React Doctor checks the full committed change. Sequential archive downloads intentionally bound peak memory; the metadata page remains one form with its fields together.
- Temporary focused lifecycle checks cover shared initialization, cache-only startup, retry, cancellation, stale-resource replacement, and version-isolated service-worker cache reads. No new Python wrapper test suite is shipped.

Native/browser comparison artifacts and temporary checks are outside the repository. Private recordings and participant results must not be committed.
