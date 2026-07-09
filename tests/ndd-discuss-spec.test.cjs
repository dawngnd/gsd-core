const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');

const discuss = require('../gsd-core/bin/lib/ndd-discuss-spec.cjs');

function assertCommandOk(result) {
  assert.equal(result.exitCode, 0, result.error || result.output);
}

describe('NDD discuss spec', () => {
  let tmpDir;
  let changeWorkspaceDir;
  let changeSpecPath;
  let statusPath;

  function writeChangeSpec(content) {
    fs.writeFileSync(changeSpecPath, content);
  }

  function baseChangeSpec() {
    return [
      '# Change Spec: test-change',
      '',
      '## Confirmed Source-Backed Requirements',
      '',
      '- Checkout must support saved cards.',
      '',
      '## Ambiguities',
      '',
      '- API contract for saved-card token creation is unclear [source: api.md]',
      '- UI color preference unclear [source: proposal.md]',
      '',
      '## Conflicts',
      '',
      '- API doc requires token reuse while business doc forbids token reuse [source: api.md]',
      '',
      '## Open Questions',
      '',
      '- Should saved cards be defaulted on checkout? [source: business.md]',
      '',
    ].join('\n');
  }

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-discuss-');
    changeWorkspaceDir = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change');
    fs.mkdirSync(changeWorkspaceDir, { recursive: true });
    statusPath = path.join(changeWorkspaceDir, 'STATUS.json');
    changeSpecPath = path.join(changeWorkspaceDir, 'CHANGE-SPEC.md');

    fs.writeFileSync(statusPath, JSON.stringify({
      change_id: 'test-change',
      status: 'draft',
      phase: 'impact',
      source_folder: '/tmp/sources',
      source_count: 2,
      artifacts: {
        source_manifest: 'SOURCE-MANIFEST.md',
        change_spec: 'CHANGE-SPEC.md',
        impact: 'IMPACT.md',
      },
      warnings: ['existing warning'],
      created_at: '2026-07-08T00:00:00.000Z',
      updated_at: '2026-07-08T00:00:00.000Z',
    }, null, 2) + '\n');
    writeChangeSpec(baseChangeSpec());
    fs.writeFileSync(path.join(changeWorkspaceDir, 'IMPACT.md'), [
      '# Impact Analysis: test-change',
      '',
      '## Impact: Requirement R1 - "Saved cards"',
      '',
      '| File | Evidence | Source Ref | Discovered By | Confidence |',
      '|------|----------|------------|---------------|------------|',
      '| None identified | - | - | - | unknown |',
      '',
    ].join('\n'));
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  describe('extractAmbiguities', () => {
    test('extracts ambiguities from Ambiguities section as array', () => {
      const result = discuss.extractAmbiguities(baseChangeSpec());
      assert.equal(result.ambiguities.length, 2);
      assert.match(result.ambiguities[0].text, /API contract/);
    });

    test('extracts conflicts from Conflicts section', () => {
      const result = discuss.extractAmbiguities(baseChangeSpec());
      assert.equal(result.conflicts.length, 1);
      assert.match(result.conflicts[0].text, /token reuse/);
    });

    test('extracts open questions from Open Questions section', () => {
      const result = discuss.extractAmbiguities(baseChangeSpec());
      assert.equal(result.open_questions.length, 1);
      assert.match(result.open_questions[0].text, /defaulted/);
    });

    test('returns empty arrays when sections are missing', () => {
      const result = discuss.extractAmbiguities('# Spec\n\n## Notes\n\n- Nothing here\n');
      assert.deepEqual(result.ambiguities, []);
      assert.deepEqual(result.conflicts, []);
      assert.deepEqual(result.open_questions, []);
    });

    test('returns empty arrays when sections have no bullets', () => {
      const result = discuss.extractAmbiguities('# Spec\n\n## Ambiguities\n\nNo issues.\n');
      assert.deepEqual(result.ambiguities, []);
    });

    test('each ambiguity has severity, text, and section_ref fields', () => {
      const result = discuss.extractAmbiguities(baseChangeSpec());
      assert.equal(result.ambiguities[0].severity, 'critical');
      assert.ok(result.ambiguities[0].text);
      assert.equal(result.ambiguities[0].section_ref, 'CHANGE-SPEC.md#ambiguities');
    });
  });

  describe('classifyAmbiguitySeverity', () => {
    test('returns critical for api contract text', () => {
      assert.equal(discuss.classifyAmbiguitySeverity('API contract needs clarification'), 'critical');
    });

    test('returns critical for database schema text', () => {
      assert.equal(discuss.classifyAmbiguitySeverity('database schema is undefined'), 'critical');
    });

    test('returns critical for authentication text', () => {
      assert.equal(discuss.classifyAmbiguitySeverity('authentication path is unclear'), 'critical');
    });

    test('returns critical for breaking change text', () => {
      assert.equal(discuss.classifyAmbiguitySeverity('breaking change behavior is unclear'), 'critical');
    });

    test('returns non-critical for UI color preference text', () => {
      assert.equal(discuss.classifyAmbiguitySeverity('UI color preference unclear'), 'non-critical');
    });

    test('returns non-critical for documentation wording text', () => {
      assert.equal(discuss.classifyAmbiguitySeverity('Documentation wording TBD'), 'non-critical');
    });
  });

  describe('buildDiscussionSeeds', () => {
    test('merges CHANGE-SPEC ambiguities with IMPACT.md unknowns', () => {
      const impactContent = fs.readFileSync(path.join(changeWorkspaceDir, 'IMPACT.md'), 'utf-8');
      const result = discuss.buildDiscussionSeeds(baseChangeSpec(), impactContent);
      assert.equal(result.impact_unknowns.length, 1);
      assert.equal(result.impact_unknowns[0].requirement_id, 'R1');
    });

    test('handles null impactContent gracefully', () => {
      const result = discuss.buildDiscussionSeeds(baseChangeSpec(), null);
      assert.deepEqual(result.impact_unknowns, []);
    });

    test('critical ambiguities appear before non-critical ambiguities', () => {
      const result = discuss.buildDiscussionSeeds(baseChangeSpec(), null);
      assert.equal(result.ambiguities[0].severity, 'critical');
      assert.equal(result.ambiguities[1].severity, 'non-critical');
    });
  });

  describe('writeResolvedSection', () => {
    const resolutions = [{
      original_ref: 'CHANGE-SPEC.md#ambiguities',
      decision: 'Use saved-card token endpoint v2.',
      source: 'user',
      resolved_at: '2026-07-08T00:00:00.000Z',
    }];

    test('appends Resolved section to CHANGE-SPEC.md', () => {
      discuss.writeResolvedSection(changeSpecPath, resolutions);
      assert.match(fs.readFileSync(changeSpecPath, 'utf-8'), /## Resolved/);
    });

    test('preserves original Ambiguities section content after write', () => {
      discuss.writeResolvedSection(changeSpecPath, resolutions);
      assert.match(fs.readFileSync(changeSpecPath, 'utf-8'), /API contract for saved-card token creation is unclear/);
    });

    test('preserves original Conflicts section content after write', () => {
      discuss.writeResolvedSection(changeSpecPath, resolutions);
      assert.match(fs.readFileSync(changeSpecPath, 'utf-8'), /business doc forbids token reuse/);
    });

    test('appends Acceptance Criteria section', () => {
      discuss.writeResolvedSection(changeSpecPath, resolutions);
      assert.match(fs.readFileSync(changeSpecPath, 'utf-8'), /## Acceptance Criteria/);
    });

    test('appends Scope section with In Scope and Out of Scope', () => {
      discuss.writeResolvedSection(changeSpecPath, resolutions);
      const content = fs.readFileSync(changeSpecPath, 'utf-8');
      assert.match(content, /## Scope/);
      assert.match(content, /### In Scope/);
      assert.match(content, /### Out of Scope/);
    });

    test('calling twice replaces previous Resolved section instead of duplicating it', () => {
      discuss.writeResolvedSection(changeSpecPath, resolutions);
      discuss.writeResolvedSection(changeSpecPath, [{ ...resolutions[0], decision: 'Use endpoint v3.' }]);
      const content = fs.readFileSync(changeSpecPath, 'utf-8');
      assert.equal((content.match(/## Resolved/g) || []).length, 1);
      assert.match(content, /Use endpoint v3/);
      assert.doesNotMatch(content, /Use saved-card token endpoint v2/);
    });

    test('calling twice preserves existing Acceptance Criteria and Scope content', () => {
      discuss.writeResolvedSection(changeSpecPath, resolutions);
      fs.writeFileSync(
        changeSpecPath,
        fs.readFileSync(changeSpecPath, 'utf-8')
          .replace('- TODO: Add user-approved acceptance criteria during NDD discussion.', '- Given saved card token, checkout succeeds.')
          .replace('- TODO: Add approved in-scope work during NDD discussion.', '- Saved card checkout')
          .replace('- TODO: Add approved out-of-scope work during NDD discussion.', '- New payment providers'),
      );
      discuss.writeResolvedSection(changeSpecPath, [{ ...resolutions[0], decision: 'Use endpoint v3.' }]);
      const content = fs.readFileSync(changeSpecPath, 'utf-8');
      assert.match(content, /Given saved card token, checkout succeeds/);
      assert.match(content, /Saved card checkout/);
      assert.match(content, /New payment providers/);
    });

    test('each resolution bullet contains original_ref, decision, and source fields', () => {
      discuss.writeResolvedSection(changeSpecPath, resolutions);
      const content = fs.readFileSync(changeSpecPath, 'utf-8');
      assert.match(content, /\*\*\[CHANGE-SPEC.md#ambiguities\]\*\*/);
      assert.match(content, /Use saved-card token endpoint v2/);
      assert.match(content, /source: user/);
    });
  });

  describe('hasCriticalUnresolved', () => {
    test('returns true when seeds contain critical ambiguity', () => {
      assert.equal(discuss.hasCriticalUnresolved(discuss.extractAmbiguities(baseChangeSpec())), true);
    });

    test('returns false when seeds contain only non-critical ambiguities', () => {
      const seeds = discuss.extractAmbiguities('# Spec\n\n## Ambiguities\n\n- UI color preference unclear\n');
      assert.equal(discuss.hasCriticalUnresolved(seeds), false);
    });

    test('returns false when seeds have empty ambiguities array', () => {
      assert.equal(discuss.hasCriticalUnresolved({ ambiguities: [], conflicts: [], open_questions: [], impact_unknowns: [] }), false);
    });
  });

  describe('updateApprovalStatus', () => {
    test('sets STATUS.json status to approved and phase to approved', () => {
      const result = discuss.updateApprovalStatus(tmpDir, 'test-change', 'approved');
      assert.equal(result.ok, true);
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      assert.equal(status.status, 'approved');
      assert.equal(status.phase, 'approved');
    });

    test('writes approval_status approved into CHANGE-SPEC.md frontmatter', () => {
      discuss.updateApprovalStatus(tmpDir, 'test-change', 'approved');
      assert.match(fs.readFileSync(changeSpecPath, 'utf-8'), /^approval_status: approved/m);
    });

    test('updates Status and Approval lines in CHANGE-SPEC.md body', () => {
      discuss.updateApprovalStatus(tmpDir, 'test-change', 'approved');
      const content = fs.readFileSync(changeSpecPath, 'utf-8');
      assert.match(content, /- Status: approved/);
      assert.match(content, /- Approval: approved/);
    });

    test('returns ok false for non-existent workspace', () => {
      const result = discuss.updateApprovalStatus(tmpDir, 'missing-change', 'approved');
      assert.equal(result.ok, false);
    });

    test('preserves existing STATUS.json fields after update', () => {
      discuss.updateApprovalStatus(tmpDir, 'test-change', 'approved');
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      assert.equal(status.change_id, 'test-change');
      assert.equal(status.source_folder, '/tmp/sources');
      assert.deepEqual(status.artifacts.change_spec, 'CHANGE-SPEC.md');
      assert.deepEqual(status.warnings, ['existing warning']);
    });
  });

  describe('DISC-05 gate: critical ambiguity blocks planning', () => {
    test('discuss-check returns has_critical_unresolved true when critical ambiguity exists', () => {
      const result = runGsdTools('ndd discuss-check test-change', tmpDir);
      assertCommandOk(result);
      const parsed = JSON.parse(result.output);
      assert.equal(parsed.has_critical_unresolved, true);
      assert.equal(parsed.critical_count, 1);
    });

    test('discuss-check returns has_critical_unresolved false with only non-critical ambiguities', () => {
      writeChangeSpec('# Spec\n\n## Ambiguities\n\n- UI color preference unclear\n');
      const result = runGsdTools('ndd discuss-check test-change', tmpDir);
      const parsed = JSON.parse(result.output);
      assert.equal(parsed.has_critical_unresolved, false);
      assert.equal(parsed.critical_count, 0);
    });

    test('discuss-check returns approved false when status is not approved', () => {
      const result = runGsdTools('ndd discuss-check test-change', tmpDir);
      const parsed = JSON.parse(result.output);
      assert.equal(parsed.approved, false);
    });

    test('after discuss-update approved, discuss-check returns approved true', () => {
      const update = runGsdTools('ndd discuss-update test-change approved', tmpDir);
      assertCommandOk(update);
      const check = runGsdTools('ndd discuss-check test-change', tmpDir);
      assertCommandOk(check);
      const parsed = JSON.parse(check.output);
      assert.equal(parsed.approved, true);
    });
  });

  describe('CLI integration: ndd discuss subcommands', () => {
    test('gsd-tools ndd discuss returns JSON with ambiguities array', () => {
      const result = runGsdTools('ndd discuss test-change', tmpDir);
      assertCommandOk(result);
      const parsed = JSON.parse(result.output);
      assert.equal(parsed.ok, true);
      assert.ok(Array.isArray(parsed.ambiguities));
    });

    test('gsd-tools ndd discuss without args returns usage error', () => {
      const result = runGsdTools('ndd discuss', tmpDir);
      assert.equal(result.success, false);
      assert.match(result.error, /Usage/);
    });

    test('gsd-tools ndd discuss-update approved succeeds and returns ok true', () => {
      const result = runGsdTools('ndd discuss-update test-change approved', tmpDir);
      assertCommandOk(result);
      const parsed = JSON.parse(result.output);
      assert.equal(parsed.ok, true);
    });

    test('gsd-tools ndd discuss-update invalid returns invalid status error', () => {
      const result = runGsdTools('ndd discuss-update test-change invalid', tmpDir);
      assert.equal(result.success, false);
      assert.match(result.error, /Approval status/);
    });

    test('gsd-tools ndd discuss-check returns gate fields', () => {
      const result = runGsdTools('ndd discuss-check test-change', tmpDir);
      assertCommandOk(result);
      const parsed = JSON.parse(result.output);
      assert.equal(Object.hasOwn(parsed, 'has_critical_unresolved'), true);
      assert.equal(Object.hasOwn(parsed, 'approved'), true);
    });

    test('gsd-tools ndd discuss-check without args returns usage error', () => {
      const result = runGsdTools('ndd discuss-check', tmpDir);
      assert.equal(result.success, false);
      assert.match(result.error, /Usage/);
    });
  });
});
