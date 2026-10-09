# mobgap CLI

The Bun executable embeds the same Xeus Python WASM kernel, pinned scientific packages, mobgap source, and Python API as the web application. Running it needs no installed Python, Bun, package manager, runtime directory, or network connection. Bun cross-compiles the executable for Linux, macOS and Windows, x64 and arm64. All targets embed the same scientific WASM payload.

## Commands

The website footer links to [GitHub Releases](https://github.com/AKuederle/mobgap-wasm/releases/latest). Download the archive matching your operating system and CPU. `darwin` means macOS; choose `arm64` for Apple silicon and `x64` for Intel. Linux archives use glibc. Extract the archive and run the executable:

```sh
tar -xzf mobgap-linux-x64.tar.gz
./mobgap --help
```

On Windows, run `./mobgap.exe --help` after extracting the matching archive. Archives retain executable permissions and include usage instructions and dependency notices. GitHub Releases hosts the downloads separately from the website.

```sh
mobgap list-recordings data.mat
mobgap list-recordings recording.cwa --timezone Europe/Berlin --split auto
mobgap list-recordings data.mat --json

mobgap run-pipeline data.mat \
  --metadata infoForAlgo.mat --cohort HA --preset auto \
  --recording 1 --recording 3 --output ./results

mobgap run-pipeline recording.cwa \
  --timezone Europe/Berlin --split file \
  --participant-height 1.75 --sensor-height 0.95 \
  --cohort PD --setting free-living --preset impaired --output ./cwa-results
```

`list-recordings` prints numbered index rows without requiring patient information. `--json` prints the dataset index as JSON to stdout. Initialization messages, progress, and scientific warnings use stderr. Recording numbers start at 1 and refer to rows listed with the same timezone and split settings.

Both commands accept:

| Flag | Meaning | Default |
| --- | --- | --- |
| `--format auto\|mat\|cwa` | Input format; auto uses the filename extension | `auto` |
| `--timezone NAME` | CWA sensor synchronization timezone, e.g. `Europe/Berlin` | Required for CWA |
| `--split auto\|days\|file` | CWA whole file or complete local calendar days | `auto` |

Automatic splitting uses days when a CWA recording is longer than 24 hours, otherwise the whole file. Explicit `days` preserves native complete-day semantics, so a short recording can contain no complete days. Timezone and split flags apply to CWA only. MATLAB v7.3/HDF5 is outside the supported SciPy loader formats.

Analysis requires a LowerBack sensor with all three acceleration and gyroscope axes. An acceleration-only CWA file can be listed, but the shared pipeline rejects it when analysis starts. The bundled `example-610-steps.cwa` fixture has this limitation.

`run-pipeline` also accepts:

| Flag | Meaning | Default |
| --- | --- | --- |
| `--metadata FILE` | MATLAB `infoForAlgo.mat` companion; heights are converted from cm to m | None |
| `--participant-height NUMBER` | Positive participant height in metres; overrides companion value | Required without companion |
| `--sensor-height NUMBER` | Positive sensor height in metres; overrides companion value | Required without companion |
| `--cohort HA\|COPD\|CHF\|PD\|MS\|PFF` | Participant cohort | Required |
| `--setting laboratory\|free-living` | Measurement condition | `laboratory` |
| `--preset auto\|healthy\|impaired` | Full native pipeline; Auto selects for the cohort | `auto` |
| `--recording NUMBER` | Select a listed row; repeat for multiple rows | All rows |
| `--output DIRECTORY` | Create a new results directory | Required |

Sensor height must not exceed participant height. Duplicate recording selections run once, in index order. The output directory must not exist; parents are created if necessary. This prevents mixing or overwriting results from earlier runs.

Each successful recording gets a numbered subdirectory containing `result.json` and all eight CSV tables, with the same CSV encoding as web downloads. `summary.json` records the input paths, configuration, requested preset, runtime fingerprint and package versions, plus completed or failed rows. Results are saved after each recording. Ordinary row failures do not stop later rows; the command exits nonzero if any row failed. Ctrl+C terminates the WASM worker; results already saved remain on disk. Initialization failure can leave an empty output directory.

`--help`, `--version`, and Effect's shell completions are available without starting WASM. `mobgap --licenses` prints the executable's bundled project, Bun and JavaScript notices. Scientific dependency notices remain embedded in the package archives and bootstrap ZIP, together with the runtime license directory.

## Why startup is slow

Every invocation creates a fresh WASM Python interpreter, extracts the embedded packages into its in-memory filesystem, and imports the analysis API. That API eagerly imports the native mobgap dataset and pipeline modules, which bring in NumPy, SciPy, pandas, scikit-learn, Numba and PyWavelets. Python executes their module initialization, and Emscripten loads and links their compiled extension libraries. Embedding the files removes downloads and external environment dependencies, but does not preserve initialized Python modules between processes.

In three local fresh-process probes with warm OS file caches, full initialization took **12.6–13.5 seconds**. Median phase timings were approximately:

| Phase | Seconds |
| --- | ---: |
| WASM kernel and loader | 0.20 |
| Extract scientific packages | 0.57 |
| Initialize Python | 0.04 |
| Extract application bootstrap | 0.23 |
| Import analysis API and dependencies | **11.53** |

These are measurements from the development machine, not a cross-platform startup guarantee. Importing the scientific stack dominates; compiling the CLI into one executable does not pre-import that stack. Listing still imports the full API. Experiments with deferred imports reduced sample listing to roughly 6–8 seconds, but this implementation deliberately keeps the current shared import path. There is no saved interpreter snapshot or persistent background process. A single `run-pipeline` invocation initializes once and processes all selected rows, so batch work amortizes the cost.

## Reproducibility

The executable fixes Bun, Python, the WASM kernel and extension libraries, scientific package builds, and mobgap source. It uses embedded assets even when launched from another directory, with no reliance on the host's Python environment. Inputs are mounted read-only using the existing WORKERFS backend and local file range reads; recordings are not staged into a second whole-file copy.

Use the same executable, input bytes, metadata, timezone, split and pipeline settings when comparing results. The runtime ID in `summary.json` hashes the bundled runtime assets. Fixed dependencies remove variation from local installations; they do not establish a tested guarantee of bit-identical floating-point output on every host. Processing times and absolute input paths naturally differ between runs. The current shared runtime also emits scikit-learn warnings because bundled pretrained models were serialized with a different scikit-learn version; those warnings are preserved.

## Build and development

Build-time tooling is separate from the standalone executable. Preparing the shared runtime uses Python and downloads pinned packages and native build tools as described in [runtime/README.md](../runtime/README.md).

```sh
git submodule update --init --recursive
npm ci
npm run runtime:prepare
# After Python source edits, refresh bootstrap.zip:
python3 scripts/setup-runtime.py --bundle-only

# Use exactly Bun 1.4.2; Effect and its Bun adapter are pinned to 4.0.2.
bun install --cwd cli --frozen-lockfile
npm run cli:check
npm run cli:build
npm run cli:test

./cli/dist/mobgap --help
```

The build checks scientific package versions/builds against `runtime/packages.lock.json`, embeds all runtime assets and the worker, and disables loading local `.env`, Bun, package and TypeScript configuration files in the executable. By default it builds for the host, producing `cli/dist/mobgap` or `mobgap.exe`, accompanied by `THIRD_PARTY_NOTICES.txt`.

Cross-compilation uses Bun's `compile.target`; no target Python environment or C/C++ toolchain is needed once the shared WASM assets are prepared:

```sh
npm run cli:build -- --target bun-darwin-arm64
npm run cli:build -- --all
npm run cli:package
```

Supported targets are `bun-linux-x64`, `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`, `bun-windows-x64` and `bun-windows-arm64`. Targeted builds go to `cli/dist/<platform>-<architecture>/`; `--all` builds all six from one shared runtime staging step. `cli:package` uses `tar` to produce matching archives under `cli/dist/releases`. Cross-compilation can download the pinned Bun runtime for each target during the build.

`npm run cli -- <command> ...` runs the TypeScript source against assets staged by `cli:build`. `cli:test` exercises real MATLAB/CWA fixtures and a selected full pipeline, so prepare and build the runtime first. The full suite is available for local verification.

Per-commit CI builds only Linux x64 and runs help, MATLAB listing, a full pipeline and license checks from the extracted archive, in an isolated directory with Python and Bun absent from PATH. It does not cross-compile other platforms for testing. Cross-compilation runs only when a GitHub Release is published. Tag pushes alone do not trigger it. The release workflow smoke-tests Linux; macOS, Windows and Linux ARM64 builds are cross-compiled without native test runs.

To ship a version, create and publish a GitHub Release at the intended commit. Publishing a draft release also triggers the workflow; saving a draft does not. The workflow builds the release's tagged commit and attaches the archives after the Linux smoke test succeeds. Downloads appear once that workflow finishes. Reruns upload missing archives and leave existing binaries unchanged. The footer points to the latest published release; generated binaries and archives stay outside Git and Pages.
