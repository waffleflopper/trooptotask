import { readPendingDeletionRequestSummary } from '$features/deletion-requests/index.server';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext, createRequestDeletionRequestStore } from '$lib/server/adapters/httpAdapter';
import { streamSettingsNavCounts } from './settingsShell.server';
import { buildSettingsShell } from '$features/organization/contracts';
import { requireReadyAppShell } from '$lib/server/adapters/appShellRouteData';
import { createSettingsShellContext } from './settingsRequestContexts.server';

export const load: LayoutServerLoad = async ({ locals, cookies, params, parent, route, untrack }) => {
	const parentData = await parent();
	if (parentData.shell.kind === 'suspended') {
		redirect(303, `/org/${parentData.shell.org.urlSegment}`);
	}

	const shell = requireReadyAppShell(parentData);
	const orgId = shell.org.id;
	const orgName = shell.org.name;
	const orgUrlSegment = shell.org.urlSegment;

	// A tracked route read would make the client refetch this layout on every switch between settings pages.
	if (untrack(() => route.id) === '/org/[orgId]/settings') {
		redirect(303, `/org/${orgUrlSegment}/settings/general`);
	}

	return loadWithContext(locals, cookies, orgId, {
		context: createSettingsShellContext,
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => ({
			canAccessOrganizationGovernance: true,
			settingsShell: buildSettingsShell(ctx.auth.role, {
				id: orgId,
				name: orgName,
				urlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
				urlSegment: orgUrlSegment ?? params.orgId
			}),
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
