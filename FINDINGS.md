# Findings

## GitHub synchronization

- Repository: https://github.com/saitakarcesme/LocalBot (public).
- Scheduled every minute; commit only when project changes exist.
- Current snapshot adds engine, provider adapters, and agent tools.
- Source reviewed for embedded credentials; none found. Development snapshot, not a tested release.
- Verified remote master matches snapshot 991228e.
- Reviewed runtime HTTP server snapshot; no embedded credentials found.
- Excluded personal reference screenshot using local Git excludes; contains contact details and private content.
- Verified remote master matches server snapshot 5e001d4.
- Reviewed macOS package, data models and app controller snapshot; no embedded credentials found. Development snapshot, not a tested release.
- Verified remote master matches macOS controller snapshot ede580f.
- Reviewed main macOS conversation UI snapshot; no embedded credentials found. Development snapshot, not a tested release.
- Verified remote master matches conversation UI snapshot 154f3ea.
- Reviewed macOS settings, approval and activity views plus app packaging script; no embedded credentials found. Development snapshot, not a tested release.
- Verified remote master matches settings and packaging snapshot e81d1b3.
- Reviewed runtime regression tests, task insert correction, shell permission changes and SwiftUI fixes; no embedded credentials found. Snapshot only; tests not run by synchronization task.
- Verified remote master matches fixes and tests snapshot b197f23.
- Reviewed sandbox root access adjustment and pinned Node distribution packaging with checksum verification; no embedded credentials found. Snapshot only, not tested by synchronization task.
- Verified remote master matches Node packaging and sandbox snapshot 23a65d3.
- Reviewed task error reporting, recovery, shell failure propagation, regression tests, Keychain access and conversation styling updates; no embedded credentials found. Snapshot only; tests not run by synchronization task.
- Verified remote master matches error reporting and UI snapshot 0d544ca. Server changes arriving during push remain for the next cycle.
- Reviewed runtime process lock and HTTP, provider streaming, sandbox and cancellation test additions; no embedded credentials found. Snapshot only; tests not run by synchronization task.
- Verified remote master matches runtime lock and test snapshot b06d776.
- Reviewed architecture documentation for publication; no embedded credentials or private conversation data found. Documentation claims were not independently tested by synchronization task.
- Verified remote master matches architecture documentation snapshot b9f84d3. New smoke script remains for next cycle.
- Reviewed workspace-aware concurrency, group context, settings, icon generation and local-model smoke script; no embedded credentials found. Snapshot only; scripts and tests not run by synchronization task.
