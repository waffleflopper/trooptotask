import type { SetupStepKey } from './registry';
import type { Database, SupabaseClient } from '$lib/server/database';
import { RequestFailure } from '$lib/errors';
import {
	parseOrganizationSetup,
	type OrganizationSetup,
	type SetupAnswer,
	type SetupBranch,
	type SetupPromptKey,
	type SetupPromptState
} from './state';

export interface OrganizationSetupPort {
	read(orgId: string): Promise<OrganizationSetup>;
	saveAnswer(orgId: string, step: SetupStepKey, answer: SetupAnswer | null): Promise<OrganizationSetup>;
	saveBranch(orgId: string, branch: SetupBranch | null): Promise<OrganizationSetup>;
	finish(orgId: string): Promise<OrganizationSetup>;
	savePrompt(orgId: string, key: SetupPromptKey, state: SetupPromptState | null): Promise<OrganizationSetup>;
}

export function createSupabaseOrganizationSetupPort(client: SupabaseClient): OrganizationSetupPort {
	async function call<Name extends keyof Database['public']['Functions']>(
		name: Name,
		args: Database['public']['Functions'][Name]['Args']
	) {
		const { data, error } = await client.rpc(name, args);
		if (error) {
			if (error.code === '42501')
				throw new RequestFailure(403, 'You do not have permission to change Organization setup');
			if (error.code === '22023' || error.code === '23514')
				throw new RequestFailure(400, 'Invalid Organization setup state');
			throw new Error(error.message);
		}
		if (data === null || typeof data !== 'object' || Array.isArray(data))
			throw new Error('Unable to confirm Organization setup state');
		return parseOrganizationSetup(data);
	}
	return {
		read: (orgId) => call('read_organization_setup', { p_organization_id: orgId }),
		saveAnswer: (orgId, step, answer) =>
			call('save_organization_setup_answer', { p_organization_id: orgId, p_step: step, p_answer: answer }),
		saveBranch: (orgId, branch) =>
			call('save_organization_setup_branch', { p_organization_id: orgId, p_branch: branch }),
		finish: (orgId) => call('finish_organization_setup', { p_organization_id: orgId }),
		savePrompt: (orgId, key, state) =>
			call('save_organization_setup_prompt', { p_organization_id: orgId, p_key: key, p_state: state })
	};
}
