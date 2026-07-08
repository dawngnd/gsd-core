"use strict";
/**
 * NDD command router.
 *
 * Keeps the NDD surface local and thin:
 * - `gsd-tools ndd change <docs-folder> [change-id]` → change-intake helper
 * - `gsd-tools ndd impact <change-id>` → impact-discovery helper
 * - `gsd-tools ndd discuss <change-id>` → discussion seed helper
 * - `gsd-tools ndd discuss-update <change-id> <status>` → approval state helper
 * - `gsd-tools ndd discuss-check <change-id>` → planning gate helper
 * - `gsd-tools ndd plan <change-id> [phase-id]` → planning bridge gate helper
 * - `gsd-tools ndd plan-context <change-id> <phase-id>` → phase-local bridge context writer
 * - `gsd-tools ndd plan-link <change-id> <phase-id> <plan-files...>` → NDD phase-link recorder
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ioMod = require("./io.cjs");
const { output, ERROR_REASON } = ioMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const intake = require("./ndd-change-intake.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const impact = require("./ndd-impact-discovery.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const discuss = require("./ndd-discuss-spec.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bridge = require("./ndd-plan-bridge.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const phaseLocator = require("./phase-locator.cjs");
const BRIDGE_CONTEXT_FILENAME = 'NDD-BRIDGE-CONTEXT.md';
function toPosixPath(value) {
    return value.split(node_path_1.default.sep).join('/');
}
function isPathInside(parent, child) {
    const relative = node_path_1.default.relative(parent, child);
    return relative === '' || (!!relative && !relative.startsWith('..') && !node_path_1.default.isAbsolute(relative));
}
function slugify(value) {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'ndd-change';
}
function deriveChangeTitle(changeSpecContent, changeId) {
    const heading = /^#\s+(.+)$/m.exec(changeSpecContent);
    if (heading?.[1]) {
        return heading[1].trim().replace(/^Change Spec:\s*/i, '').trim() || changeId;
    }
    return changeId;
}
function locateCurrentPhase(projectRoot, phaseId) {
    const located = phaseLocator.findPhaseInternal(projectRoot, phaseId);
    if (!located || located.archived || typeof located.directory !== 'string')
        return null;
    if (!located.directory.startsWith('.planning/phases/'))
        return null;
    const phaseDir = node_path_1.default.resolve(projectRoot, located.directory);
    if (!node_fs_1.default.existsSync(phaseDir) || !node_fs_1.default.statSync(phaseDir).isDirectory())
        return null;
    return {
        phase_id: String(located.phase_number ?? phaseId),
        phase_dir: toPosixPath(located.directory),
        phase_name: typeof located.phase_name === 'string' ? located.phase_name : null,
        phase_slug: typeof located.phase_slug === 'string' ? located.phase_slug : null,
    };
}
function bridgeContextPath(projectRoot, phase) {
    const absolute = node_path_1.default.join(projectRoot, phase.phase_dir, BRIDGE_CONTEXT_FILENAME);
    return {
        absolute,
        relative: toPosixPath(node_path_1.default.relative(projectRoot, absolute)),
    };
}
function targetPhaseForPlan(projectRoot, phaseId, prepared) {
    if (phaseId) {
        const phase = locateCurrentPhase(projectRoot, phaseId);
        if (!phase) {
            return { ok: false, message: `Target GSD phase '${phaseId}' was not found under .planning/phases/.` };
        }
        const context = bridgeContextPath(projectRoot, phase);
        return {
            ok: true,
            value: {
                mode: 'resolved',
                phase_id: phase.phase_id,
                phase_dir: phase.phase_dir,
                phase_name: phase.phase_name,
                phase_slug: phase.phase_slug,
                bridge_context_file: context.relative,
            },
        };
    }
    const title = deriveChangeTitle(prepared.change_spec.content, prepared.change_id);
    const slug = slugify(title);
    return {
        ok: true,
        value: {
            mode: 'proposed',
            phase_id: null,
            title,
            slug,
            goal: `Plan approved NDD change ${prepared.change_id}: ${title}`,
            create_next_step: `Create a normal GSD phase for '${title}' using existing roadmap/phase mechanics, then run gsd-tools ndd plan-context ${prepared.change_id} <target-phase>.`,
        },
    };
}
function renderPlanResponse(projectRoot, changeId, phaseId) {
    if (phaseId && !locateCurrentPhase(projectRoot, phaseId)) {
        return { ok: false, message: `Target GSD phase '${phaseId}' was not found under .planning/phases/.` };
    }
    const prepared = bridge.preparePlanningBridge({ projectRoot, changeId, ...(phaseId ? { phaseId } : {}) });
    if (!prepared.ok)
        return { ok: false, message: prepared.error.message };
    const targetPhase = targetPhaseForPlan(projectRoot, phaseId, prepared.bridge);
    if (!targetPhase.ok)
        return targetPhase;
    return {
        ok: true,
        value: {
            ok: true,
            changeId: prepared.bridge.change_id,
            approved: true,
            approvalStatus: prepared.bridge.approval_status,
            criticalUnresolvedCount: prepared.bridge.critical_unresolved_count,
            sourceArtifacts: {
                status: prepared.bridge.artifacts.status,
                changeSpec: prepared.bridge.artifacts.change_spec,
                impact: prepared.bridge.artifacts.impact,
                context: prepared.bridge.artifacts.context,
                phaseLink: prepared.bridge.artifacts.phase_link,
            },
            contextPath: prepared.bridge.context.relative_path,
            contextBackfilled: prepared.bridge.context_backfilled,
            targetPhase: targetPhase.value,
            workflowNextStep: phaseId
                ? `Run gsd-tools ndd plan-context ${prepared.bridge.change_id} ${phaseId}, then invoke canonical gsd-plan-phase ${phaseId}.`
                : 'Create the proposed GSD phase through existing roadmap/phase mechanics, then rerun ndd plan with the new phase id.',
        },
    };
}
function writePhaseBridgeContext(projectRoot, changeId, phaseId) {
    const phase = locateCurrentPhase(projectRoot, phaseId);
    if (!phase)
        return { ok: false, message: `Target GSD phase '${phaseId}' was not found under .planning/phases/.` };
    const prepared = bridge.preparePlanningBridge({ projectRoot, changeId, phaseId: phase.phase_id });
    if (!prepared.ok)
        return { ok: false, message: prepared.error.message };
    const context = bridgeContextPath(projectRoot, phase);
    const phaseDirAbs = node_path_1.default.resolve(projectRoot, phase.phase_dir);
    if (!isPathInside(phaseDirAbs, context.absolute)) {
        return { ok: false, message: 'Resolved NDD bridge context path escapes the target phase directory.' };
    }
    (0, shell_command_projection_cjs_1.platformWriteSync)(context.absolute, prepared.bridge.planner_context);
    return {
        ok: true,
        value: {
            ok: true,
            changeId: prepared.bridge.change_id,
            targetPhase: phase,
            bridgeContextPath: context.relative,
            sourceArtifacts: {
                status: prepared.bridge.artifacts.status,
                changeSpec: prepared.bridge.artifacts.change_spec,
                impact: prepared.bridge.artifacts.impact,
                context: prepared.bridge.artifacts.context,
            },
            plannerInputs: [
                context.relative,
                prepared.bridge.artifacts.change_spec,
                prepared.bridge.artifacts.impact,
                prepared.bridge.artifacts.context,
            ],
        },
    };
}
function normalizePlanFiles(projectRoot, phase, planFiles) {
    const phaseDirAbs = node_path_1.default.resolve(projectRoot, phase.phase_dir);
    const normalized = [];
    for (const planFile of planFiles) {
        if (node_path_1.default.isAbsolute(planFile) || planFile.split(/[\\/]+/).includes('..')) {
            return { error: `Plan file '${planFile}' must be a relative path inside ${phase.phase_dir}.` };
        }
        const candidateAbs = planFile.includes('/') || planFile.includes('\\')
            ? node_path_1.default.resolve(projectRoot, planFile)
            : node_path_1.default.join(phaseDirAbs, planFile);
        if (!isPathInside(phaseDirAbs, candidateAbs)) {
            return { error: `Plan file '${planFile}' is outside target phase directory ${phase.phase_dir}.` };
        }
        if (!node_fs_1.default.existsSync(candidateAbs) || !node_fs_1.default.statSync(candidateAbs).isFile()) {
            return { error: `Plan file '${planFile}' was not found.` };
        }
        if (!candidateAbs.endsWith('-PLAN.md')) {
            return { error: `Plan file '${planFile}' must end with -PLAN.md.` };
        }
        normalized.push(toPosixPath(node_path_1.default.relative(projectRoot, candidateAbs)));
    }
    return normalized;
}
function routeNddCommand({ args, cwd, raw, error }) {
    const subcommand = args[1];
    if (subcommand === 'change') {
        const docsFolder = args[2];
        const changeId = args[3];
        if (!docsFolder || docsFolder.startsWith('-')) {
            error('Usage: gsd-tools ndd change <docs-folder> [change-id]', ERROR_REASON.USAGE);
            return;
        }
        if (args.length > 4) {
            error('Usage: gsd-tools ndd change <docs-folder> [change-id]', ERROR_REASON.USAGE);
            return;
        }
        const result = intake.ingestMarkdownSources({
            projectRoot: cwd,
            sourceFolder: node_path_1.default.resolve(cwd, docsFolder),
            changeId,
        });
        output({
            ok: true,
            change_id: result.change_id,
            workspace_dir: result.relative_workspace_dir,
            status_path: node_path_1.default.relative(cwd, result.status_path).split(node_path_1.default.sep).join('/'),
            source_manifest: node_path_1.default.relative(cwd, result.manifest_path).split(node_path_1.default.sep).join('/'),
            change_spec: node_path_1.default.relative(cwd, result.change_spec_path).split(node_path_1.default.sep).join('/'),
            source_count: result.sources.length,
            warnings: result.warnings,
        }, raw);
    }
    else if (subcommand === 'impact') {
        const changeId = args[2];
        if (!changeId || changeId.startsWith('-')) {
            error('Usage: gsd-tools ndd impact <change-id>', ERROR_REASON.USAGE);
            return;
        }
        if (args.length > 3) {
            error('Usage: gsd-tools ndd impact <change-id>', ERROR_REASON.USAGE);
            return;
        }
        const result = impact.runImpactDiscovery({ projectRoot: cwd, changeId });
        if (result.ok) {
            output(result, raw);
        }
        else {
            error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
        }
    }
    else if (subcommand === 'discuss') {
        const changeId = args[2];
        if (!changeId || changeId.startsWith('-')) {
            error('Usage: gsd-tools ndd discuss <change-id>', ERROR_REASON.USAGE);
            return;
        }
        if (args.length > 3) {
            error('Usage: gsd-tools ndd discuss <change-id>', ERROR_REASON.USAGE);
            return;
        }
        const result = discuss.prepareDiscussionContext({ projectRoot: cwd, changeId });
        if (result.ok) {
            output(result, raw);
        }
        else {
            error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
        }
    }
    else if (subcommand === 'discuss-update') {
        const changeId = args[2];
        const status = args[3];
        if (!changeId || changeId.startsWith('-') || !status || status.startsWith('-')) {
            error('Usage: gsd-tools ndd discuss-update <change-id> <draft|discussed|approved>', ERROR_REASON.USAGE);
            return;
        }
        if (args.length > 4) {
            error('Usage: gsd-tools ndd discuss-update <change-id> <draft|discussed|approved>', ERROR_REASON.USAGE);
            return;
        }
        if (status !== 'draft' && status !== 'discussed' && status !== 'approved') {
            error('Approval status must be one of: draft, discussed, approved.', ERROR_REASON.SDK_MISSING_ARG);
            return;
        }
        const result = discuss.updateApprovalStatus(cwd, changeId, status);
        if (result.ok) {
            output(result, raw);
        }
        else {
            error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
        }
    }
    else if (subcommand === 'discuss-check') {
        const changeId = args[2];
        if (!changeId || changeId.startsWith('-')) {
            error('Usage: gsd-tools ndd discuss-check <change-id>', ERROR_REASON.USAGE);
            return;
        }
        if (args.length > 3) {
            error('Usage: gsd-tools ndd discuss-check <change-id>', ERROR_REASON.USAGE);
            return;
        }
        const result = discuss.checkDiscussionApproval({ projectRoot: cwd, changeId });
        if (result.ok) {
            output(result, raw);
        }
        else {
            error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
        }
    }
    else if (subcommand === 'plan') {
        const changeId = args[2];
        const phaseId = args[3];
        if (!changeId || changeId.startsWith('-')) {
            error('Usage: gsd-tools ndd plan <change-id> [phase-id]', ERROR_REASON.USAGE);
            return;
        }
        if (phaseId?.startsWith('-') || args.length > 4) {
            error('Usage: gsd-tools ndd plan <change-id> [phase-id]', ERROR_REASON.USAGE);
            return;
        }
        const result = renderPlanResponse(cwd, changeId, phaseId);
        if (result.ok) {
            output(result.value, raw);
        }
        else {
            error(result.message, ERROR_REASON.SDK_MISSING_ARG);
        }
    }
    else if (subcommand === 'plan-context') {
        const changeId = args[2];
        const phaseId = args[3];
        if (!changeId || changeId.startsWith('-') || !phaseId || phaseId.startsWith('-')) {
            error('Usage: gsd-tools ndd plan-context <change-id> <phase-id>', ERROR_REASON.USAGE);
            return;
        }
        if (args.length > 4) {
            error('Usage: gsd-tools ndd plan-context <change-id> <phase-id>', ERROR_REASON.USAGE);
            return;
        }
        const result = writePhaseBridgeContext(cwd, changeId, phaseId);
        if (result.ok) {
            output(result.value, raw);
        }
        else {
            error(result.message, ERROR_REASON.SDK_MISSING_ARG);
        }
    }
    else if (subcommand === 'plan-link') {
        const changeId = args[2];
        const phaseId = args[3];
        const planFiles = args.slice(4);
        if (!changeId || changeId.startsWith('-') || !phaseId || phaseId.startsWith('-') || planFiles.length === 0) {
            error('Usage: gsd-tools ndd plan-link <change-id> <phase-id> <plan-files...>', ERROR_REASON.USAGE);
            return;
        }
        if (planFiles.some(planFile => planFile.startsWith('-'))) {
            error('Usage: gsd-tools ndd plan-link <change-id> <phase-id> <plan-files...>', ERROR_REASON.USAGE);
            return;
        }
        const phase = locateCurrentPhase(cwd, phaseId);
        if (!phase) {
            error(`Target GSD phase '${phaseId}' was not found under .planning/phases/.`, ERROR_REASON.SDK_MISSING_ARG);
            return;
        }
        const normalizedPlans = normalizePlanFiles(cwd, phase, planFiles);
        if ('error' in normalizedPlans) {
            error(normalizedPlans.error, ERROR_REASON.SDK_MISSING_ARG);
            return;
        }
        const result = bridge.writePhaseLink({
            projectRoot: cwd,
            changeId,
            phaseId: phase.phase_id,
            phaseDir: phase.phase_dir,
            planFiles: normalizedPlans,
        });
        if (result.ok) {
            output({
                ok: true,
                changeId: result.change_id,
                targetPhase: phase,
                phaseLinkPath: result.phase_link_relative_path,
                planFiles: normalizedPlans,
            }, raw);
        }
        else {
            error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
        }
    }
    else {
        error('Unknown ndd subcommand. Available: change, impact, discuss, discuss-update, discuss-check, plan, plan-context, plan-link', ERROR_REASON.SDK_UNKNOWN_COMMAND);
    }
}
module.exports = {
    routeNddCommand,
};
