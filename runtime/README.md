# Browser runtime

Run `python3 scripts/setup-runtime.py` from the repository root, then `npm run dev` or `npm run build`. Python 3.13 is the tested native build interpreter to prepare assets. The default setup downloads micromamba 2.9.0 on Linux x86_64, creates a build virtual environment and installs jupyterlite-xeus 5.1.0, jupyterlite-core 0.8.6 and JupyterLab 4.6.4 plus their pinned dependencies in `build-requirements.txt`. Other platforms can pass `--micromamba /path/to/micromamba`. Existing pinned build tools can be passed with `--jupyter /path/to/jupyter --micromamba /path/to/micromamba`.

The setup script builds a local conda channel from the three checked-in packages and their SHA256 manifest, then resolves the exact package versions and builds in `packages.lock.json`. It generates `public/runtime` and a `bootstrap.zip` from the `mobgap/src/mobgap` submodule, the demo's Python adapter and the hash-pinned pure Python wheels in `wheels.lock.json`. The generated files and downloaded build caches are ignored by Git. Run `python3 scripts/setup-runtime.py --bundle-only` after changing Python code. The setup requires internet access; the resulting website runs Python locally in a browser worker.

The package environment uses Python 3.13.1, Emscripten ABI 4.0.9, NumPy 2.4.6, Numba 0.67.0, llvmlite 0.49.0, SciPy 1.18.0 and genuine compiled Python xxhash 4.0.1, PyWavelets 1.9.0 and cwa_reader_rs 0.5.0. There is no hashing or wavelet adapter. PyWavelets' upstream 1.9.0 release has a stale `pywt.__version__` of 1.8.0; its distribution metadata identifies version 1.9.0. The checked-in package licenses are under `licenses`; upstream source hashes and license declarations are in `recipes`.

The React application starts a dedicated classic worker directly. There is no iframe, Jupyter application, notebook shell, DriveFS or service worker in the delivered website. The loader uses `@jupyterlite/xeus-core` 5.1.0 for the kernel lifecycle and `@emscripten-forge/mambajs-core` 0.21.2 for the packed environment and Python bootstrap. It retains Emscripten 4's lazy shared-library loading and genuine Numba. Comlink 4.4.2 carries RPC calls; the application correlates Jupyter execution replies and the final idle status. Interactive stdin and dynamic package installation are disabled.

`npm run dev` and `npm run build` first run `npm run worker:build`. This bundles the classic worker and untarjs 5.3.3 unpacker into fingerprinted assets under `public/runtime`, with a small `worker-manifest.json`. The setup still uses JupyterLite as a native asset builder, but copies only the packed scientific environment to the public directory. Generated application assets and source maps are excluded. The browser needs the scientific environment plus the worker, unpacker and source bundle; it does not download Jupyter's frontend.

Selected `File` handles reach the worker by structured clone and mount read-only under `/mobgap/uploads` using Emscripten 4.0.9's official WORKERFS backend. `FileReaderSync` reads Blob slices as Python requests them. The selected input is never eagerly read with `File.arrayBuffer`, encoded as base64 or copied wholesale into MEMFS. No persistent file store is introduced. The backend, pinned upstream source and license are in `workerfs`. Bridge commands disable IPython input history. Python still allocates parsed MATLAB structures and arrays; the MATLAB loader loads the full file. The worker survives between pipeline runs. Cancel terminates it and clears worker-side recording handles. The page retains the selected File handles so the dataset can be rebuilt. Runtime URLs follow Vite's configured base path.

The fixed pipeline environment omits Matplotlib, Pillow, FontTools, contourpy, kiwisolver, cycler and pyparsing. The demo's full Healthy and Impaired presets do not import them; plotting/evaluation helpers that require them are outside this application. Graphviz and its Python package remain because the compiled llvmlite package declares them. The generated runtime occupies 93,922,594 bytes, about 89.6 MiB, including the 170,847-byte worker and 1,520,252-byte unpacker. OpenBLAS, xpython WASM, llvmlite and SciPy are its largest components. There are no source maps or Jupyter frontend assets. Measurements include licenses and the source bundle; the final application adds its frontend and example files.

## Rebuilding the two local packages

Use rattler-build 0.67.0. Its compiler dependency downloads Emscripten 4.0.9. Both recipes use unmodified upstream source and cross-Python 3.13.1; PyWavelets uses NumPy 2.4.6. From the repository root:

```sh
bash runtime/recipes/python-xxhash/build-package.sh
bash runtime/recipes/pywavelets/build-package.sh
```

Set `RATTLER_BUILD` to an executable path if needed. Outputs go under `runtime/build`. The provided package artifacts are the outputs that passed browser/native parity tests. A rebuild may produce a different archive hash because package archive metadata can differ. To intentionally use a rebuild, replace the matching archive in `runtime/channel/emscripten-wasm32`, update `artifacts.lock.json`, and run the setup script. The recipes include native reference probes for hash algorithms and PyWavelets' CWT precision 10 and 12. Package rebuilds are optional for running the demo.

Runtime initialization has a five-minute timeout. Dedicated worker errors and malformed worker messages reject the active operation and dispose the worker so loading can be retried. Pipeline runs have no arbitrary timeout.

## CWA reader and bounded file access

The CWA module is the official v0.5.0 Xeus release at revision `68b2369140cd7bec0c2ffbbea368ae7e294084dc`. The checked-in archive is unchanged from the release and uses CPython 3.13 / Emscripten 4.0.9. `reader/provenance.json` records release, archive and compiled-module hashes. The release bundle passed upstream Xeus validation with 128 tests.

The reader locates metadata at the recording boundaries and reads selected data in internal packet batches, defaulting to 256 packets with one packet of overlap. The bridge therefore uses the official WORKERFS exact-range reads with no JavaScript read-ahead cache. Counters distinguish logical requests and physical browser reads. No full input copy or persistent file store is introduced. MobGap datasets no longer request the reader's full-file sampling-consistency report. Parsed DataFrames and pipeline intermediates still require memory proportional to the selected day.

For a day batch, Python constructs one `AX6Dataset` with `split_by_local_days` and applies the pipeline in a loop over its selected dataset items. The runtime consumes the Python generator one day at a time and reports each result or recoverable error to the page. Failed-day exception frames are cleared before yielding; they are not published as IPython errors. A `MemoryError` yields a fatal day error and terminates the worker, preserving earlier results while requiring the dataset to be rebuilt from the retained file handles. Cancellation also terminates the worker.

Run `node --test runtime/workerfs/bridge.test.mjs` to check exact-range reads, offsets, seeks, EOF, write rejection, remount, alternating files and physical read counts. For browser diagnostics, the source bundle includes `file_access_probe.py`, `cwa_window_probe.py` and `cwa_pipeline_probe.py`; these contain no participant data.

To rebuild the reader, clone `https://github.com/mobilise-d/cwa_reader_rs`, check out tag `v0.5.0`, and run its `tools/wasm/build-xeus.sh` with Node 24, Python 3.13 and rattler-build 0.67.0 on PATH. Its pinned recipe selects Emscripten 4.0.9, Maturin 1.15.0 and Rust nightly 2026-02-16. Replace the package and deliberately update the archive checksum if using your rebuild. The checked-in artifact is sufficient for the demo setup.
