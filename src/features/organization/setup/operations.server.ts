import type { z } from 'zod';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { requireGovernancePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import { fail } from '$lib/errors';
import type { setupAnswerInputSchema, setupBranchInputSchema, setupPromptInputSchema } from './state';
import type { OrganizationSetupPort } from './persistence.server';

type SetupPorts = { auth: OrganizationAccessGrant; audit: PolicyAuditSink; organizationSetup: OrganizationSetupPort };

export async function saveOrganizationSetupAnswer(ports: SetupPorts, input: z.infer<typeof setupAnswerInputSchema>) {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);
	return ports.organizationSetup.saveAnswer(ports.auth.orgId, input.step, input.answer);
}
export async function saveOrganizationSetupBranch(ports: SetupPorts, input: z.infer<typeof setupBranchInputSchema>) {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);
	return ports.organizationSetup.saveBranch(ports.auth.orgId, input.branch);
}
export async function finishOrganizationSetup(ports: SetupPorts) {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);
	return ports.organizationSetup.finish(ports.auth.orgId);
}
export async function saveOrganizationSetupPrompt(ports: SetupPorts, input: z.infer<typeof setupPromptInputSchema>) {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);
	if (ports.auth.role !== 'owner') fail(403, 'Only the Organization owner can change setup prompts');
	return ports.organizationSetup.savePrompt(ports.auth.orgId, input.key, input.state);
}
