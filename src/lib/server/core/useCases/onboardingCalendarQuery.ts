/**
 * Onboarding calendar query — minimal read used by the calendar to show onboarding indicators.
 *
 * Returns only the personnel IDs with active (in_progress) onboardings — nothing else.
 * Kept separate from the full `onboardingQuery.ts` to avoid over-fetching on the calendar page.
 */
import type { QueryPorts } from '$lib/server/core/ports';

/**
 * Returns distinct personnel IDs that have an active (in_progress) onboarding.
 * Used by the calendar to show onboarding indicators — read-only, no mutations.
 */
export async function getActiveOnboardingPersonnelIds(ctx: QueryPorts): Promise<string[]> {
	const rows = await ctx.store.findMany<{ personnel_id: string }>('personnel_onboardings', ctx.auth.orgId, {
		status: 'in_progress'
	});

	const uniqueIds = [...new Set(rows.map((r) => r.personnel_id))];
	return uniqueIds;
}
