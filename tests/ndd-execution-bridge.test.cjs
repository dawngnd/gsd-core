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
  fs.writeFileSync(changeSpecPath, overrides.changeSpec ?? baseChangeSpec());
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

describe('EXEC-01: Execute gate enforcement', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-exec-bridge-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('execute fails when phase-link.md is missing', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    buildPhaseFixture(tmpDir, '06', 'execution-bridge');

    const execResult = runGsdTools('ndd execute test-change', tmpDir);
    assert.equal(execResult.success, false);
    assert.match(execResult.error, /Phase-link metadata not found/);
  });

  test('execute fails when no plan files exist in phase dir', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    buildPhaseFixture(tmpDir, '06', 'execution-bridge');

    // Link but don't write plan file
    const relPhaseDir = '.planning/phases/06-execution-bridge';
    buildPhaseLinkFixture(tmpDir, 'test-change', '06', relPhaseDir, [`${relPhaseDir}/06-01-PLAN.md`]);

    // Rel Phase dir is empty of *-PLAN.md
    const execResult = runGsdTools('ndd execute test-change', tmpDir);
    assert.equal(execResult.success, false);
    assert.match(execResult.error, /No plan files found/);
  });

  test('execute succeeds with valid phase-link.md and plan files', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    const { phaseDir } = buildPhaseFixture(tmpDir, '06', 'execution-bridge');
    
    // Create plan file
    fs.writeFileSync(path.join(phaseDir, '06-01-PLAN.md'), '# Plan\n');

    // Link
    const relPhaseDir = '.planning/phases/06-execution-bridge';
    buildPhaseLinkFixture(tmpDir, 'test-change', '06', relPhaseDir, [`${relPhaseDir}/06-01-PLAN.md`]);

    const execResult = runGsdTools('ndd execute test-change', tmpDir);
    assertCommandOk(execResult);

    const data = JSON.parse(execResult.output);
    assert.equal(data.ok, true);
    assert.equal(data.gate_passed, true);
  });
});

describe('EXEC-01: Dual-path resolution', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-exec-bridge-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('change-id input resolves via phase-link.md', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    const { phaseDir } = buildPhaseFixture(tmpDir, '06', 'execution-bridge');
    fs.writeFileSync(path.join(phaseDir, '06-01-PLAN.md'), '# Plan\n');
    const relPhaseDir = '.planning/phases/06-execution-bridge';
    buildPhaseLinkFixture(tmpDir, 'test-change', '06', relPhaseDir, [`${relPhaseDir}/06-01-PLAN.md`]);

    const execResult = runGsdTools('ndd execute test-change', tmpDir);
    assertCommandOk(execResult);

    const data = JSON.parse(execResult.output);
    assert.equal(data.change_id, 'test-change');
    assert.equal(data.phase_id, '06');
  });

  test('phase-id input resolves via reverse scan', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    const { phaseDir } = buildPhaseFixture(tmpDir, '06', 'execution-bridge');
    fs.writeFileSync(path.join(phaseDir, '06-01-PLAN.md'), '# Plan\n');
    const relPhaseDir = '.planning/phases/06-execution-bridge';
    buildPhaseLinkFixture(tmpDir, 'test-change', '06', relPhaseDir, [`${relPhaseDir}/06-01-PLAN.md`]);

    const execResult = runGsdTools('ndd execute 06', tmpDir);
    assertCommandOk(execResult);

    const data = JSON.parse(execResult.output);
    assert.equal(data.change_id, 'test-change');
    assert.equal(data.phase_id, '06');
  });

  test('phase-id with no linked change returns error', () => {
    buildPhaseFixture(tmpDir, '06', 'execution-bridge');

    const execResult = runGsdTools('ndd execute 06', tmpDir);
    assert.equal(execResult.success, false);
    assert.match(execResult.error, /No NDD change found linked to phase/);
  });

  test('phase-id with multiple linked changes returns ambiguity error', () => {
    buildChangeWorkspace(tmpDir, 'test-change-1');
    buildChangeWorkspace(tmpDir, 'test-change-2');
    const { phaseDir } = buildPhaseFixture(tmpDir, '06', 'execution-bridge');
    fs.writeFileSync(path.join(phaseDir, '06-01-PLAN.md'), '# Plan\n');
    const relPhaseDir = '.planning/phases/06-execution-bridge';
    buildPhaseLinkFixture(tmpDir, 'test-change-1', '06', relPhaseDir, [`${relPhaseDir}/06-01-PLAN.md`]);
    buildPhaseLinkFixture(tmpDir, 'test-change-2', '06', relPhaseDir, [`${relPhaseDir}/06-01-PLAN.md`]);

    const execResult = runGsdTools('ndd execute 06', tmpDir);
    assert.equal(execResult.success, false);
    assert.match(execResult.error, /Multiple NDD changes linked to phase/);
  });

  test('missing arg returns usage error', () => {
    const execResult = runGsdTools('ndd execute', tmpDir);
    assert.equal(execResult.success, false);
    assert.match(execResult.error, /Usage/);
  });
});

describe('EXEC-02: Traceability output fields', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-exec-bridge-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('JSON output includes change_id, phase_id, phase_dir, plan_files, phase_link_path', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    const { phaseDir } = buildPhaseFixture(tmpDir, '06', 'execution-bridge');
    fs.writeFileSync(path.join(phaseDir, '06-01-PLAN.md'), '# Plan\n');
    const relPhaseDir = '.planning/phases/06-execution-bridge';
    buildPhaseLinkFixture(tmpDir, 'test-change', '06', relPhaseDir, [`${relPhaseDir}/06-01-PLAN.md`]);

    const execResult = runGsdTools('ndd execute test-change', tmpDir);
    assertCommandOk(execResult);

    const data = JSON.parse(execResult.output);
    assert.equal(data.change_id, 'test-change');
    assert.equal(data.phase_id, '06');
    assert.equal(data.phase_dir, '.planning/phases/06-execution-bridge');
    assert.equal(data.phase_link_path, '.planning/ndd/changes/test-change/phase-link.md');
    assert.ok(Array.isArray(data.plan_files));
  });

  test('plan_files array lists actual PLAN.md filenames', () => {
    buildChangeWorkspace(tmpDir, 'test-change');
    const { phaseDir } = buildPhaseFixture(tmpDir, '06', 'execution-bridge');
    fs.writeFileSync(path.join(phaseDir, '06-01-PLAN.md'), '# Plan 1\n');
    fs.writeFileSync(path.join(phaseDir, '06-02-PLAN.md'), '# Plan 2\n');
    const relPhaseDir = '.planning/phases/06-execution-bridge';
    buildPhaseLinkFixture(tmpDir, 'test-change', '06', relPhaseDir, [
      `${relPhaseDir}/06-01-PLAN.md`,
      `${relPhaseDir}/06-02-PLAN.md`
    ]);

    const execResult = runGsdTools('ndd execute test-change', tmpDir);
    assertCommandOk(execResult);

    const data = JSON.parse(execResult.output);
    assert.deepEqual(data.plan_files.sort(), [
      '.planning/phases/06-execution-bridge/06-01-PLAN.md',
      '.planning/phases/06-execution-bridge/06-02-PLAN.md'
    ].sort());
  });
});

describe('EXEC-03: Workflow adapter content', () => {
  const executePhasePath = path.join(__dirname, '..', 'commands', 'ndd', 'execute-phase.md');

  test('execute-phase.md references canonical GSD execute-phase', () => {
    const content = fs.readFileSync(executePhasePath, 'utf-8');
    assert.match(content, /gsd-execute-phase/);
  });

  test('execute-phase.md references gsd-tools ndd execute', () => {
    const content = fs.readFileSync(executePhasePath, 'utf-8');
    assert.match(content, /gsd-tools ndd execute/);
  });

  test('execute-phase.md does not define independent executor flow', () => {
    const content = fs.readFileSync(executePhasePath, 'utf-8');
    assert.match(content, /Do not copy or inline executor internals/i);
  });

  test('execute-phase.md does not update STATUS.json', () => {
    const content = fs.readFileSync(executePhasePath, 'utf-8');
    assert.doesNotMatch(content, /writeStatus/i);
    assert.doesNotMatch(content, /STATUS\.json.*update/i);
  });
});
