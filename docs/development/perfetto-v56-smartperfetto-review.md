# Perfetto v56 SmartPerfetto Review

Date: 2026-06-05

## Update Target

- Adopted Perfetto stable tag `v56.0`, merged into the SmartPerfetto fork as
  `10d908b9f9` (`v56.0-155-g10d908b9f9`).
- Upstream `origin/main` was newer than `v56.0` during the update, but `v56.0`
  was selected because LUCI `trace_processor_shell` artifacts and UI build
  outputs are available and versioned. Treat this as latest stable, not latest
  untagged main.
- The SmartPerfetto AI Assistant plugin is not present upstream, so the merge
  kept the fork plugin and adapted it to v56's Vitest-based UI test runtime.

## Compatibility Fixes Landed

- Preserved upstream topbar side-panel controls and kept the SmartPerfetto AI
  Assistant entry point.
- Migrated SmartPerfetto UI unit tests from Jest globals to Vitest globals.
- Restored table-source provenance chips for `planPhaseAttribution`,
  `sourceToolCallId`, and `evidenceRefId`; this keeps report evidence and
  frontend chat provenance visible after the v56 UI/runtime changes.
- Verified `perfetto/ui` on Node 24:
  - `npm run build`
  - `npm test`: 144 test files passed, 2657 tests passed, 1 skipped

## Useful v56 Upstream Changes

### Device State And Power Context

Perfetto v56 moved `android_screen_state`, `android_suspend_state`, and
`android_charging_states` onto the new `intervals.fill_gaps` stdlib helper.
Those tables now cover trace bounds more consistently, with explicit fallback
states such as `unknown` or `awake` when source data is absent.

SmartPerfetto impact:

- Device-state Skills can use these tables as continuous context windows instead
  of manually filling gaps.
- Reports must still distinguish fallback rows from observed evidence. `unknown`
  and trace-wide `awake` are coverage defaults, not proof that the state never
  changed.
- Startup, power, and background CPU strategies should use these tables to
  annotate whether an issue occurred while screen was off/dozing, suspended, or
  charging/discharging.

### Interval Gap Filling

v56 adds `intervals.fill_gaps` and the `_intervals_fill_gaps!` macro. Upstream
already uses it for device state. SmartPerfetto should prefer official stdlib
tables that consume this helper rather than calling the underscored macro in
agent-generated SQL.

SmartPerfetto impact:

- Useful for future custom Skills that need continuous state timelines.
- For now, expose the consequence through strategy text and generated stdlib
  docs, not as a new public Skill API.

### Camera Analysis

`pixel.camera` now exposes `pixel_camera_frames` and
`pixel_camera_memory_span`, and the Android camera metric imports this module.
This is a strong signal for Pixel/Google Camera traces because it combines
camera graph slices, GoogleCamera RSS, Camera HAL RSS, cameraserver RSS, and
DMA heap spans.

SmartPerfetto impact:

- Rendering/camera strategies can route Pixel camera traces toward
  `pixel_camera_frames` and `pixel_camera_memory_span` when available.
- It must remain optional and guarded by schema lookup; this is Pixel-specific
  naming and does not replace generic camera/vendor HAL evidence.

### Frame Timeline Metric

The Android frame timeline metric now includes weighted missed-frame fields
based on `jank_score`:

- `weighted_missed_frames`
- `weighted_missed_app_frames`
- `weighted_missed_sf_frames`

SmartPerfetto impact:

- Future frame/jank reports can rank regressions by severity, not only by frame
  count.
- Existing Skills should keep raw frame counts and jank type evidence; weighted
  fields are additive.

### Wattson And Power Estimation

v56 includes Wattson fixes and curve updates, including aggregator behavior for
GPU/TPU-only traces and CPU/interconnect model changes.

SmartPerfetto impact:

- Power Skills should keep capability checks before interpreting empty Wattson
  results.
- Existing Wattson rails/thread/startup Skills benefit from the newer prebuilt
  trace processor without changing SQL shape in this update.

### UI Platform

The Perfetto UI now has a side-panel extension point, Vite/Vitest-based build
and test flow, colocated styles, and more datagrid/query-table polish.

SmartPerfetto impact:

- The AI Assistant currently keeps its existing topbar entry. A future UI
  refactor can evaluate moving or duplicating AI controls into the side panel,
  but that should be a separate product decision with browser verification.

## Changes Applied In SmartPerfetto Root

- Updated `scripts/trace-processor-pin.env` to `v56.0` and refreshed the
  committed Linux x64, macOS arm64, and Windows x64 `trace_processor_shell`
  prebuilts.
- Updated `start.sh` default fallback from `v54.0` to `v56.0`.
- Updated the committed `frontend/` prebuild to `v56.0-9986a6a7c`.
- Regenerated backend stdlib assets:
  - `backend/data/perfettoStdlibSymbols.json`
  - `backend/data/perfettoSqlDocs.json`
- Left `scripts/perfetto-recording-tools-pin.env` unchanged. Its tracebox SHA
  values are intentionally empty and there is no approved recording-tools
  redistribution flow in this update.

## Follow-Up Candidates

- Add a guarded Pixel camera Skill that first checks `pixel_camera_frames` and
  `pixel_camera_memory_span`, then falls back to generic camera slices.
- Extend frame/jank Skills to surface weighted missed-frame fields when
  `android_frame_timeline_metric_per_process` is available.
- Replace manual device-state gap handling in older Skills with official
  `android_screen_state`, `android_suspend_state`, and
  `android_charging_states` tables where the current trace supports them.
