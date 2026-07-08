const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');

const impact = require('../gsd-core/bin/lib/ndd-impact-discovery.cjs');

describe('NDD impact discovery', () => {
  let tmpDir;
  let changeWorkspaceDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-impact-');

    // Pre-populated change workspace
    changeWorkspaceDir = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change');
    fs.mkdirSync(changeWorkspaceDir, { recursive: true });

    // STATUS.json — phase: intake (the state before impact discovery)
    fs.writeFileSync(
      path.join(changeWorkspaceDir, 'STATUS.json'),
      JSON.stringify({
        change_id: 'test-change',
        status: 'draft',
        phase: 'intake',
        source_folder: '/tmp/sources',
        source_count: 2,
        artifacts: {
          source_manifest: 'SOURCE-MANIFEST.md',
          change_spec: 'CHANGE-SPEC.md',
        },
        warnings: [],
        created_at: '2026-07-08T00:00:00.000Z',
        updated_at: '2026-07-08T00:00:00.000Z',
      }, null, 2) + '\n',
    );

    // CHANGE-SPEC.md with Confirmed Source-Backed Requirements
    fs.writeFileSync(
      path.join(changeWorkspaceDir, 'CHANGE-SPEC.md'),
      [
        '# Change Spec: test-change',
        '',
        '## Confirmed Source-Backed Requirements',
        '',
        '- The checkout flow must support saved cards.',
        '- Payment API must validate card tokens.',
        '',
        '## Open Questions',
        '',
        '- TBD',
        '',
      ].join('\n'),
    );

    // .planning/codebase/ with a sample ARCHITECTURE.md
    const codebaseDir = path.join(tmpDir, '.planning', 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(codebaseDir, 'ARCHITECTURE.md'),
      '# Architecture\n\nSample map content.\n',
    );
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── Task 2: Capability Config Loading ────────────────────────────────────

  describe('loadCodebaseCapabilityConfig', () => {
    test('returns default config when file not found', () => {
      const result = impact.loadCodebaseCapabilityConfig('/nonexistent-path');

      assert.ok(result.tools);
      assert.equal(result.tools.grep_search.available, true);
      assert.equal(result.tools.codegraph.available, false);
      assert.equal(result.tools.wiki.available, false);
    });

    test('parses valid JSON correctly', () => {
      const configDir = path.join(tmpDir, 'gsd-core', 'ndd');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'codebase_capability.json'),
        JSON.stringify({
          tools: {
            codegraph: {
              available: true,
              config: {},
              capabilities: {
                callers: true, callees: true,
                impact_analysis: true, symbol_lookup: true,
                semantic: false, knowledge: false,
              },
            },
            grep_search: {
              available: true,
              config: {},
              capabilities: {
                callers: false, callees: false,
                impact_analysis: false, symbol_lookup: false,
                semantic: true, knowledge: false,
              },
            },
          },
        }),
      );

      const result = impact.loadCodebaseCapabilityConfig(tmpDir);
      assert.equal(result.tools.codegraph.available, true);
    });

    test('returns default for invalid JSON', () => {
      const configDir = path.join(tmpDir, 'gsd-core', 'ndd');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'codebase_capability.json'),
        '{not valid json}',
      );

      const result = impact.loadCodebaseCapabilityConfig(tmpDir);
      assert.ok(result.tools);
      assert.equal(result.tools.grep_search.available, true);
    });

    test('returns default for missing tools key', () => {
      const configDir = path.join(tmpDir, 'gsd-core', 'ndd');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'codebase_capability.json'),
        '{}',
      );

      const result = impact.loadCodebaseCapabilityConfig(tmpDir);
      assert.ok(result.tools);
      assert.equal(result.tools.grep_search.available, true);
      assert.equal(result.tools.codegraph.available, false);
    });
  });

  // ─── Task 3: Codebase Map Availability ────────────────────────────────────

  describe('checkCodebaseMapAvailability', () => {
    test('returns available true with file list when codebase maps exist', () => {
      const result = impact.checkCodebaseMapAvailability(tmpDir);

      assert.equal(result.available, true);
      assert.ok(Array.isArray(result.files));
      assert.ok(result.files.includes('ARCHITECTURE.md'));
      assert.ok(result.files.length >= 1);
    });

    test('returns available false when directory is missing', () => {
      const freshDir = createTempDir('gsd-ndd-impact-fresh-');
      try {
        const result = impact.checkCodebaseMapAvailability(freshDir);

        assert.equal(result.available, false);
        assert.deepEqual(result.files, []);
      } finally {
        cleanup(freshDir);
      }
    });

    test('returns available false when directory has no md files', () => {
      const emptyDir = createTempDir('gsd-ndd-impact-empty-');
      try {
        const codebaseDir = path.join(emptyDir, '.planning', 'codebase');
        fs.mkdirSync(codebaseDir, { recursive: true });
        fs.writeFileSync(path.join(codebaseDir, 'notes.txt'), 'not markdown');
        fs.writeFileSync(path.join(codebaseDir, 'data.json'), '{}');

        const result = impact.checkCodebaseMapAvailability(emptyDir);

        assert.equal(result.available, false);
        assert.deepEqual(result.files, []);
      } finally {
        cleanup(emptyDir);
      }
    });
  });

  // ─── Task 4: IMPACT.md Rendering ──────────────────────────────────────────

  describe('renderImpactMarkdown', () => {
    const singleGroupData = {
      change_id: 'test-change',
      tools_used: ['grep_search'],
      groups: [{
        requirement_id: 'R1',
        requirement_title: 'Save cards',
        entries: [{
          file: 'src/checkout.ts',
          evidence: 'Direct handler',
          source_ref: 'CHANGE-SPEC.md#R1',
          discovered_by: 'grep_search',
          confidence: 'confirmed',
        }],
      }],
      cross_cutting: [],
    };

    test('produces valid Markdown with YAML frontmatter', () => {
      const output = impact.renderImpactMarkdown(singleGroupData);

      assert.ok(output.startsWith('---\n'));
      assert.ok(output.includes('change_id: test-change'));
      assert.ok(output.includes('phase: impact-discovery'));
      assert.ok(output.includes('status: draft'));
    });

    test('summary table has correct confidence counts', () => {
      const data = {
        change_id: 'test-change',
        tools_used: ['grep_search'],
        groups: [{
          requirement_id: 'R1',
          requirement_title: 'Feature A',
          entries: [
            { file: 'a.ts', evidence: 'ev1', source_ref: 'ref1', discovered_by: 'grep_search', confidence: 'confirmed' },
            { file: 'b.ts', evidence: 'ev2', source_ref: 'ref2', discovered_by: 'grep_search', confidence: 'confirmed' },
          ],
        }, {
          requirement_id: 'R2',
          requirement_title: 'Feature B',
          entries: [
            { file: 'c.ts', evidence: 'ev3', source_ref: 'ref3', discovered_by: 'codebase_map', confidence: 'likely' },
          ],
        }],
        cross_cutting: [],
      };

      const output = impact.renderImpactMarkdown(data);

      assert.ok(output.includes('| Confirmed | 2 |'));
      assert.ok(output.includes('| Likely | 1 |'));
      assert.ok(output.includes('| Unknown | 0 |'));
    });

    test('per-requirement sections with correct table columns', () => {
      const output = impact.renderImpactMarkdown(singleGroupData);

      assert.ok(output.includes('## Impact: Requirement R1 — "Save cards"'));
      assert.ok(output.includes('| File | Evidence | Source Ref | Discovered By |'));
      assert.ok(output.includes('src/checkout.ts'));
    });

    test('empty groups produce None identified row', () => {
      const data = {
        change_id: 'test-change',
        tools_used: [],
        groups: [{
          requirement_id: 'R1',
          requirement_title: 'Empty requirement',
          entries: [],
        }],
        cross_cutting: [],
      };

      const output = impact.renderImpactMarkdown(data);
      assert.ok(output.includes('| None identified | — | — | — |'));
    });

    test('cross-cutting section is included', () => {
      const data = {
        change_id: 'test-change',
        tools_used: ['grep_search'],
        groups: [],
        cross_cutting: [{
          file: 'src/logger.ts',
          evidence: 'Logging impacts all modules',
          source_ref: 'CHANGE-SPEC.md',
          discovered_by: 'llm_reasoning',
          confidence: 'likely',
        }],
      };

      const output = impact.renderImpactMarkdown(data);
      assert.ok(output.includes('## Cross-cutting Impact'));
      assert.ok(output.includes('src/logger.ts'));
    });

    test('markdownTableCell escapes pipe characters', () => {
      const data = {
        change_id: 'test-change',
        tools_used: [],
        groups: [{
          requirement_id: 'R1',
          requirement_title: 'Pipes',
          entries: [{
            file: 'src/parser.ts',
            evidence: 'Uses x | y pattern',
            source_ref: 'ref',
            discovered_by: 'grep_search',
            confidence: 'confirmed',
          }],
        }],
        cross_cutting: [],
      };

      const output = impact.renderImpactMarkdown(data);
      // The pipe in "x | y" should be escaped to "x \\| y"
      assert.ok(output.includes('x \\| y'));
    });
  });

  // ─── Task 5: CHANGE-SPEC Requirement Extraction ───────────────────────────

  describe('extractRequirementSections', () => {
    test('extracts requirements from Confirmed section', () => {
      const input = '# Change Spec\n\n## Confirmed Source-Backed Requirements\n\n- First requirement\n- Second requirement\n\n## Open Questions\n';
      const result = impact.extractRequirementSections(input);

      assert.deepEqual(result, [
        { id: 'R1', title: 'First requirement' },
        { id: 'R2', title: 'Second requirement' },
      ]);
    });

    test('returns empty array when no matching section', () => {
      const input = '# Change Spec\n\n## Something Else\n\n- A bullet\n';
      const result = impact.extractRequirementSections(input);

      assert.deepEqual(result, []);
    });

    test('returns empty array when section has no bullets', () => {
      const input = '# Change Spec\n\n## Confirmed Source-Backed Requirements\n\nNo bullets here.\n';
      const result = impact.extractRequirementSections(input);

      assert.deepEqual(result, []);
    });

    test('handles asterisk bullets', () => {
      const input = '## Confirmed Source-Backed Requirements\n\n* Star bullet\n';
      const result = impact.extractRequirementSections(input);

      assert.deepEqual(result, [{ id: 'R1', title: 'Star bullet' }]);
    });
  });

  // ─── Task 6: runImpactDiscovery Orchestrator ──────────────────────────────

  describe('runImpactDiscovery', () => {
    test('returns error for invalid change-id', () => {
      const result = impact.runImpactDiscovery({ projectRoot: tmpDir, changeId: '../escape' });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'invalid_change_id');
    });

    test('returns error for non-existent workspace', () => {
      const result = impact.runImpactDiscovery({ projectRoot: tmpDir, changeId: 'nonexistent-change' });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'workspace_not_found');
    });

    test('succeeds with valid workspace and creates IMPACT.md', () => {
      const result = impact.runImpactDiscovery({ projectRoot: tmpDir, changeId: 'test-change' });

      assert.equal(result.ok, true);
      assert.equal(result.change_id, 'test-change');
      assert.equal(
        fs.existsSync(path.join(changeWorkspaceDir, 'IMPACT.md')),
        true,
      );
    });

    test('updates STATUS.json phase to impact', () => {
      impact.runImpactDiscovery({ projectRoot: tmpDir, changeId: 'test-change' });

      const parsed = JSON.parse(
        fs.readFileSync(path.join(changeWorkspaceDir, 'STATUS.json'), 'utf-8'),
      );
      assert.equal(parsed.phase, 'impact');
      assert.equal(parsed.artifacts.impact, 'IMPACT.md');
      // Existing fields preserved
      assert.equal(parsed.change_id, 'test-change');
      assert.equal(parsed.source_folder, '/tmp/sources');
    });

    test('reports codebase map availability', () => {
      const result = impact.runImpactDiscovery({ projectRoot: tmpDir, changeId: 'test-change' });

      assert.equal(result.ok, true);
      assert.equal(result.codebase_map_available, true);
    });

    test('reports codebase map unavailable when missing', () => {
      // Remove .planning/codebase/
      fs.rmSync(path.join(tmpDir, '.planning', 'codebase'), { recursive: true, force: true });

      // Re-write STATUS.json since previous test may have changed phase
      fs.writeFileSync(
        path.join(changeWorkspaceDir, 'STATUS.json'),
        JSON.stringify({
          change_id: 'test-change',
          status: 'draft',
          phase: 'intake',
          source_folder: '/tmp/sources',
          source_count: 2,
          artifacts: {
            source_manifest: 'SOURCE-MANIFEST.md',
            change_spec: 'CHANGE-SPEC.md',
          },
          warnings: [],
          created_at: '2026-07-08T00:00:00.000Z',
          updated_at: '2026-07-08T00:00:00.000Z',
        }, null, 2) + '\n',
      );

      const result = impact.runImpactDiscovery({ projectRoot: tmpDir, changeId: 'test-change' });

      assert.equal(result.ok, true);
      assert.equal(result.codebase_map_available, false);
    });
  });

  // ─── Task 7: CLI Integration Tests ────────────────────────────────────────

  describe('CLI integration: ndd impact', () => {
    test('returns error for missing change-id argument', () => {
      const result = runGsdTools('ndd impact', tmpDir);

      assert.equal(result.success, false);
      assert.match(result.error, /Usage/);
    });

    test('returns error for non-existent change workspace', () => {
      const result = runGsdTools('ndd impact nonexistent', tmpDir);

      assert.equal(result.success, false);
    });

    test('returns structured result for valid workspace', () => {
      const result = runGsdTools('ndd impact test-change', tmpDir);

      assert.equal(result.success, true);
      const parsed = JSON.parse(result.output);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.change_id, 'test-change');
    });
  });
});
