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

function buildChangeWorkspace(tmpDir, changeId = 'test-change') {
  const changeWorkspaceDir = path.join(tmpDir, '.planning', 'ndd', 'changes', changeId);
  fs.mkdirSync(changeWorkspaceDir, { recursive: true });

  const statusPath = path.join(changeWorkspaceDir, 'STATUS.json');
  const changeSpecPath = path.join(changeWorkspaceDir, 'CHANGE-SPEC.md');
  const impactPath = path.join(changeWorkspaceDir, 'IMPACT.md');

  fs.writeFileSync(statusPath, approvedStatus(changeId));
  fs.writeFileSync(changeSpecPath, baseChangeSpec());
  fs.writeFileSync(impactPath, '# Impact\n');

  return { changeWorkspaceDir };
}

function buildPhaseFixture(tmpDir, phaseNum, phaseName) {
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
    'status: passed',
    '---',
    '# Verification',
    '',
    'Evidence: Ensure behavior works.',
  ].join('\n'));

  // Create GSD UAT file
  const uatFilePath = path.join(phaseDir, `${phaseNum}-UAT.md`);
  fs.writeFileSync(uatFilePath, '# UAT\n');

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

describe('MNT-03: E2E NDD Lifecycle', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-lifecycle-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('E2E lifecycle from verify to ship succeeds', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    buildPhaseFixture(tmpDir, '07', 'verification-ship-and-hardening');
    const relPhaseDir = '.planning/phases/07-verification-ship-and-hardening';
    buildPhaseLinkFixture(tmpDir, 'test-change', '07', relPhaseDir, [`${relPhaseDir}/07-01-PLAN.md`]);

    // 1. Run ndd verify
    const verifyResult = runGsdTools('ndd verify test-change', tmpDir);
    assertCommandOk(verifyResult);
    const verifyData = JSON.parse(verifyResult.output);
    assert.equal(verifyData.ok, true);
    assert.equal(verifyData.gate_passed, true);

    // Verify STATUS.json verified state
    const statusPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'STATUS.json');
    const statusDataAfterVerify = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    assert.equal(statusDataAfterVerify.verified, true);

    // 2. Run ndd ship
    const shipResult = runGsdTools('ndd ship test-change', tmpDir);
    assertCommandOk(shipResult);
    const shipData = JSON.parse(shipResult.output);
    assert.equal(shipData.ok, true);
    assert.equal(shipData.gate_passed, true);
    assert.equal(shipData.phase_id, '07');
    assert.ok(shipData.ship_context_path);

    const shipContextPath = path.join(tmpDir, shipData.ship_context_path);
    assert.ok(fs.existsSync(shipContextPath));

    // 3. Mark shipped
    const shippedResult = runGsdTools([
      'ndd', 'ship-shipped', 'test-change',
      '--pr-url', 'https://github.com/org/repo/pull/123',
      '--pr-number', '123'
    ], tmpDir);
    assertCommandOk(shippedResult);

    const statusDataAfterShip = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    assert.equal(statusDataAfterShip.shipped, true);
    assert.equal(statusDataAfterShip.pr_url, 'https://github.com/org/repo/pull/123');
    assert.equal(statusDataAfterShip.pr_number, 123);
  });
});

describe('MNT-03: NDD workflow documentation and adapter verification', () => {
  const verifyPath = path.join(__dirname, '..', 'commands', 'ndd', 'verify-work.md');
  const shipPath = path.join(__dirname, '..', 'commands', 'ndd', 'ship.md');
  const lifecycleDocPath = path.join(__dirname, '..', 'docs', 'how-to', 'ndd-brownfield-change-workflow.md');

  test('verify-work.md and ship.md reference correct helper and GSD commands', () => {
    const verifyContent = fs.readFileSync(verifyPath, 'utf-8');
    assert.match(verifyContent, /gsd-tools ndd verify/);
    assert.match(verifyContent, /gsd-verify-work/);

    const shipContent = fs.readFileSync(shipPath, 'utf-8');
    assert.match(shipContent, /gsd-tools ndd ship/);
    assert.match(shipContent, /gsd-tools ndd ship-shipped/);
    assert.match(shipContent, /gsd-ship/);
  });

  test('ndd-brownfield-change-workflow.md documents correct lifecycle flow and artifacts', () => {
    const lifecycleContent = fs.readFileSync(lifecycleDocPath, 'utf-8');
    assert.match(lifecycleContent, /ndd-change → ndd-impact → ndd-discuss-phase → ndd-plan-phase → ndd-execute-phase → ndd-verify-work → ndd-ship/);
    assert.match(lifecycleContent, /STATUS\.json/);
    assert.match(lifecycleContent, /CHANGE-SPEC\.md/);
    assert.match(lifecycleContent, /IMPACT\.md/);
    assert.match(lifecycleContent, /VERIFICATION\.md/);
    assert.match(lifecycleContent, /SHIP-CONTEXT\.md/);
  });
});
