const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');

const bridge = require('../gsd-core/bin/lib/ndd-plan-bridge.cjs');

function assertCommandOk(result) {
  assert.equal(result.exitCode, 0, result.error || result.output);
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function baseChangeSpec() {
  return [
    '---',
    'approval_status: approved',
    '---',
    '# Change Spec: test-change',
    '',
    '## Confirmed Source-Backed Requirements',
    '',
    '- Checkout must support saved cards.',
    '',
    '## Ambiguities',
    '',
    '- UI color preference unclear [source: proposal.md]',
    '',
    '## Conflicts',
    '',
    'None.',
    '',
    '## Open Questions',
    '',
    'None.',
    '',
    '## Resolved',
    '',
    '- **[CHANGE-SPEC.md#ambiguities]** Use saved-card token endpoint v2. *(source: user)*',
    '',
    '## Acceptance Criteria',
    '',
    '- Given saved card token, checkout succeeds.',
    '',
    '## Scope',
    '',
    '### In Scope',
    '',
    '- Saved card checkout flow.',
    '',
    '### Out of Scope',
    '',
    '- New payment providers.',
    '',
  ].join('\n');
}

function baseImpactMd() {
  return [
    '# Impact Analysis: test-change',
    '',
    '## Summary',
    '',
    '- Checkout module likely affected.',
    '',
    '## Impact: Requirement R1 - "Saved cards"',
    '',
    '| File | Evidence | Source Ref | Discovered By | Confidence |',
    '|------|----------|------------|---------------|------------|',
    '| src/checkout.ts | token endpoint | api.md | codebase map | confirmed |',
    '',
    '## Risks',
    '',
    '- Token endpoint migration may break existing integrations.',
    '',
  ].join('\n');
}

function baseContextMd() {
  return [
    '# NDD Context: test-change',
    '',
    '## Discussion Summary',
    '',
    '- Token endpoint v2 was chosen during discussion.',
    '',
  ].join('\n');
}

function approvedStatus() {
  return JSON.stringify({
    change_id: 'test-change',
    status: 'approved',
    phase: 'approved',
    source_folder: '/tmp/sources',
    source_count: 2,
    artifacts: {
      source_manifest: 'SOURCE-MANIFEST.md',
      change_spec: 'CHANGE-SPEC.md',
      impact: 'IMPACT.md',
    },
    warnings: [],
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
  }, null, 2) + '\n';
}

function draftStatus() {
  return JSON.stringify({
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
    warnings: [],
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
  }, null, 2) + '\n';
}

function discussedStatus() {
  return JSON.stringify({
    change_id: 'test-change',
    status: 'discussed',
    phase: 'discussed',
    source_folder: '/tmp/sources',
    source_count: 2,
    artifacts: {
      source_manifest: 'SOURCE-MANIFEST.md',
      change_spec: 'CHANGE-SPEC.md',
      impact: 'IMPACT.md',
    },
    warnings: [],
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
  }, null, 2) + '\n';
}

/**
 * Build a change workspace with configurable artifacts.
 * Returns { tmpDir, changeWorkspaceDir, changeSpecPath, statusPath }.
 */
function buildChangeWorkspace(tmpDir, overrides = {}) {
  const changeWorkspaceDir = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change');
  fs.mkdirSync(changeWorkspaceDir, { recursive: true });

  const statusPath = path.join(changeWorkspaceDir, 'STATUS.json');
  const changeSpecPath = path.join(changeWorkspaceDir, 'CHANGE-SPEC.md');
  const impactPath = path.join(changeWorkspaceDir, 'IMPACT.md');
  const contextPath = path.join(changeWorkspaceDir, 'CONTEXT.md');

  fs.writeFileSync(statusPath, overrides.status ?? approvedStatus());
  fs.writeFileSync(changeSpecPath, overrides.changeSpec ?? baseChangeSpec());
  fs.writeFileSync(impactPath, overrides.impact ?? baseImpactMd());

  if (overrides.skipContext !== true) {
    fs.writeFileSync(contextPath, overrides.context ?? baseContextMd());
  }

  return { changeWorkspaceDir, statusPath, changeSpecPath, impactPath, contextPath };
}

/**
 * Build a minimal ROADMAP.md and phase directory structure for target phase validation.
 */
function buildPhaseFixture(tmpDir, phaseNum, phaseName) {
  const phaseDir = path.join(tmpDir, '.planning', 'phases', `${phaseNum}-${phaseName}`);
  fs.mkdirSync(phaseDir, { recursive: true });

  // Minimal ROADMAP.md with the phase listed
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
    '**Plans**: 0 plans',
    '',
    'Plans:',
    '',
    `- [ ] ${phaseNum}-01-PLAN.md`,
    '',
  ].join('\n');
  // Only write if doesn't already exist (allow multiple phases)
  if (!fs.existsSync(roadmapPath)) {
    fs.writeFileSync(roadmapPath, roadmapContent);
  }

  return { phaseDir, phaseNum, phaseName };
}

// ---------------------------------------------------------------------------
// PLAN-01: Approval gating
// ---------------------------------------------------------------------------

describe('PLAN-01: preparePlanningBridge approval gating', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-plan-bridge-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('draft status causes preparePlanningBridge to fail', () => {
    buildChangeWorkspace(tmpDir, { status: draftStatus() });
    const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'change_not_approved');
  });

  test('discussed status causes preparePlanningBridge to fail', () => {
    buildChangeWorkspace(tmpDir, { status: discussedStatus() });
    const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'change_not_approved');
  });

  test('draft status causes gsd-tools ndd plan to fail', () => {
    buildChangeWorkspace(tmpDir, { status: draftStatus() });
    const result = runGsdTools('ndd plan test-change', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /approved/i);
  });

  test('discussed status causes gsd-tools ndd plan to fail', () => {
    buildChangeWorkspace(tmpDir, { status: discussedStatus() });
    const result = runGsdTools('ndd plan test-change', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /approved/i);
  });

  test('approved status with critical unresolved ambiguity still fails', () => {
    // Write a CHANGE-SPEC with a critical ambiguity (API contract related)
    const criticalSpec = [
      '---',
      'approval_status: approved',
      '---',
      '# Change Spec: test-change',
      '',
      '## Confirmed Source-Backed Requirements',
      '',
      '- Checkout must support saved cards.',
      '',
      '## Ambiguities',
      '',
      '- API contract for saved-card token creation is unclear [source: api.md]',
      '',
      '## Conflicts',
      '',
      'None.',
      '',
      '## Open Questions',
      '',
      'None.',
      '',
    ].join('\n');

    buildChangeWorkspace(tmpDir, { changeSpec: criticalSpec });
    const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'critical_ambiguity_unresolved');
  });

  test('approved status with critical ambiguity causes CLI ndd plan to fail', () => {
    const criticalSpec = [
      '---',
      'approval_status: approved',
      '---',
      '# Change Spec: test-change',
      '',
      '## Confirmed Source-Backed Requirements',
      '',
      '- Must support payment flow.',
      '',
      '## Ambiguities',
      '',
      '- database schema migration is undefined [source: api.md]',
      '',
      '## Conflicts',
      '',
      'None.',
      '',
      '## Open Questions',
      '',
      'None.',
      '',
    ].join('\n');

    buildChangeWorkspace(tmpDir, { changeSpec: criticalSpec });
    const result = runGsdTools('ndd plan test-change', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /critical/i);
  });
});

// ---------------------------------------------------------------------------
// PLAN-02: Bridge context with artifact refs
// ---------------------------------------------------------------------------

describe('PLAN-02: Bridge context creation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-plan-bridge-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('approved change with CHANGE-SPEC, IMPACT, and CONTEXT returns bridge context with all three artifact refs', () => {
    buildChangeWorkspace(tmpDir);
    const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);

    const b = result.bridge;
    assert.ok(b.artifacts.change_spec.includes('CHANGE-SPEC.md'));
    assert.ok(b.artifacts.impact.includes('IMPACT.md'));
    assert.ok(b.artifacts.context.includes('CONTEXT.md'));
    assert.ok(b.artifacts.status.includes('STATUS.json'));
    assert.ok(b.artifacts.phase_link.includes('phase-link.md'));
  });

  test('bridge context contains change_spec, impact, and context content', () => {
    buildChangeWorkspace(tmpDir);
    const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);

    assert.ok(result.bridge.change_spec.content.includes('Checkout must support saved cards'));
    assert.ok(result.bridge.impact.content.includes('Checkout module likely affected'));
    assert.ok(result.bridge.context.content.includes('Token endpoint v2'));
  });

  test('planner_context includes NDD Planner Bridge Context heading', () => {
    buildChangeWorkspace(tmpDir);
    const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);
    assert.match(result.bridge.planner_context, /NDD Planner Bridge Context/);
  });

  test('planner_context references plan-check and source grounding', () => {
    buildChangeWorkspace(tmpDir);
    const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);
    assert.match(result.bridge.planner_context, /plan-check/);
    assert.match(result.bridge.planner_context, /source grounding/i);
  });

  test('bridge context_backfilled is false when CONTEXT.md exists', () => {
    buildChangeWorkspace(tmpDir);
    const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);
    assert.equal(result.bridge.context_backfilled, false);
  });

  test('missing CONTEXT.md causes helper to backfill from CHANGE-SPEC.md and IMPACT.md', () => {
    buildChangeWorkspace(tmpDir, { skipContext: true });
    const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);
    assert.equal(result.bridge.context_backfilled, true);

    // Backfilled CONTEXT.md should exist on disk
    const contextPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'CONTEXT.md');
    assert.ok(fs.existsSync(contextPath), 'CONTEXT.md should be written to disk');

    // Backfilled content should contain approval metadata and scope from CHANGE-SPEC
    const backfilledContent = fs.readFileSync(contextPath, 'utf-8');
    assert.match(backfilledContent, /Source Artifacts/);
    assert.match(backfilledContent, /CHANGE-SPEC\.md/);
    assert.match(backfilledContent, /IMPACT\.md/);
    assert.match(backfilledContent, /Scope/);
  });

  test('ensureChangeContext returns created true when CONTEXT.md is absent', () => {
    buildChangeWorkspace(tmpDir, { skipContext: true });
    const result = bridge.ensureChangeContext({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);
    assert.equal(result.created, true);
  });

  test('ensureChangeContext returns created false when CONTEXT.md already exists', () => {
    buildChangeWorkspace(tmpDir);
    const result = bridge.ensureChangeContext({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);
    assert.equal(result.created, false);
  });

  test('backfilled CONTEXT.md includes resolved decisions from CHANGE-SPEC', () => {
    buildChangeWorkspace(tmpDir, { skipContext: true });
    const result = bridge.ensureChangeContext({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);
    assert.match(result.context_content, /Resolved Decisions/);
    assert.match(result.context_content, /saved-card token endpoint v2/);
  });

  test('backfilled CONTEXT.md includes acceptance criteria from CHANGE-SPEC', () => {
    buildChangeWorkspace(tmpDir, { skipContext: true });
    const result = bridge.ensureChangeContext({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);
    assert.match(result.context_content, /Acceptance Criteria/);
    assert.match(result.context_content, /saved card token, checkout succeeds/);
  });

  test('backfilled CONTEXT.md includes impact summary from IMPACT.md', () => {
    buildChangeWorkspace(tmpDir, { skipContext: true });
    const result = bridge.ensureChangeContext({ projectRoot: tmpDir, changeId: 'test-change' });
    assert.equal(result.ok, true);
    assert.match(result.context_content, /Impact Summary/);
    assert.match(result.context_content, /Checkout module likely affected/);
  });

  test('CLI ndd plan returns approved true for approved change', () => {
    buildChangeWorkspace(tmpDir);
    const result = runGsdTools('ndd plan test-change', tmpDir);
    assertCommandOk(result);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.approved, true);
    assert.equal(parsed.approvalStatus, 'approved');
  });

  test('CLI ndd plan returns source artifacts in response', () => {
    buildChangeWorkspace(tmpDir);
    const result = runGsdTools('ndd plan test-change', tmpDir);
    assertCommandOk(result);
    const parsed = JSON.parse(result.output);
    assert.ok(parsed.sourceArtifacts);
    assert.ok(parsed.sourceArtifacts.changeSpec.includes('CHANGE-SPEC.md'));
    assert.ok(parsed.sourceArtifacts.impact.includes('IMPACT.md'));
    assert.ok(parsed.sourceArtifacts.context.includes('CONTEXT.md'));
  });
});

// ---------------------------------------------------------------------------
// PLAN-02: Target phase validation and phase-local bridge context
// ---------------------------------------------------------------------------

describe('PLAN-02: Target phase validation and phase-local bridge context', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-plan-bridge-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('ndd plan with nonexistent phase returns error', () => {
    buildChangeWorkspace(tmpDir);
    // Create minimal roadmap so phase locator has something to parse
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, '# Roadmap\n\n## Phases\n\nNone.\n');

    const result = runGsdTools('ndd plan test-change 99', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /phase/i);
  });

  test('ndd plan with valid phase returns resolved mode', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = runGsdTools('ndd plan test-change 06', tmpDir);
    assertCommandOk(result);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.targetPhase.mode, 'resolved');
    assert.equal(parsed.targetPhase.phase_id, '06');
  });

  test('ndd plan without phase returns proposed mode with title and slug', () => {
    buildChangeWorkspace(tmpDir);
    const result = runGsdTools('ndd plan test-change', tmpDir);
    assertCommandOk(result);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.targetPhase.mode, 'proposed');
    assert.ok(parsed.targetPhase.title);
    assert.ok(parsed.targetPhase.slug);
  });

  test('ndd plan-context writes NDD-BRIDGE-CONTEXT.md into target phase directory', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = runGsdTools('ndd plan-context test-change 06', tmpDir);
    assertCommandOk(result);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.bridgeContextPath.includes('NDD-BRIDGE-CONTEXT.md'));

    // Verify the file actually exists on disk
    const bridgeCtxPath = path.join(tmpDir, parsed.bridgeContextPath);
    assert.ok(fs.existsSync(bridgeCtxPath), 'NDD-BRIDGE-CONTEXT.md should exist on disk');

    // Verify content references the NDD artifacts
    const content = fs.readFileSync(bridgeCtxPath, 'utf-8');
    assert.match(content, /CHANGE-SPEC\.md/);
    assert.match(content, /IMPACT\.md/);
    assert.match(content, /CONTEXT\.md/);
  });

  test('ndd plan-context with nonexistent phase returns error', () => {
    buildChangeWorkspace(tmpDir);
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, '# Roadmap\n\n## Phases\n\nNone.\n');

    const result = runGsdTools('ndd plan-context test-change 99', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /phase/i);
  });

  test('ndd plan-context without required args returns usage error', () => {
    const result = runGsdTools('ndd plan-context', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /Usage/);
  });
});

// ---------------------------------------------------------------------------
// PLAN-03: Workflow invariants
// ---------------------------------------------------------------------------

describe('PLAN-03: Workflow invariants in commands/ndd/plan-phase.md', () => {
  const planPhasePath = path.join(__dirname, '..', 'commands', 'ndd', 'plan-phase.md');

  test('plan-phase.md references canonical GSD plan-phase', () => {
    const content = fs.readFileSync(planPhasePath, 'utf-8');
    assert.match(content, /gsd-plan-phase/);
  });

  test('plan-phase.md references plan-check convention', () => {
    const content = fs.readFileSync(planPhasePath, 'utf-8');
    assert.match(content, /plan-check/);
  });

  test('plan-phase.md references source-grounding convention', () => {
    const content = fs.readFileSync(planPhasePath, 'utf-8');
    assert.match(content, /source-grounding/i);
  });

  test('plan-phase.md does not define an independent planner flow', () => {
    const content = fs.readFileSync(planPhasePath, 'utf-8');
    // It should NOT contain its own task/plan creation logic
    assert.match(content, /Do not copy or inline planner internals/i);
  });

  test('plan-phase.md references the canonical workflow path', () => {
    const content = fs.readFileSync(planPhasePath, 'utf-8');
    assert.match(content, /gsd-core\/workflows\/plan-phase\.md/);
  });

  test('plan-phase.md references ndd plan-link for traceability', () => {
    const content = fs.readFileSync(planPhasePath, 'utf-8');
    assert.match(content, /ndd plan-link/);
  });
});

// ---------------------------------------------------------------------------
// PLAN-04: Phase-link metadata
// ---------------------------------------------------------------------------

describe('PLAN-04: Phase-link metadata recording', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-plan-bridge-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('writePhaseLink writes phase-link.md in change workspace', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = bridge.writePhaseLink({
      projectRoot: tmpDir,
      changeId: 'test-change',
      phaseId: '06',
      phaseDir: '.planning/phases/06-test-phase',
      planFiles: ['.planning/phases/06-test-phase/06-01-PLAN.md'],
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(result.phase_link_path));
  });

  test('phase-link.md content includes change id', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = bridge.writePhaseLink({
      projectRoot: tmpDir,
      changeId: 'test-change',
      phaseId: '06',
      phaseDir: '.planning/phases/06-test-phase',
      planFiles: ['.planning/phases/06-test-phase/06-01-PLAN.md'],
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.equal(result.ok, true);
    assert.match(result.content, /Change id: test-change/);
  });

  test('phase-link.md content includes phase id', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = bridge.writePhaseLink({
      projectRoot: tmpDir,
      changeId: 'test-change',
      phaseId: '06',
      phaseDir: '.planning/phases/06-test-phase',
      planFiles: ['.planning/phases/06-test-phase/06-01-PLAN.md'],
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.equal(result.ok, true);
    assert.match(result.content, /GSD phase id: 06/);
  });

  test('phase-link.md content includes plan file names', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = bridge.writePhaseLink({
      projectRoot: tmpDir,
      changeId: 'test-change',
      phaseId: '06',
      phaseDir: '.planning/phases/06-test-phase',
      planFiles: [
        '.planning/phases/06-test-phase/06-01-PLAN.md',
        '.planning/phases/06-test-phase/06-02-PLAN.md',
      ],
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.equal(result.ok, true);
    assert.match(result.content, /06-01-PLAN\.md/);
    assert.match(result.content, /06-02-PLAN\.md/);
  });

  test('phase-link.md content includes timestamp', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = bridge.writePhaseLink({
      projectRoot: tmpDir,
      changeId: 'test-change',
      phaseId: '06',
      phaseDir: '.planning/phases/06-test-phase',
      planFiles: ['.planning/phases/06-test-phase/06-01-PLAN.md'],
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.equal(result.ok, true);
    assert.match(result.content, /Linked at: 2026-07-09T00:00:00\.000Z/);
  });

  test('phase-link.md includes phase directory', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = bridge.writePhaseLink({
      projectRoot: tmpDir,
      changeId: 'test-change',
      phaseId: '06',
      phaseDir: '.planning/phases/06-test-phase',
      planFiles: ['.planning/phases/06-test-phase/06-01-PLAN.md'],
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.equal(result.ok, true);
    assert.match(result.content, /GSD phase directory: .planning\/phases\/06-test-phase/);
  });

  test('phase-link.md references NDD source artifacts', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = bridge.writePhaseLink({
      projectRoot: tmpDir,
      changeId: 'test-change',
      phaseId: '06',
      phaseDir: '.planning/phases/06-test-phase',
      planFiles: ['.planning/phases/06-test-phase/06-01-PLAN.md'],
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.equal(result.ok, true);
    assert.match(result.content, /CHANGE-SPEC\.md/);
    assert.match(result.content, /IMPACT\.md/);
    assert.match(result.content, /CONTEXT\.md/);
    assert.match(result.content, /STATUS\.json/);
  });

  test('phase-link.md relative path stays under NDD change workspace', () => {
    buildChangeWorkspace(tmpDir);
    buildPhaseFixture(tmpDir, '06', 'test-phase');
    const result = bridge.writePhaseLink({
      projectRoot: tmpDir,
      changeId: 'test-change',
      phaseId: '06',
      phaseDir: '.planning/phases/06-test-phase',
      planFiles: ['.planning/phases/06-test-phase/06-01-PLAN.md'],
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.equal(result.ok, true);
    assert.match(result.phase_link_relative_path, /\.planning\/ndd\/changes\/test-change\/phase-link\.md/);
  });

  test('CLI ndd plan-link records phase-link.md successfully', () => {
    buildChangeWorkspace(tmpDir);
    const { phaseDir } = buildPhaseFixture(tmpDir, '06', 'test-phase');

    // Create a plan file in the phase directory for plan-link to find
    const planFilePath = path.join(phaseDir, '06-01-PLAN.md');
    fs.writeFileSync(planFilePath, '---\nphase: 06\nplan: 01\n---\n# Plan\n');

    const result = runGsdTools('ndd plan-link test-change 06 06-01-PLAN.md', tmpDir);
    assertCommandOk(result);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.changeId, 'test-change');
    assert.ok(parsed.phaseLinkPath.includes('phase-link.md'));

    // Verify the file exists on disk
    const linkPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'phase-link.md');
    assert.ok(fs.existsSync(linkPath), 'phase-link.md should exist on disk');
    const linkContent = fs.readFileSync(linkPath, 'utf-8');
    assert.match(linkContent, /Change id: test-change/);
    assert.match(linkContent, /GSD phase id: 06/);
    assert.match(linkContent, /06-01-PLAN\.md/);
  });

  test('CLI ndd plan-link without required args returns usage error', () => {
    const result = runGsdTools('ndd plan-link', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /Usage/);
  });

  test('CLI ndd plan-link with nonexistent phase returns error', () => {
    buildChangeWorkspace(tmpDir);
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, '# Roadmap\n\n## Phases\n\nNone.\n');

    const result = runGsdTools('ndd plan-link test-change 99 99-01-PLAN.md', tmpDir);
    assert.equal(result.success, false);
    assert.match(result.error, /phase/i);
  });
});
