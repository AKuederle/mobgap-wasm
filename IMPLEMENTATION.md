# Stateless analysis and routed setup rewrite

The current conversation's accepted design supersedes the previous prototype architecture.

## Acceptance

- Rebase onto current origin/main before changes; update official CWA Xeus bundle to newest compatible release before rewriting.
- Python has two stateless public operations: load_index(path, metadata_path, configuration) and process(path, metadata_path, configuration, selected_rows, preset). Reconstruct mobgap datasets each call. No registry, retained dataset, or global generator. Return actual index keys to JS; select those keys on reconstruction. Process emits per-row events during one call, preserving completed results on cancellation/failure.
- Keep File references in JS, never persist or copy entire selected recordings. Simplify WORKERFS to direct mount/unmount in worker; delete diagnostic bridge/counters/probes. Retain standard filesystem backend if kernel cannot supply it.
- Dataset -> Metadata -> Select rows -> Running -> Results are proper TanStack file-route pages. Remove obsolete sidebar and giant controller/page module. TanStack Form owns forms; shadcn timezone combobox autocompletes IANA names. Adapt @shadcn-space/stepper-01 to routes.
- Application session and active processing are accessible in router context. While processing, beforeLoad guards redirect other routes to Running with cancel-first guidance. Completion opens Results, cancellation preserves results and unlocks navigation. Navigation never starts analysis. Warn on tab reload/exit during active processing.
- TanStack Query owns the runtime object resource with one shared initialization task. Versioned runtime asset cache distinguishes complete/current downloads from absent/partial/old cache. With no complete cache, never eagerly download. When cached, initialize on any page opening using cache-only asset reads. A dependent route's beforeLoad redirects to runtime preparation with an internal return URL if not ready. Return only after download AND startup. Background startup does not lock navigation. Retry after errors; cancellation clears live resource, retains assets.
- Remove user-facing implementation notes. Use actionable progress/error text. Preserve useful privacy, metadata, format, and interpretation information.
- Remove obsolete wrapper tests and diagnostic probes per user instruction; no new Python wrapper test suite. Keep scientific submodule untouched. Verify actual browser behavior, actual native/browser pipeline results, typecheck/build, and focused runtime/cache lifecycle tests if needed.
- Preserve all result tables and CSV exports, Healthy/Impaired/Auto, one recording plus optional participant MAT file, CWA whole-file/calendar-day semantics and explicit timezone. Preserve license notices and subpath static deep links.

## Ownership and review units

Parent owns integration, documents, verification, commits, PR, and final reviews. Agents share this worktree and own disjoint slices.

1. Official reader release update. Gate: official artifact digest, ABI metadata, lock consistency, baseline build; commit and draft PR.
2. Coherent app rewrite integrating stateless Python, runtime lifecycle/cache, and routed forms. Interfaces agreed before parallel edits. Gate: typecheck/build, real runtime/browser flows, no obsolete consumers, React diagnostics; commit and push.
3. Any independently useful verification or review corrections with their evidence; final stack review and delivery.

Additional accepted requirements: examples are fetched on demand from the public mobgap GitHub registry and files, never bundled. Runtime preparation is fullscreen without header, footer or stepper.

Base: origin/main at 95d2492. Initial tree clean. npm ci succeeded. Baseline build passed. Roborev healthy.

## Integration contract

Use src/lib/contracts.ts as the shared contract. Configuration uses format, cohort, participantHeightM, sensorHeightM, measurementCondition, timezone, split ('auto'|'days'|'file'). Files stay outside JSON. InputFiles is {recording: File, metadata?: File}. DatasetRow is {id: string, index: Record<string,string>, label: string}. DatasetIndex is {rows: DatasetRow[], split: 'days'|'file'}. Existing AnalysisResult/table structure retained initially. Process events: {rowId, status: 'running'|'complete'|'error', result?, message?}. Python emits JSON lines with __MOBGAP_EVENT__ prefix; load index returns JSON. No retained Python state. Runtime provides loadIndex(files, config) and process(files, config, selectedRows, preset, onEvent), cancel()/dispose(). Runtime resource/cache module provides documented functions for UI agent; coordinate exact names directly.

## Verification and review outcome

Implementation and verification are complete; PR #1 contains the result. See VALIDATION.md for observed behavior and the public CWA fixture limitation.

The curated stack is based on 95d24923420d03d3f901916d1a9dcbe814e3727a: reader update 4d7d30e and application rewrite 2441395. Final whole-stack RoboRev job 14313 reviewed 244139552fcc51f07da6041870d12f869ef511d2. No feature_ready panel was configured, so the review used the single-review fallback.

The reviewed history is preserved. Normal correction commits 2830ba1 (failed-route retry) and 78dff55 (failed-operation traceback cleanup) address both final findings. Their automatic reviews 14314 and 14315 passed; the final review and all implementation reviews are closed. No permanent Python wrapper tests were added. The scientific submodule is unchanged.

## Results and recording UI follow-up

COMPACTION CONTINUITY: Re-read implement-code-change and the task-defining artifacts before continuing after compaction or session restoration.

User acceptance: remove unnecessary results headings/icons/prose; add a compact WB/stride count table for each recording; use recording terminology; remove redundant back navigation in favor of the stepper; download all completed recording tables as ZIP; default to first completed recording; show a small loop indicator beside Running for the active recording.

Base: 33eb3a723e44e8d0d3e5abdb3bda790d50ef3617, clean worktree. Preserve prior reviewed history. One review unit: simplify result inspection/export and recording navigation. Gate: baseline and final build, browser inspection of results/selection/running and empty/partial states, extracted ZIP contents versus individual CSV, React Doctor, commit/push and review closure. Browser checks are sufficient for these UI changes; no new permanent test framework or Python tests. Parent owns implementation and delivery to existing PR #1.

Follow-up verification: baseline and final subpath builds pass; React Doctor remains 86/100 with the same two pre-existing advisories. Browser fixture using previously verified public HA results confirms first-recording default, 6 WBs/47 strides, genuine zero counts, failed recording labeling, no result headings/back links, and narrow-screen overflow confined to result tables. Downloaded ZIP has 16 CSVs for two completed recordings, valid CRCs, exact per-table values, and byte-identical individual CSV export.
