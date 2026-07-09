"use strict";
/**
 * NDD ship helpers.
 *
 * Gating checks, pre-ship context artifact rendering, and shipped/blocked status updates.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareNddShip = prepareNddShip;
exports.renderNddShipContext = renderNddShipContext;
exports.writeNddShipContext = writeNddShipContext;
exports.markNddShipped = markNddShipped;
exports.markNddShipBlocked = markNddShipBlocked;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const intake = require("./ndd-change-intake.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const verification = require("./ndd-verification.cjs");
const { resolveNddLinkedPhase, readGsdVerificationStatus } = verification;
function toPosixPath(value) {
    return value.split(node_path_1.default.sep).join('/');
}
function prepareNddShip(opts) {
    const resolved = resolveNddLinkedPhase(opts.projectRoot, opts.inputId);
    if (!resolved.ok) {
        return { ok: false, code: 'resolution_failed', message: resolved.message };
    }
    const changeId = resolved.change_id;
    const phaseId = resolved.phase_id;
    const phaseDir = resolved.phase_dir;
    const workspace = intake.resolveChangeWorkspace(opts.projectRoot, changeId);
    if (!workspace.ok) {
        return { ok: false, code: 'workspace_failed', message: workspace.error.message };
    }
    const status = intake.readStatus(workspace.workspace_dir);
    if (!status || status.verified !== true) {
        return { ok: false, code: 'ndd_not_verified', message: `NDD change '${changeId}' has not been successfully verified. Run ndd verify first.` };
    }
    const nddVerificationPath = node_path_1.default.join(workspace.workspace_dir, 'VERIFICATION.md');
    if (!node_fs_1.default.existsSync(nddVerificationPath)) {
        return { ok: false, code: 'ndd_verification_missing', message: `NDD verification file was not found at ${nddVerificationPath}.` };
    }
    const gsdVerification = readGsdVerificationStatus(opts.projectRoot, phaseDir);
    if (gsdVerification.status !== 'passed') {
        return { ok: false, code: 'gsd_verification_not_passed', message: `Canonical GSD verification status is not passed ('${gsdVerification.status}').` };
    }
    return {
        ok: true,
        change_id: changeId,
        phase_id: phaseId,
        phase_dir: phaseDir,
        workspace_dir: workspace.workspace_dir,
        relative_workspace_dir: workspace.relative_workspace_dir,
        ndd_verification_path: toPosixPath(node_path_1.default.relative(opts.projectRoot, nddVerificationPath)),
        gsd_verification_status: gsdVerification.status,
        gsd_verification_path: gsdVerification.gsd_verification_path,
    };
}
function renderNddShipContext(input) {
    return [
        `# NDD Ship Context: ${input.change_id}`,
        '',
        '## Ship Metadata',
        '',
        `- Change ID: ${input.change_id}`,
        `- Linked GSD phase ID: ${input.phase_id}`,
        `- NDD change workspace: \`${input.relative_workspace_dir}\``,
        `- NDD Verification: ${input.ndd_verification_path}`,
        `- GSD Verification Status: ${input.gsd_verification_status}`,
        `- GSD Verification Path: ${input.gsd_verification_path || 'none'}`,
        '',
        '## Summaries',
        '',
        '### Change Spec Summary',
        `- Please refer to approved spec at: ${input.relative_workspace_dir}/CHANGE-SPEC.md`,
        '',
        '### Impact Summary',
        `- Please refer to impact mapping at: ${input.relative_workspace_dir}/IMPACT.md`,
        '',
        '### Verification Summary',
        `- Please refer to verification evidence at: ${input.ndd_verification_path}`,
        '',
    ].join('\n');
}
function writeNddShipContext(opts) {
    const prepared = prepareNddShip(opts);
    if (!prepared.ok)
        return prepared;
    const contextContent = renderNddShipContext(prepared);
    const shipContextPath = node_path_1.default.join(prepared.workspace_dir, 'SHIP-CONTEXT.md');
    (0, shell_command_projection_cjs_1.platformWriteSync)(shipContextPath, contextContent);
    return {
        ...prepared,
        ship_context_path: toPosixPath(node_path_1.default.relative(opts.projectRoot, shipContextPath)),
    };
}
function markNddShipped(opts) {
    const resolved = resolveNddLinkedPhase(opts.projectRoot, opts.inputId);
    if (!resolved.ok) {
        return { ok: false, message: resolved.message };
    }
    const workspace = intake.resolveChangeWorkspace(opts.projectRoot, resolved.change_id);
    if (!workspace.ok) {
        return { ok: false, message: workspace.error.message };
    }
    const status = intake.readStatus(workspace.workspace_dir);
    if (status) {
        const updatedStatus = {
            ...status,
            shipped: true,
            shipped_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(opts.prUrl ? { pr_url: opts.prUrl } : {}),
            ...(opts.prNumber ? { pr_number: opts.prNumber } : {}),
        };
        intake.writeStatus(workspace.workspace_dir, updatedStatus);
    }
    return { ok: true, change_id: resolved.change_id };
}
function markNddShipBlocked(opts) {
    const resolved = resolveNddLinkedPhase(opts.projectRoot, opts.inputId);
    if (!resolved.ok) {
        return { ok: false, message: resolved.message };
    }
    const workspace = intake.resolveChangeWorkspace(opts.projectRoot, resolved.change_id);
    if (!workspace.ok) {
        return { ok: false, message: workspace.error.message };
    }
    const status = intake.readStatus(workspace.workspace_dir);
    if (status) {
        const updatedStatus = {
            ...status,
            ship_status: 'ship_blocked',
            ship_blocker: opts.reason,
            updated_at: new Date().toISOString(),
        };
        intake.writeStatus(workspace.workspace_dir, updatedStatus);
    }
    return { ok: true, change_id: resolved.change_id };
}
