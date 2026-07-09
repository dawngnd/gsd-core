const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');

function assertCommandOk(result) {
  assert.equal(result.exitCode, 0, result.error || result.output);
}

function baseChangeSpec() {
  return [
    '---',
    'approval_status: approved',
    '---',
    '# Change Spec: test-change',
    '',
    '## Acceptance Criteria',
    '',
    '- Ensure behavior works.',
  ].join('\n');
}

function verifiedStatus(changeId = 'test-change', verified = true) {
  return JSON.stringify({
    change_id: changeId,
    status: 'approved',
    phase: 'plan',
    verified,
    verification_path: `.planning/ndd/changes/${changeId}/VERIFICATION.md`,
    verified_at: '2026-07-08T00:00:00.000Z',
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

  fs.writeFileSync(statusPath, overrides.status ?? verifiedStatus(changeId, overrides.verified));
  fs.writeFileSync(changeSpecPath, overrides.changeSpec ?? baseChangeSpec());
  fs.writeFileSync(impactPath, '# Impact\n');

  if (overrides.writeVerificationFile !== false) {
    const verificationPath = path.join(changeWorkspaceDir, 'VERIFICATION.md');
    fs.writeFileSync(verificationPath, '# Verification Output\n');
  }

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
    'Evidence: Ensure behavior works.',
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

describe('SHIP-01: NDD Ship gating', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-ship-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('ship fails when NDD is not verified in STATUS.json', () => {
    buildChangeWorkspace(tmpDir, 'test-change', { verified: false });
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd ship test-change', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /has not been successfully verified/);
  });

  test('ship fails when VERIFICATION.md is missing', () => {
    buildChangeWorkspace(tmpDir, 'test-change', { writeVerificationFile: false });
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd ship test-change', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /verification file was not found/);
  });

  test('ship fails when GSD verification is not passed', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'failed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd ship test-change', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /GSD verification status is not passed/);
  });

  test('ship succeeds and writes SHIP-CONTEXT.md when gates pass', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd ship test-change', tmpDir);
    assertCommandOk(result);

    const data = JSON.parse(result.output);
    assert.equal(data.ok, true);
    assert.equal(data.gate_passed, true);
    assert.ok(data.ship_context_path);

    // Verify context file is written
    const contextPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'SHIP-CONTEXT.md');
    assert.ok(fs.existsSync(contextPath));
    const content = fs.readFileSync(contextPath, 'utf-8');
    assert.match(content, /NDD Ship Context/);
  });
});

describe('SHIP-02: NDD Ship status updates', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-ship-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('ship-shipped updates STATUS.json with shipped=true and optional PR metadata', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools([
      'ndd', 'ship-shipped', 'test-change',
      '--pr-url', 'https://github.com/org/repo/pull/42',
      '--pr-number', '42'
    ], tmpDir);
    assertCommandOk(result);

    const statusPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'STATUS.json');
    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    assert.equal(statusData.shipped, true);
    assert.equal(statusData.pr_url, 'https://github.com/org/repo/pull/42');
    assert.equal(statusData.pr_number, 42);
    assert.ok(statusData.shipped_at);
  });

  test('ship-shipped without PR metadata still sets shipped=true', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools('ndd ship-shipped test-change', tmpDir);
    assertCommandOk(result);

    const statusPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'STATUS.json');
    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    assert.equal(statusData.shipped, true);
    assert.equal(statusData.pr_url, undefined);
    assert.equal(statusData.pr_number, undefined);
    assert.ok(statusData.shipped_at);
  });

  test('ship-blocked sets STATUS.json ship_status to blocked with reason', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening', 'passed');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    const result = runGsdTools(['ndd', 'ship-blocked', 'test-change', 'dirty working tree'], tmpDir);
    assertCommandOk(result);

    const statusPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'STATUS.json');
    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    assert.equal(statusData.ship_status, 'ship_blocked');
    assert.equal(statusData.ship_blocker, 'dirty working tree');
  });
});
