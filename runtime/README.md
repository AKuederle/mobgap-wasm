# Browser runtime

Run `npm run runtime:prepare` and then `npm run dev` or `npm run build`. Setup uses pinned native build tools and packages to create `public/runtime`. Generated assets and build caches are ignored. Python 3.13 is the CI build interpreter. Other platforms can provide `--micromamba` and `--jupyter` to `scripts/setup-runtime.py`.

The scientific runtime uses Xeus Python, genuine Numba, compiled PyWavelets and xxhash, and the official CWA reader 0.5.0 Xeus release. The reader targets CPython 3.13 / Emscripten 4.0.9. `reader/provenance.json` records upstream revision, release and compiled-module hashes. Package locks, recipes and dependency licenses remain in this directory. JupyterLite is a native asset builder; its notebook frontend is not delivered.

`npm run worker:build` builds the classic worker and creates a versioned manifest covering all runtime assets with sizes and SHA256 digests. The application uses a dedicated asset cache. First-time downloads occur only when a dependent route is opened. A complete current cache permits background startup with no large network fallback. Download progress and initialized runtime readiness are separate states. Cache eviction triggers preparation again. The service worker serves runtime assets, not recordings or result data.

The QueryClient owns the initialized runtime resource. Cancellation terminates the live worker; downloaded assets remain available for another startup. Initialization, package extraction and imports still run for each new worker. The cache stores downloaded bytes, not a snapshot of Python memory.

Selected browser File objects are structured-cloned to the worker and temporarily mounted with Emscripten WORKERFS. The adapter calls the native datasets through filesystem paths. No whole recording is copied into MEMFS, base64, persistent browser storage, or a server. WORKERFS is retained because xeus-core leaves application file mounting abstract. The custom diagnostic bridge and read counters are removed; the worker mounts and unmounts directly. Decoded datasets and pipeline intermediates still consume memory.

Python exposes two stateless operations, documented in `python/README.md`. An index call returns actual dataset index keys. A processing call reconstructs the same dataset, selects those keys, and emits each row's outcome. No recording registry or retained batch iterator is used.

For package rebuilds, see `recipes/pywavelets`, `recipes/python-xxhash`, and the upstream CWA reader v0.5.0 Xeus build instructions. Preserve license notices when replacing artifacts. Regenerate the source bundle with `python3 scripts/setup-runtime.py --bundle-only` after Python changes, then rebuild the worker manifest.

After empack builds each package, setup removes `.a` static link libraries from the delivered archives. These build-time libraries are not loaded by the browser runtime. Dynamic libraries and all other package members remain unchanged, including license files. The worker build then hashes the reduced archives into a new runtime cache version. Original packages, locks, and build environments remain intact.
