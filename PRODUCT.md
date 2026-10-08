# mobgap WASM

register: product

Researchers inspect gait recordings locally in a browser. No account, backend, or recording upload is required. The interface should be precise and calm for a laptop in a bright office or laboratory, with a light neutral background, one restrained indigo accent, and readable numeric tables.

The workflow is Dataset, Metadata, Recordings, Running, Results. Dataset selects one Mobilise-D MATLAB or AX6 CWA recording, or a public example downloaded on demand from GitHub. Metadata supplies the participant file or explicit heights, cohort, recording setting, and the CWA sensor synchronization timezone. No participant measurements are invented. Recordings shows the actual trial/day index and supports Healthy, Impaired, and Auto presets. Auto uses the supplied cohort.

CWA supports single-file analysis and local calendar days. Automatic splitting uses calendar days for recordings longer than 24 hours. Users can choose explicitly. Timezone selection is an autocomplete combobox and must be confirmed by the user.

Analysis tools download only when first needed. A fullscreen preparation page without a header, footer or stepper explains the download and returns to the intended step after startup succeeds. On later visits, a complete current asset cache starts in the background. If startup is unfinished when needed, the preparation page waits for it. Background preparation never blocks editing or navigation.

During analysis, navigation returns to Running and explains that cancellation is required before another operation. Completed results survive cancellation. Ordinary recording errors do not stop subsequent recordings; completion opens Results. All output tables can be viewed and exported to CSV without display rounding.

User-facing copy describes the task and the action to take. Internal runtime, worker, compilation, mounting, and caching details belong in developer documentation and diagnostics. Keep useful privacy statements, metadata instructions, format restrictions, and result interpretation information.

Results open with the first completed recording selected. A compact summary lists walking-bout and stride counts for each recording, with incomplete recordings identified. Users can export the selected table as CSV or all completed recording tables as one ZIP. The stepper handles navigation; omit redundant back links and decorative result headings.
