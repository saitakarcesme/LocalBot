# University Assistant

Status: source-discovery pilot. Not a trained specialist or a proven 104-hour autonomous training service.

## Live project

- Host: paired Windows Model PC, two RTX 3090 GPUs.
- Fine Tune job: `e93b3038-111a-4abc-a7d0-69ae3d913f4f`.
- Serving model: `qwen3.8-27b-awq`; proposed display name: Qwen · Everyday.
- Candidate adapter name after successful evaluation: Qwen · University — Candidate.
- Source discovery uses the signed-in LocalBot browser. This phase currently requires the Mac browser connection. Training executes on the PC.
- Initial training ceiling: 200 steps, subject to reviewed data and pilot results. It is not a claim of 104 GPU-training hours.

## Architecture

Train durable behaviors: grounded tutoring, level adaptation, study planning, tool selection, uncertainty and factual abstention. Store changing personal facts in dated retrieval records, never treat training weights as a calendar. Connect schedule, deadlines and announcements through explicit supported integrations. No assumption about the student's degree, enrolled courses or professors until verified.

A university context record contains owner, institution, program, academic year, course identifier, source URI, content hash, retrieval timestamp, validity interval, access scope and supersession links. Conflicting dates must be surfaced, not silently reconciled. Private documents remain local by default. Public research prompts must omit private context.

## Work budget (104 hours, revised from measurements)

1. Infrastructure and baseline: 6 hours. Reconnection, disk headroom, model identity, inference restore, pause/resume, loss/latency baseline.
2. Source discovery and register: 20 hours. Learning science, university tutoring, curriculum metadata, accessible course materials and licensed datasets. ChatGPT suggestions are candidates, not evidence.
3. Dataset construction and review: 30 hours. Deduplication, provenance, independent checks, contamination audit and coverage balancing.
4. Training pilots: 12 hours. Small LoRA runs; compare settings using development data only.
5. Main candidate runs: 24 hours. Checkpoint evaluations, early stopping, controlled resource budget and crash recovery exercises.
6. End-to-end evaluation: 12 hours. Hidden tests, retrieval freshness, tool results, UI controls and final comparison.

Stop extending training when quality plateaus or regresses. A long runtime alone is not success.

## Dataset specification

Each record: stable id, capability, prompt, answer, tool trace (if any), source ids, source spans, license/evidence, generated-by model/revision, verifier/method, confidence, split, content hash and review state.

Capabilities: explaining concepts; Socratic tutoring; worked-example feedback; time-bounded study plans; changed deadlines; timetable conflicts; retrieval with citations; unknown course/professor abstention; permissions-aware reminders; stale/offline data; multilingual support and accessibility.

Admission: source supports answer; use rights recorded; no secrets or unapproved personal data; duplicates rejected; source families and near-duplicates isolated across splits. Extractive matching only verifies text support, not whether a question is good or an answer complete. Require separate relevance review. A model's self-rating does not independently verify correctness.

Training/dev/hidden evaluation are disjoint. Never use the hidden set to generate or select training examples. Track rejection reasons and audit a stratified sample before training.

## Acceptance gates

- Baseline measured before training with saved prompts and exact model settings.
- Correct source attribution >=95% on manually checked factual evaluation cases; no invented citations accepted.
- All deterministic date/time and tool permission fixtures pass.
- No silent use of stale or contradictory schedule data in dedicated fixtures.
- No regression on general instruction-following and tool-call validity beyond an explicitly reviewed tolerance.
- Training and serving quality measured separately; held-out language-model loss is not sufficient.
- Candidate deployment is reversible and does not replace the serving model automatically.

## Controls and durability

Fine Tune exposes Pause, Resume, Stop and Overnight. The current source phase pauses after its active research task finishes; GPU training pauses at a saved checkpoint. Do not label a requested pause as completed before the backend confirms it. Browser sign-in, approval and network blockers must be visible, not retried indefinitely. Keep source and dataset artifacts when stopped.

The existing pipeline is a bounded preview: one research pass, at most 20 candidate source URLs per preparation pass, up to 10 extractive candidates per source, followed by review. Durable multi-pass coverage, personal retrieval sync and a 104-hour orchestrator remain implementation work. Do not present this pilot as that completed system.

## Server preparation

Preserve Center, encrypted relay, GPU runtime, Docker and remote access. Close only observed unnecessary user applications, gracefully; do not terminate unknown background jobs. Retain existing models and checkpoints. Require adequate free disk before expanding datasets or training. GPU percentage is a work-budget target, not a guaranteed hardware utilization cap.
