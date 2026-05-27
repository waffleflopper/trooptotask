import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseOrgSettingsAdministrationPort } from '$lib/server/adapters/supabaseOrgSettingsAdministration';
import type { UseCaseContext } from '$lib/server/core/ports';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import {
	clearOrganizationUrlSlug,
	renameOrganization,
	updateOrganizationUrlSlug
} from '$lib/server/core/useCases/orgSettingsAdministration';
import { buildPlanUsageSummary, type PlanUsageSummary } from '$lib/server/core/useCases/planUsageSummary';
import { buildGeneralSettingsData } from '../settingsGeneral.server';

export const load: PageServerLoad = async ({ locals, cookies, parent }) => {
	const parentData = await parent();
	const { orgId, orgName, orgUrlSegment, allOrgs, isAdmin, effectiveTier } = parentData;
	const permissions = parentData.permissions!;

	return loadWithContext(locals, cookies, orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => {
			const planUsageSummary = await loadPlanUsageSummary(ctx);

			return {
				orgId,
				orgUrlSegment: orgUrlSegment ?? orgId,
				orgUrlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
				orgName,
				effectiveTier,
				permissions,
				allOrgs,
				planUsageSummary,
				generalSettings: buildGeneralSettingsData(ctx, {
					isAdmin: Boolean(isAdmin),
					organization: {
						id: orgId,
						name: orgName,
						urlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
						urlSegment: orgUrlSegment ?? orgId,
						effectiveTier: effectiveTier ?? null
					}
				})
			};
		}
	});
};

async function loadPlanUsageSummary(ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>): Promise<PlanUsageSummary> {
	const [policy, usage] = await Promise.all([
		readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore }),
		readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore })
	]);
	return buildPlanUsageSummary(policy, usage);
}

export const actions: Actions = {
	updateName: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			return await renameOrganization(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					readOnlyGuard: ctx.readOnlyGuard,
					administration: createSupabaseOrgSettingsAdministrationPort(locals)
				},
				{
					name: (formData.get('name') as string) ?? ''
				}
			);
		} catch (error) {
			return toActionFailure('error', error);
		}
	},

	updateSlug: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		let orgUrlSlug: string;
		try {
			const ctx = await buildRouteContext(event);
			const result = await updateOrganizationUrlSlug(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					readOnlyGuard: ctx.readOnlyGuard,
					administration: createSupabaseOrgSettingsAdministrationPort(locals)
				},
				{
					urlSlug: (formData.get('urlSlug') as string) ?? ''
				}
			);
			orgUrlSlug = result.orgUrlSlug;
		} catch (error) {
			return toActionFailure('slugError', error);
		}

		throw redirect(303, `/org/${orgUrlSlug}/settings/general`);
	},

	clearSlug: async (event) => {
		const { locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		let orgId: string;
		try {
			const ctx = await buildRouteContext(event);
			await clearOrganizationUrlSlug({
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				readOnlyGuard: ctx.readOnlyGuard,
				administration: createSupabaseOrgSettingsAdministrationPort(locals)
			});
			orgId = ctx.auth.orgId;
		} catch (error) {
			return toActionFailure('slugError', error);
		}

		throw redirect(303, `/org/${orgId}/settings/general`);
	}
};

function toActionFailure(errorKey: string, error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		const data: Record<string, unknown> = { [errorKey]: error.message };
		const reason = Reflect.get(error, 'reason');
		const requiresStepUp = Reflect.get(error, 'requiresStepUp');
		const stepUpPath = Reflect.get(error, 'stepUpPath');

		if (typeof reason === 'string') data.reason = reason;
		if (typeof requiresStepUp === 'boolean') data.requiresStepUp = requiresStepUp;
		if (typeof stepUpPath === 'string') data.stepUpPath = stepUpPath;

		return fail(Reflect.get(error, 'status') as number, data);
	}

	throw error;
}
