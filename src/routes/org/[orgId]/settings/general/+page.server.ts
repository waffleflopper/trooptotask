import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildRouteContext } from '$lib/server/adapters/httpAdapter';
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
import { toActionFailure } from '../settingsActionFailure.server';
import { buildGeneralSettingsData } from '../settingsGeneral.server';
import { loadSettingsPage } from '../settingsLoad.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, async (ctx, { common, organization }) => ({
		planUsageSummary: await loadPlanUsageSummary(ctx),
		generalSettings: buildGeneralSettingsData(ctx, {
			isAdmin: common.isAdmin,
			organization
		})
	}));

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
		const nameRaw = formData.get('name');
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
					name: typeof nameRaw === 'string' ? nameRaw : ''
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
		const urlSlugRaw = formData.get('urlSlug');
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
					urlSlug: typeof urlSlugRaw === 'string' ? urlSlugRaw : ''
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
