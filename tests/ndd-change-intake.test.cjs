const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir, cleanup } = require('./helpers.cjs');

const intake = require('../gsd-core/bin/lib/ndd-change-intake.cjs');

describe('NDD change intake helpers', () => {
  let tmpDir;
  let sourceDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-intake-');
    sourceDir = path.join(tmpDir, 'Feature Docs');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'Proposal.md'), '# Proposal\n');
    fs.mkdirSync(path.join(sourceDir, 'api'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'api', 'Contract.MD'), '# API\n');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('resolves explicit valid ids under .planning/ndd/changes', () => {
    const result = intake.resolveChangeWorkspace(tmpDir, 'billing-flow-2');

    assert.equal(result.ok, true);
    assert.equal(result.change_id, 'billing-flow-2');
    assert.equal(result.workspace_dir, path.join(tmpDir, '.planning', 'ndd', 'changes', 'billing-flow-2'));
    assert.equal(result.relative_workspace_dir, path.join('.planning', 'ndd', 'changes', 'billing-flow-2'));
  });

  test('rejects unsafe ids with structured validation errors', () => {
    const cases = [
      ['', 'empty'],
      ['Billing', 'unsafe_characters'],
      ['../billing', 'path_separator'],
      ['billing/flow', 'path_separator'],
      ['billing.flow', 'unsafe_characters'],
      ['..', 'dot_segment'],
      ['con', 'reserved'],
      ['status', 'reserved'],
    ];

    for (const [id, code] of cases) {
      const result = intake.resolveChangeWorkspace(tmpDir, id);
      assert.equal(result.ok, false, `expected ${id} to be rejected`);
      assert.equal(result.error.code, code);
    }
  });

  test('generates stable safe ids from folder basename and markdown file set', () => {
    const first = intake.generateChangeId(sourceDir);
    const second = intake.generateChangeId(sourceDir);

    assert.equal(first.change_id, second.change_id);
    assert.match(first.change_id, /^feature-docs-[a-f0-9]{10}$/);
    assert.deepEqual(first.markdown_files, ['Proposal.md', 'api/Contract.MD']);
  });

  test('generated suffix changes when the markdown file set changes', () => {
    const before = intake.generateChangeId(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'acceptance.markdown'), '# Acceptance\n');
    const after = intake.generateChangeId(sourceDir);

    assert.notEqual(before.change_id, after.change_id);
    assert.equal(before.stem, after.stem);
  });

  test('creates parseable STATUS.json with required intake fields', () => {
    const result = intake.initializeChangeWorkspace({
      projectRoot: tmpDir,
      changeId: 'billing-flow',
      sourceFolder: sourceDir,
      sourceCount: 2,
      now: '2026-07-08T00:00:00.000Z',
    });

    assert.equal(result.resumed, false);
    const parsed = JSON.parse(fs.readFileSync(result.status_path, 'utf-8'));
    assert.deepEqual(parsed, {
      change_id: 'billing-flow',
      status: 'draft',
      phase: 'intake',
      source_folder: sourceDir,
      source_count: 2,
      artifacts: {
        source_manifest: 'SOURCE-MANIFEST.md',
        change_spec: 'CHANGE-SPEC.md',
      },
      warnings: [],
      created_at: '2026-07-08T00:00:00.000Z',
      updated_at: '2026-07-08T00:00:00.000Z',
    });
  });

  test('resumes existing STATUS.json without clobbering unrelated fields', () => {
    const first = intake.initializeChangeWorkspace({
      projectRoot: tmpDir,
      changeId: 'billing-flow',
      sourceFolder: sourceDir,
      sourceCount: 2,
      now: '2026-07-08T00:00:00.000Z',
    });
    const status = JSON.parse(fs.readFileSync(first.status_path, 'utf-8'));
    status.status = 'clarifying';
    status.phase = 'discussion';
    status.review_notes = ['keep me'];
    fs.writeFileSync(first.status_path, JSON.stringify(status, null, 2) + '\n');

    const resumed = intake.initializeChangeWorkspace({
      projectRoot: tmpDir,
      changeId: 'billing-flow',
      sourceFolder: path.join(tmpDir, 'other-docs'),
      sourceCount: 99,
      now: '2026-07-08T01:00:00.000Z',
    });

    assert.equal(resumed.resumed, true);
    const parsed = JSON.parse(fs.readFileSync(resumed.status_path, 'utf-8'));
    assert.equal(parsed.status, 'clarifying');
    assert.equal(parsed.phase, 'discussion');
    assert.deepEqual(parsed.review_notes, ['keep me']);
    assert.equal(parsed.source_folder, sourceDir);
    assert.equal(parsed.source_count, 2);
    assert.equal(parsed.created_at, '2026-07-08T00:00:00.000Z');
    assert.equal(parsed.updated_at, '2026-07-08T01:00:00.000Z');
  });

  test('can intentionally update intake metadata on resume', () => {
    intake.initializeChangeWorkspace({
      projectRoot: tmpDir,
      changeId: 'billing-flow',
      sourceFolder: sourceDir,
      sourceCount: 2,
      now: '2026-07-08T00:00:00.000Z',
    });

    const updated = intake.initializeChangeWorkspace({
      projectRoot: tmpDir,
      changeId: 'billing-flow',
      sourceFolder: path.join(tmpDir, 'updated-docs'),
      sourceCount: 3,
      warnings: ['new warning'],
      now: '2026-07-08T01:00:00.000Z',
      updateIntakeMetadata: true,
    });

    assert.equal(updated.status.source_folder, path.join(tmpDir, 'updated-docs'));
    assert.equal(updated.status.source_count, 3);
    assert.deepEqual(updated.status.warnings, ['new warning']);
  });
});

