import { json, type RequestEvent } from '@sveltejs/kit';
import {
	buildRouteContext,
	createRequestAccountPreferencesProvider,
	handleUseCaseRequest,
	rethrowOrWrap,
	type RouteConfig
} from '$lib/server/adapters/httpAdapter';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadGettingStartedDismissed, setGettingStartedDismissed } from '$features/identity/index.server';
import type { UseCaseContext } from '$lib/server/core/ports';
import { fetchDashboardSetupSupport, withDashboardTiming } from '$features/dashboard/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { listStarterConfigurationPacks } from '$lib/server/core/useCases/starterConfigurationPacks';
import type { DashboardSetupSupport } from '$features/dashboard/contracts';
import { countRatingSchemeEntries } from '$features/rating-scheme/index.server';
import { countTrainingTypes } from '$features/training/index.server';
import { countOnboardingTemplateSteps } from '$features/onboarding/index.server';
import { countOrganizationMembers } from '$features/organization/index.server';

interface GettingStartedSupportData extends DashboardSetupSupport {
	gettingStartedDismissed: boolean;
}

async function fetchGettingStartedSupport(ctx: UseCaseContext, provider: { supabase: SupabaseClient }) {
	const [support, gettingStartedDismissed] = await Promise.all([
		fetchDashboardSetupSupport({
			countTrainingTypes: () => countTrainingTypes(ctx.store, ctx.auth.orgId),
			countOnboardingTemplateSteps: () => countOnboardingTemplateSteps(ctx.store, ctx.auth.orgId),
			countRatingSchemeEntries: () => countRatingSchemeEntries({ store: ctx.rawStore, actor: ctx.auth }),
			countOrganizationMembers: () => countOrganizationMembers(provider.supabase, ctx.auth.orgId),
			listStarterConfigurationPacks: () => listStarterConfigurationPacks(ctx)
		}),
		loadGettingStartedDismissed(provider, ctx.auth)
	]);
	return { ...support, gettingStartedDismissed } satisfies GettingStartedSupportData;
}

/** Per-request composition: Delivery binds Dashboard support and Identity personal progress independently. */
export function _createConfigs(provider: { supabase: SupabaseClient }) {
	const get: RouteConfig<void, GettingStartedSupportData> = {
		policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
		fn: async (ctx) => withDashboardTiming(ctx.auth.orgId, 'support', () => fetchGettingStartedSupport(ctx, provider))
	};
	const progress = (dismissed: boolean): RouteConfig<void, { success: true }> => ({
		mutation: true,
		policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
		parseInput: () => undefined,
		fn: async (ctx) => {
			await setGettingStartedDismissed({ supabase: provider.supabase, auth: ctx.auth, audit: ctx.audit }, dismissed);
			return { success: true };
		}
	});
	return { get, post: progress(true), delete: progress(false) };
}

async function request(event: RequestEvent, method: 'get' | 'post' | 'delete') {
	try {
		const ctx = await buildRouteContext(event);
		const configs = _createConfigs(createRequestAccountPreferencesProvider(event.locals));
		const result =
			method === 'get'
				? await handleUseCaseRequest(configs.get, ctx, undefined)
				: await handleUseCaseRequest(configs[method], ctx, undefined);
		return json(result);
	} catch (cause) {
		rethrowOrWrap(cause);
	}
}

export const GET = (event: RequestEvent) => request(event, 'get');
export const POST = (event: RequestEvent) => request(event, 'post');
export const DELETE = (event: RequestEvent) => request(event, 'delete');
