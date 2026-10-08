# Interface decisions

Use a plain mobgap WASM header and the route-adapted @shadcn-space/stepper-01. Each step owns a TanStack file route and its page content. The old upload sidebar is removed. Keep setup forms narrow, results tables wide, and the navigation usable on a small screen.

TanStack Form owns dataset and metadata forms. Use shadcn Field composition and a searchable timezone Combobox. The timezone is explicitly selected rather than silently inferred from the device. Retain user input after failures and navigation.

TanStack Query owns the initialized runtime resource and shared preparation task. The application session holds selected File references, configuration, actual dataset index, and results in memory and is exposed through router context. Python reconstructs datasets per operation and retains no registry or batch generator. Files and computed results are never placed in persistent browser storage.

Route guards enforce metadata prerequisites, runtime readiness, and the processing navigation lock. URL search owns selected row keys, preset, and result/table pagination. Dataset session identity prevents selections from previous recordings being reused. Loading routes use validated internal return destinations. Page navigation never starts pipeline analysis.

The preparation page is fullscreen, with no application header, footer or stepper. It differentiates downloading missing analysis tools from starting cached tools. Only complete current asset caches qualify for background startup. Cached startup never falls back to downloading large assets silently.

Use real download and processed-row progress. No implementation notes appear in the workflow. Errors explain what the user can do; detailed diagnostics go to the developer console. Use system-scale typography, tabular numbers, semantic shadcn colors, and restrained motion.
