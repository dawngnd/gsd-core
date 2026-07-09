---
status: complete
phase: 02-change-intake-and-spec-drafting
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: "2026-07-08T03:24:00Z"
updated: "2026-07-08T03:26:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. End-to-end ndd-change command routing
expected: Running `node gsd-core/bin/gsd-tools.cjs ndd change --source <folder>` creates the full NDD change workspace with all artifacts.
result: skipped

### 2. CHANGE-SPEC.md ambiguity and conflict sections
expected: Given source documents with ambiguous language (TBD, maybe, etc.) or contradicting claims, the generated CHANGE-SPEC.md includes populated Ambiguities, Conflicts, and Open Questions sections with source references.
result: pass

### 3. Safe explicit change id validation and workspace resolution
expected: Explicit valid ids resolve under .planning/ndd/changes/. Unsafe ids (path separators, dot segments, reserved names) return structured validation errors.
result: pass
source: automated
coverage_id: D1

### 4. Deterministic generated change ids from Markdown source folders
expected: Re-running id generation against the same folder and Markdown file set returns the same id. Adding/removing a file changes the suffix.
result: pass
source: automated
coverage_id: D2

### 5. STATUS.json creation and resume behavior
expected: STATUS.json is parseable JSON with required fields. Existing workspace resume does not clobber unrelated status fields.
result: pass
source: automated
coverage_id: D3

### 6. Markdown folder recursive ingestion
expected: A local Markdown folder can be recursively ingested into .planning/ndd/changes/<change-id>/sources/ preserving source-relative paths.
result: pass
source: automated
coverage_id: D1

### 7. SOURCE-MANIFEST.md generation with roles
expected: SOURCE-MANIFEST.md lists ingested Markdown sources with original path, copied path, inferred role, evidence, and warnings.
result: pass
source: automated
coverage_id: D2

### 8. Duplicate basename collision prevention
expected: Copied source paths remain traceable and duplicate basenames do not overwrite one another.
result: pass
source: automated
coverage_id: D3

## Summary

total: 8
passed: 7
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

[none yet]
