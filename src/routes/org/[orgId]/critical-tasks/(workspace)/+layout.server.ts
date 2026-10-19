import type { LayoutServerLoad } from './$types';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { streamReadyFeatureLaneWorkspace } from '$lib/server/adapters/featureLaneWorkspaceLoad';
import type { ReadyAppShell } from '$features/app-shell/contracts';
import { streamCriticalTasksWorkspaceBootstrap } from './criticalTasksWorkspace.server';

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
		resource: { kind: 'organization' }
	}).allowed;
}

export function _createCriticalTasksLayoutLoad(): LayoutServerLoad {
	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:critical-tasks-data'],
			createContext: (event, shell) => ({
				locals: event.locals,
				cookies: event.cookies,
				orgId: shell.org.id,
				includeArchivedTasks: canConfigureCriticalTasksLibrary(shell)
			}),
			streamWorkspace: streamCriticalTasksWorkspaceBootstrap
		});
}

export const load: LayoutServerLoad = _createCriticalTasksLayoutLoad();
