# mobgap WASM

Run full mobgap gait analysis locally in your browser using Mobilise-D MATLAB or AX6 CWA recordings. Files stay on your device. This experimental research application uses genuine Xeus Python, Numba, and compiled scientific dependencies.

A [standalone Bun CLI](cli/README.md) embeds the same WASM environment for offline `list-recordings` and `run-pipeline` commands. It requires no installed Python and exposes the web application's analysis settings. Scientific imports currently add roughly 13 seconds per invocation; the CLI documentation explains the measured startup cost.

## Local development

```sh
git submodule update --init --recursive
npm ci
npm run runtime:prepare
npm run dev
```

The initial runtime build downloads pinned packages and native build tools. Generated assets remain outside Git. Run `python3 scripts/setup-runtime.py --bundle-only` after editing Python, then `npm run worker:build` to refresh the asset manifest. `npm run build` checks TypeScript and emits the application, static route entry documents, and dependency notices.

## Workflow

1. Dataset: choose one recording or a public example.
2. Metadata: select a participant metadata file or enter measured heights, cohort and recording setting. CWA also requires the timezone used to synchronize the sensor.
3. Select rows: choose MATLAB trials or CWA days, then select Healthy, Impaired, or Auto and explicitly start analysis.
4. Running: inspect progress or cancel. Other application routes redirect here until processing stops.
5. Results: inspect all output tables and export CSV.

CWA supports a single whole file or complete local calendar days. Automatic mode splits recordings longer than 24 hours. MATLAB v7.3/HDF5 is outside the supported SciPy loader formats. Reloading loses selected recordings and result data, which are deliberately not persisted.

Analysis tools download only when first needed. A fullscreen preparation page returns to the requested step after download and initialization. A complete, current asset cache enables background startup on later visits. Cache eviction or a runtime update requires preparation again. Only runtime assets are cached, never recordings or results.

Public examples are listed from the mobgap GitHub example registry and fetched only when selected; example recordings are not bundled.

## Implementation

TanStack Router owns page navigation and guards, TanStack Form owns setup forms, and TanStack Query owns the runtime resource. The route-adapted stepper comes from `@shadcn-space/stepper-01`. Python has two stateless operations: return a dataset index and process selected index rows. See `python/README.md` and `runtime/README.md` for details.

The `mobgap` scientific library is a pinned upstream submodule with its own compatibility policy. This demo has no backwards-compatibility guarantee during experimentation; see `.agents/refactor-policy.md`.

## Deployment and licenses

GitHub Actions builds and publishes to GitHub Pages. Use `npm run build -- --base=/mobgap-wasm/` for the project subpath. Each file route receives a real static entry document so direct links work without a catch-all 404 redirect.

Licensed Apache-2.0; see LICENSE and NOTICE. Runtime dependency licenses are retained under `runtime/licenses`. The build emits `THIRD_PARTY_NOTICES.txt` for frontend dependencies.
