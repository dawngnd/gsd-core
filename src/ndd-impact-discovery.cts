/**
 * NDD impact discovery helpers.
 *
 * Owns impact analysis types, capability config loading, codebase map
 * availability checking, CHANGE-SPEC requirement extraction, and
 * IMPACT.md rendering.
 */

import fs from 'node:fs';
import path from 'node:path';
import { tokenizeHeadings } from './markdown-sectionizer.cjs';
import { platformWriteSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import intake = require('./ndd-change-intake.cjs');

const { resolveChangeWorkspace, validateChangeId } = intake as {
  resolveChangeWorkspace: typeof intake.resolveChangeWorkspace;
  validateChangeId: typeof intake.validateChangeId;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImpactConfidence = 'confirmed' | 'likely' | 'unknown';

export type DiscoveredBy =
  | 'codegraph.callers'
  | 'codegraph.callees'
  | 'codegraph.impact_analysis'
  | 'codegraph.symbol_lookup'
  | 'wiki.knowledge'
  | 'grep_search'
  | 'codebase_map'
  | 'llm_reasoning';

export interface ImpactEntry {
  file: string;
  evidence: string;
  source_ref: string;
  discovered_by: DiscoveredBy;
  confidence: ImpactConfidence;
}

export interface RequirementImpactGroup {
  requirement_id: string;
  requirement_title: string;
  entries: ImpactEntry[];
}

export interface ImpactAnalysisData {
  change_id: string;
  tools_used: string[];
  groups: RequirementImpactGroup[];
  cross_cutting: ImpactEntry[];
}

export interface ToolCapabilities {
  callers: boolean;
  callees: boolean;
  impact_analysis: boolean;
  symbol_lookup: boolean;
  semantic: boolean;
  knowledge: boolean;
}

export interface ToolConfig {
  available: boolean;
  config: Record<string, unknown>;
  capabilities: ToolCapabilities;
}

export interface CodebaseCapabilityConfig {
  tools: Record<string, ToolConfig>;
}

export interface CodebaseMapAvailability {
  available: boolean;
  files: string[];
  directory: string;
}

export type ImpactDiscoveryResult =
  | {
      ok: true;
      impact_path: string;
      relative_impact_path: string;
      change_id: string;
      summary: { confirmed: number; likely: number; unknown: number };
    }
  | {
      ok: false;
      error: { code: string; message: string };
    };

// ─── Default Capability Config ────────────────────────────────────────────────

const DEFAULT_CAPABILITY_CONFIG: CodebaseCapabilityConfig = Object.freeze({
  tools: Object.freeze({
    codegraph: Object.freeze({
      available: false,
      config: Object.freeze({}),
      capabilities: Object.freeze({
        callers: true,
        callees: true,
        impact_analysis: true,
        symbol_lookup: true,
        semantic: false,
        knowledge: false,
      }),
    }),
    grep_search: Object.freeze({
      available: true,
      config: Object.freeze({}),
      capabilities: Object.freeze({
        callers: false,
        callees: false,
        impact_analysis: false,
        symbol_lookup: false,
        semantic: true,
        knowledge: false,
      }),
    }),
    wiki: Object.freeze({
      available: false,
      config: Object.freeze({ wiki_path: '', query_tool: '' }),
      capabilities: Object.freeze({
        callers: false,
        callees: false,
        impact_analysis: false,
        symbol_lookup: false,
        semantic: true,
        knowledge: true,
      }),
    }),
  }),
}) as CodebaseCapabilityConfig;

// ─── Config Loader ────────────────────────────────────────────────────────────

export function loadCodebaseCapabilityConfig(packageRoot: string): CodebaseCapabilityConfig {
  const configPath = path.join(packageRoot, 'gsd-core', 'ndd', 'codebase_capability.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'tools' in parsed &&
      parsed.tools !== null &&
      typeof parsed.tools === 'object'
    ) {
      return parsed as CodebaseCapabilityConfig;
    }
    return DEFAULT_CAPABILITY_CONFIG;
  } catch {
    return DEFAULT_CAPABILITY_CONFIG;
  }
}

// ─── Codebase Map Availability ────────────────────────────────────────────────

export function checkCodebaseMapAvailability(projectRoot: string): CodebaseMapAvailability {
  const directory = path.join(projectRoot, '.planning', 'codebase');
  try {
    const stat = fs.statSync(directory);
    if (!stat.isDirectory()) {
      return { available: false, files: [], directory };
    }
    const entries = fs.readdirSync(directory);
    const mdFiles = entries.filter(entry => entry.endsWith('.md'));
    return { available: mdFiles.length > 0, files: mdFiles, directory };
  } catch {
    return { available: false, files: [], directory };
  }
}

// ─── CHANGE-SPEC Requirement Extractor ────────────────────────────────────────

export function extractRequirementSections(changeSpecContent: string): Array<{ id: string; title: string }> {
  const headings = tokenizeHeadings(changeSpecContent);

  // Find the heading matching "Confirmed Source-Backed Requirements" (case-insensitive substring)
  const targetHeading = headings.find(h =>
    h.text.toLowerCase().includes('confirmed source-backed requirements'),
  );
  if (!targetHeading) return [];

  // Get the body between this heading and the next heading at the same or higher level
  const lines = changeSpecContent.split('\n');
  const startLine = targetHeading.line; // 1-based, heading itself
  const nextHeadingIdx = headings.findIndex(h => h.line > targetHeading.line && h.level <= targetHeading.level);
  const endLine = nextHeadingIdx !== -1 ? headings[nextHeadingIdx].line - 1 : lines.length;

  const bodyLines = lines.slice(startLine, endLine); // startLine is 1-based, so slice(startLine) = lines after heading
  const bulletPattern = /^[-*]\s+(.+)$/;
  const results: Array<{ id: string; title: string }> = [];

  for (const line of bodyLines) {
    const match = bulletPattern.exec(line.trim());
    if (match) {
      results.push({ id: `R${results.length + 1}`, title: match[1].trim() });
    }
  }

  return results;
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function markdownTableCell(value: string): string {
  return value
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim();
}

// ─── IMPACT.md Renderer ──────────────────────────────────────────────────────

export function renderImpactMarkdown(data: ImpactAnalysisData): string {
  const lines: string[] = [];

  // Compute summary counts
  const allEntries: ImpactEntry[] = [
    ...data.groups.flatMap(g => g.entries),
    ...data.cross_cutting,
  ];
  const confirmed = allEntries.filter(e => e.confidence === 'confirmed').length;
  const likely = allEntries.filter(e => e.confidence === 'likely').length;
  const unknown = allEntries.filter(e => e.confidence === 'unknown').length;

  // YAML frontmatter
  lines.push('---');
  lines.push(`change_id: ${data.change_id}`);
  lines.push('phase: impact-discovery');
  lines.push('status: draft');
  lines.push(`created: ${new Date().toISOString()}`);
  lines.push(`tools_used: [${data.tools_used.join(', ')}]`);
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# Impact Analysis: ${data.change_id}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Confidence | Count |');
  lines.push('|-----------|-------|');
  lines.push(`| Confirmed | ${confirmed} |`);
  lines.push(`| Likely | ${likely} |`);
  lines.push(`| Unknown | ${unknown} |`);
  lines.push('');

  // Per-requirement sections
  for (const group of data.groups) {
    lines.push(`## Impact: Requirement ${group.requirement_id} — "${group.requirement_title}"`);
    lines.push('');
    lines.push('| File | Evidence | Source Ref | Discovered By |');
    lines.push('|------|----------|------------|---------------|');
    if (group.entries.length === 0) {
      lines.push('| None identified | — | — | — |');
    } else {
      for (const entry of group.entries) {
        lines.push(`| ${[
          markdownTableCell(entry.file),
          markdownTableCell(entry.evidence),
          markdownTableCell(entry.source_ref),
          markdownTableCell(entry.discovered_by),
        ].join(' | ')} |`);
      }
    }
    lines.push('');
  }

  // Cross-cutting section
  lines.push('## Cross-cutting Impact');
  lines.push('');
  lines.push('| File | Evidence | Source Ref | Discovered By |');
  lines.push('|------|----------|------------|---------------|');
  if (data.cross_cutting.length === 0) {
    lines.push('| None identified | — | — | — |');
  } else {
    for (const entry of data.cross_cutting) {
      lines.push(`| ${[
        markdownTableCell(entry.file),
        markdownTableCell(entry.evidence),
        markdownTableCell(entry.source_ref),
        markdownTableCell(entry.discovered_by),
      ].join(' | ')} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}
