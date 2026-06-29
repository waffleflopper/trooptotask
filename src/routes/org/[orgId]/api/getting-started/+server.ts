import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import type { FindOptions, UseCaseContext } from '$lib/server/core/ports';
import { withDashboardTiming } from '$lib/server/utils/dashboardTiming';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

interface GettingStartedSupportData {
	onboardingTemplateStepCount: number;
	ratingSchemeEntryCount: number;
	orgMemberCount: number;
	dutyRosterTemplateCount: number;
	dutyRosterRunCount: number;
	gettingStartedDismissed: boolean;
}

async function countRows(
	ctx: UseCaseContext,
	table: string,
	filters?: Record<string, unknown>,
	options: FindOptions = {}
): Promise<number> {
	const result = await ctx.store.findManyWithCount<{ id: string }>(table, ctx.auth.orgId, filters, {
		...options,
		select: options.select ?? 'id',
		range: { from: 0, to: 0 },
		count: options.count ?? 'exact'
	});
	if (result.count === null || result.count === undefined) {
		throw new Error(`getting-started expected a count for table "${table}"`);
	}
	return result.count;
}

async function fetchGettingStartedSupport(ctx: UseCaseContext) {
	const [
		onboardingTemplateStepCount,
		ratingSchemeEntryCount,
		orgMemberCount,
		dutyRosterTemplateCount,
		dutyRosterRunCount,
		gettingStartedRows
	] = await Promise.all([
		countRows(ctx, 'onboarding_template_steps'),
		countRows(ctx, 'rating_scheme_entries'),
		countRows(ctx, 'organization_memberships'),
		countRows(ctx, 'duty_roster_templates', { status: 'active' }),
		countRows(ctx, 'duty_roster_template_runs'),
		ctx.auth.userId
			? ctx.store.findMany<Record<string, unknown>>('getting_started_progress', ctx.auth.orgId, {
					user_id: ctx.auth.userId
				})
			: Promise.resolve([])
	]);

	const gettingStartedData = gettingStartedRows.length > 0 ? gettingStartedRows[0] : null;

	return {
		onboardingTemplateStepCount,
		ratingSchemeEntryCount,
		orgMemberCount,
		dutyRosterTemplateCount,
		dutyRosterRunCount,
		gettingStartedDismissed: (gettingStartedData as Record<string, unknown> | null)?.dismissed_at != null
	} satisfies GettingStartedSupportData;
}

export const _getConfig: RouteConfig<void, GettingStartedSupportData> = {
	// Getting-started supports the signed-in user's dashboard checklist, so it follows the identity-owned dashboard boundary.
	policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
	fn: async (ctx) => withDashboardTiming(ctx.auth.orgId, 'support', () => fetchGettingStartedSupport(ctx))
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<void, unknown> = {
	mutation: true,
	readOnlyModeException: 'identity-owned-preference',
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	parseInput: () => undefined,
	fn: async (ctx) => {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Unauthorized');

		const existing = await ctx.store.findOne('getting_started_progress', ctx.auth.orgId, { user_id: userId });

		if (existing) {
			await ctx.store.update(
				'getting_started_progress',
				ctx.auth.orgId,
				(existing as Record<string, unknown>).id as string,
				{ dismissed_at: new Date().toISOString() }
			);
		} else {
			await ctx.store.insert('getting_started_progress', ctx.auth.orgId, {
				user_id: userId,
				dismissed_at: new Date().toISOString()
			});
		}

		return { success: true };
	}
};

export const POST = handle(_postConfig);

export const _deleteConfig: RouteConfig<void, unknown> = {
	mutation: true,
	readOnlyModeException: 'identity-owned-preference',
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	parseInput: () => undefined,
	fn: async (ctx) => {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Unauthorized');

		const existing = await ctx.store.findOne<{ id: string }>('getting_started_progress', ctx.auth.orgId, {
			user_id: userId
		});

		if (existing) {
			await ctx.store.update('getting_started_progress', ctx.auth.orgId, existing.id, {
				dismissed_at: null
			});
		}

		return { success: true };
	}
};

export const DELETE = handle(_deleteConfig);
