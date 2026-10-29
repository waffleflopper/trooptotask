import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	buildLayoutRequest,
	createOrganizationInvitationSetupStateLookup,
	createRequestGroupContext
} from '$lib/server/adapters/requestContexts.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import {
	createSupabaseOrganizationSettingsReader,
	loadPendingInvitationsSettings
} from '$features/organization/index.server';
import type { SetupTeamData } from '$features/organization/contracts';
import { listScopeGroups } from '$features/personnel/index.server';

type SetupTeamContext = Parameters<typeof loadPendingInvitationsSettings>[0] &
	Parameters<typeof listScopeGroups>[0] & {
		auth: Pick<OrganizationAccessGrant, 'role' | 'userId' | 'capabilityMap' | 'scopeSet'>;
	};

/** A viewer without the invite action gets an empty step: its form and the invitations it would list stay unread. */
export async function readSetupTeam(ctx: SetupTeamContext): Promise<SetupTeamData> {
	const canInvite = evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: ctx.auth.role, userId: ctx.auth.userId },
		action: POLICY_ACTION_CATALOG.organization.inviteMember,
		capabilityMap: ctx.auth.capabilityMap,
		scopeSet: ctx.auth.scopeSet,
		resource: { kind: 'organization' }
	}).allowed;
	const isOwner = ctx.auth.role === 'owner';
	if (!canInvite) return { canInvite, isOwner, groups: [], invitations: [] };
	const { groups, invitations } = await loadPendingInvitationsSettings(ctx, { groups: listScopeGroups(ctx) });
	return { canInvite, isOwner, groups, invitations };
}

/** Streams so the step paints its skeleton while the form's groups and the pending invitations load. */
export function loadSetupTeam(event: { locals: App.Locals; params: { orgId: string } }): Promise<SetupTeamData> {
	return keepStreamedRejectionObserved(
		buildLayoutRequest(event.locals, event.params.orgId).then((request) =>
			readSetupTeam({
				...createRequestGroupContext(request),
				disabledFeatures: request.disabledFeatures,
				organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
				organizationInvitationSetupStateLookup: createOrganizationInvitationSetupStateLookup()
			})
		)
	);
}
