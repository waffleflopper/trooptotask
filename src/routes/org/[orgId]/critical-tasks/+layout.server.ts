import type { LayoutServerLoad } from './$types';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG, type PolicyOverlay } from '$lib/access/policyEvaluator';
import { streamReadyFeatureLaneWorkspace } from '$lib/server/core/featureLaneWorkspaceLoad';
import type { ReadyAppShell } from '$lib/server/core/orgShell';
import {
	streamCriticalTasksWorkspaceBootstrap,
	type CriticalTasksWorkspaceRequestContext,
	type CriticalTasksWorkspaceRouteData
} from '$features/critical-tasks/server/criticalTasksWorkspaceBootstrap';

export interface CriticalTasksLayoutLoadDeps {
	streamCriticalTasksWorkspace?: (
		context: CriticalTasksWorkspaceRequestContext
	) => Promise<CriticalTasksWorkspaceRouteData>;
}

function shouldIncludeArchivedIctTasks(pathname: string): boolean {
	return /\/critical-tasks\/library\/?$/.test(pathname);
}

function readOnlyPolicyOverlays(shell: ReadyAppShell): PolicyOverlay[] {
	return shell.state.isReadOnly
		? [{ id: 'read-only-mode', kind: 'read-only-mode', label: 'Organization is in read-only mode' }]
		: [];
}

function canConfigureCriticalTasksLibrary(shell: ReadyAppShell): boolean {
	return evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: {
			membershipRole: shell.member.role,
			userId: shell.user.id
		},
		action: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
		capabilityMap: shell.member.capabilityMap,
		scopeSet: shell.member.scopeSet,
		resource: { kind: 'organization' },
		overlays: readOnlyPolicyOverlays(shell)
	}).allowed;
}

export function _createCriticalTasksLayoutLoad(deps: CriticalTasksLayoutLoadDeps = {}): LayoutServerLoad {
	const streamCriticalTasksWorkspace = deps.streamCriticalTasksWorkspace ?? streamCriticalTasksWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:critical-tasks-data'],
			createContext: (event, shell) => ({
				locals: event.locals,
				cookies: event.cookies,
				orgId: shell.org.id,
				includeArchivedTasks:
					shouldIncludeArchivedIctTasks(event.url.pathname) && canConfigureCriticalTasksLibrary(shell)
			}),
			streamWorkspace: streamCriticalTasksWorkspace
		});
}

export const load: LayoutServerLoad = _createCriticalTasksLayoutLoad();
