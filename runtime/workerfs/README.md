# Browser file access

`workerfs.js` is a runtime adaptation of the official Emscripten 4.0.9 read-only WORKERFS backend. The original Emscripten library contains build macros; `libworkerfs.upstream.js` and `provenance.json` retain its source and provenance. The MIT license is preserved.

The dedicated Xeus worker mounts selected File objects directly with `FS.mount` for each dataset operation and unmounts them afterward. FileReaderSync reads only requested slices. The application retains File references for subsequent operations; it does not copy whole recordings into WASM memory or persistent storage.

There is no custom diagnostic bridge, read interception, or probe protocol. The backend remains necessary because xeus-core does not itself map arbitrary browser-selected files to Python paths. Python datasets still allocate decoded arrays independently of the filesystem backend.
