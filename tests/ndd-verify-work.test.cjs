const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');

function assertCommandOk(result) {
  assert.equal(result.exitCode, 0, result.error || result.output);
}

function baseChangeSpec(criteria = ['Ensure first behavior works.', 'Ensure second behavior works.']) {
  return [
    '---',
    'approval_status: approved',
    '---',
    '# Change Spec: test-change',
    '',
    '## Acceptance Criteria',
    '',
    ...criteria.map(c => `- ${c}`),
  ].join('\n');
}

function approvedStatus(changeId = 'test-change') {
  return JSON.stringify({
    change_id: changeId,
    status: 'approved',
    phase: 'plan',
    source_folder: '/tmp/test-change',
    source_count: 1,
    artifacts: {
      source_manifest: 'SOURCE-MANIFEST.md',
      change_spec: 'CHANGE-SPEC.md',
    },
    warnings: [],
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
  }, null, 2) + '\n';
}

function buildChangeWorkspace(tmpDir, changeId = 'test-change', overrides = {}) {
  const changeWorkspaceDir = path.join(tmpDir, '.planning', 'ndd', 'changes', changeId);
  fs.mkdirSync(changeWorkspaceDir, { recursive: true });

  const statusPath = path.join(changeWorkspaceDir, 'STATUS.json');
  const changeSpecPath = path.join(changeWorkspaceDir, 'CHANGE-SPEC.md');
  const impactPath = path.join(changeWorkspaceDir, 'IMPACT.md');

  fs.writeFileSync(statusPath, overrides.status ?? approvedStatus(changeId));
  fs.writeFileSync(changeSpecPath, overrides.changeSpec ?? baseChangeSpec(overrides.criteria));
  fs.writeFileSync(impactPath, '# Impact\n');

  return { changeWorkspaceDir };
}

function buildPhaseFixture(tmpDir, phaseNum, phaseName, status = 'passed') {
  const phaseDir = path.join(tmpDir, '.planning', 'phases', `${phaseNum}-${phaseName}`);
  fs.mkdirSync(phaseDir, { recursive: true });

  const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
  const roadmapContent = [
    '# Roadmap',
    '',
    '## Phases',
    '',
    `- [ ] **Phase ${phaseNum}: ${phaseName}** - Test phase.`,
    '',
    '## Phase Details',
    '',
    `### Phase ${phaseNum}: ${phaseName}`,
    '',
    '**Goal**: Test.',
    `**Depends on**: Nothing`,
    '**Requirements**: []',
    '**Success Criteria** (what must be TRUE):',
    '',
    '  1. Test passes.',
    '',
    '**Plans**: 1 plans',
    '',
    'Plans:',
    '',
    `- [ ] ${phaseNum}-01-PLAN.md`,
    '',
  ].join('\n');
  if (!fs.existsSync(roadmapPath)) {
    fs.writeFileSync(roadmapPath, roadmapContent);
  }

  // Create GSD verification file
  const verificationFilePath = path.join(phaseDir, `${phaseNum}-VERIFICATION.md`);
  fs.writeFileSync(verificationFilePath, [
    '---',
    `status: ${status}`,
    '---',
    '# Verification',
    '',
    'Evidence: Ensure first behavior works.',
  ].join('\n'));

  return { phaseDir };
}

function buildPhaseLinkFixture(tmpDir, changeId, phaseId, phaseDir, planFiles) {
  const changeWorkspaceDir = path.join(tmpDir, '.planning', 'ndd', 'changes', changeId);
  fs.mkdirSync(changeWorkspaceDir, { recursive: true });
  const phaseLinkPath = path.join(changeWorkspaceDir, 'phase-link.md');

  const content = [
    `# NDD Phase Link: ${changeId}`,
    '',
    `- Change id: ${changeId}`,
    `- GSD phase id: ${phaseId}`,
    `- GSD phase directory: ${phaseDir}`,
    `- Linked at: 2026-01-01T00:00:00.000Z`,
    '',
    '## Plan Files',
    '',
    ...planFiles.map(planFile => `- ${planFile}`),
    '',
    '## Source Artifacts',
    '',
    `- STATUS.json: .planning/ndd/changes/${changeId}/STATUS.json`,
    `- CHANGE-SPEC.md: .planning/ndd/changes/${changeId}/CHANGE-SPEC.md`,
    `- IMPACT.md: .planning/ndd/changes/${changeId}/IMPACT.md`,
    `- CONTEXT.md: .planning/ndd/changes/${changeId}/CONTEXT.md`,
    '',
  ].join('\n');

  fs.writeFileSync(phaseLinkPath, content);
}

describe('VERF-01: GSD verification gating', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-verify-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('verification fails when GSD verification is not passed', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'failed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd verify test-change', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /Canonical GSD verification is not passed/);
  });

  test('verification fails when Acceptance Criteria is missing', () => {
    buildChangeWorkspace(tmpDir, 'test-change', {
      changeSpec: '# Change Spec\nNo criteria section\n'
    });
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd verify test-change', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /No "## Acceptance Criteria" section was found/);
  });

  test('verification fails when Acceptance Criteria is empty', () => {
    buildChangeWorkspace(tmpDir, 'test-change', {
      changeSpec: '# Change Spec\n## Acceptance Criteria\n\n'
    });
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd verify test-change', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /Acceptance Criteria.*is empty/);
  });
});

describe('VERF-02: NDD Verification output and status updates', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-verify-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('writes VERIFICATION.md and updates STATUS.json when verification succeeds', () => {
    buildChangeWorkspace(tmpDir, 'test-change', {
      criteria: ['Ensure first behavior works.']
    });
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd verify test-change', tmpDir);
    assertCommandOk(result);

    const data = JSON.parse(result.output);
    assert.equal(data.ok, true);
    assert.equal(data.gate_passed, true);
    assert.equal(data.requires_override, false);

    // Verify file output
    const verificationPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'VERIFICATION.md');
    assert.ok(fs.existsSync(verificationPath));
    const content = fs.readFileSync(verificationPath, 'utf-8');
    assert.match(content, /Passed \(Evidence\)/);

    // Verify STATUS.json update
    const statusPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'STATUS.json');
    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    assert.equal(statusData.verified, true);
    assert.ok(statusData.verification_path);
    assert.ok(statusData.verified_at);
  });

  test('requires_override is true when criteria has no evidence', () => {
    buildChangeWorkspace(tmpDir, 'test-change', {
      criteria: ['Unmatched criterion.']
    });
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd verify test-change', tmpDir);
    assertCommandOk(result);

    const data = JSON.parse(result.output);
    assert.equal(data.ok, true);
    assert.equal(data.gate_passed, false);
    assert.equal(data.requires_override, true);

    // Verify STATUS.json is NOT updated
    const statusPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'STATUS.json');
    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    assert.notEqual(statusData.verified, true);
  });

  test('succeeds when unmatched criterion is supplied with override', () => {
    buildChangeWorkspace(tmpDir, 'test-change', {
      criteria: ['Unmatched criterion.']
    });
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools([
      'ndd', 'verify', 'test-change',
      '--override-criterion', 'Unmatched criterion.',
      '--override-reason', 'Manual verification approved',
      '--override-person', 'John Doe'
    ], tmpDir);
    assertCommandOk(result);

    const data = JSON.parse(result.output);
    assert.equal(data.ok, true);
    assert.equal(data.gate_passed, true);
    assert.equal(data.requires_override, false);

    // Verify STATUS.json update
    const statusPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'STATUS.json');
    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    assert.equal(statusData.verified, true);
  });
});

