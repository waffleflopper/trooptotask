import { readPendingDeletionRequestSummary } from '$features/deletion-requests/index.server';
import { redirect } from '@sveltejs/kit';
import { buildLayoutRequest } from '$lib/server/adapters/requestContexts.server';
import type { LayoutServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext, createRequestDeletionRequestStore } from '$lib/server/adapters/httpAdapter';
import { streamSettingsNavCounts } from './settingsShell.server';
import { buildSettingsShell } from '$features/organization/contracts';
import { loadSettingsOrganization, buildSettingsPageOrganization } from './settingsLoad.server';
import { createSettingsShellContext } from './settingsRequestContexts.server';
import { PENDING_APPROVALS_DEPENDENCY } from './settingsDependencies';

export const load: LayoutServerLoad = async (event) => {
	event.depends('app:org-core');
	const { locals, cookies, route, untrack, depends } = event;
	const identity = await loadSettingsOrganization(event);
	const organization = buildSettingsPageOrganization(identity);
	const orgId = organization.id;
	const orgUrlSegment = organization.urlSegment;
	if (identity.suspendedAt) redirect(303, `/org/${orgUrlSegment}`);

	await buildLayoutRequest(locals, identity.id);

	// A tracked route read would make the client refetch this layout on every switch between settings pages.
	if (untrack(() => route.id) === '/org/[orgId]/settings') {
		redirect(303, `/org/${orgUrlSegment}/settings/general`);
	}

	depends(PENDING_APPROVALS_DEPENDENCY);
	return loadWithContext(locals, cookies, orgId, {
		context: createSettingsShellContext,
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => ({
			canAccessOrganizationGovernance: true,
			settingsShell: buildSettingsShell(ctx.auth.role, organization),
			settingsNavCounts: streamSettingsNavCounts(ctx, () =>
				readPendingDeletionRequestSummary({
					auth: ctx.auth,
					audit: ctx.audit,
					store: createRequestDeletionRequestStore(locals)
				})
			)
		})
	});
};
