import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { QueryWithRawStorePorts } from '$lib/server/core/ports';
import {
	createWorkspaceHydrationTarget,
	type DeferredData,
	type HydrationItems,
	type WorkspaceHydrationTarget
} from '$lib/server/core/streamedWorkspace';
import { requireFeaturePolicy } from '$lib/server/core/useCases/featurePolicy';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import type { PersonnelLookup } from '$lib/types';
import type { RatingSchemeEntry } from '../rating-scheme.types';

export const RATING_SCHEME_WORKSPACE_LANE_KEY = 'ratingScheme' as const;

export interface RatingSchemeWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface RatingSchemeWorkspaceData {
	personnelLookup: PersonnelLookup[];
	ratingSchemeEntries: RatingSchemeEntry[];
	lossWarningWindowDays: number;
}

export type RatingSchemeWorkspaceHydrationMode = 'replace' | 'preserve-client';

export type RatingSchemeWorkspaceHydrationTarget<T> = WorkspaceHydrationTarget<T, RatingSchemeWorkspaceHydrationMode>;

export interface RatingSchemeWorkspaceHydration {
	orgId: string;
	ratingSchemeEntries: RatingSchemeWorkspaceHydrationTarget<RatingSchemeEntry>;
}

export interface RatingSchemeWorkspaceResult {
	laneKey: typeof RATING_SCHEME_WORKSPACE_LANE_KEY;
	data: RatingSchemeWorkspaceData;
	hydration: RatingSchemeWorkspaceHydration;
}

export interface RatingSchemeWorkspaceRouteData {
	ratingScheme: DeferredData<RatingSchemeWorkspaceResult>;
}

async function loadRatingSchemePersonnelLookup(ctx: QueryWithRawStorePorts): Promise<PersonnelLookup[]> {
	if (!ctx.personnelRatingSchemeRoster) {
		throw new Error('Personnel Rating Scheme roster port is required');
	}

	return ctx.personnelRatingSchemeRoster.listActiveReferences(ctx.auth);
}

function createHydrationTarget<T>(items: HydrationItems<T>): RatingSchemeWorkspaceHydrationTarget<T> {
	return createWorkspaceHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'json' });
}

function createRatingSchemeWorkspaceHydration(
	orgId: string,
	data: RatingSchemeWorkspaceData
): RatingSchemeWorkspaceHydration {
	return {
		orgId,
		ratingSchemeEntries: createHydrationTarget(data.ratingSchemeEntries)
	};
}

export async function fetchRatingSchemeWorkspaceData(ctx: QueryWithRawStorePorts): Promise<RatingSchemeWorkspaceData> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.ratingScheme.readRosterReferences,
		{ kind: 'unscoped' },
		'rating-scheme'
	);

	const [personnelLookup, ratingSchemeRows, orgSettingsRow] = await Promise.all([
		loadRatingSchemePersonnelLookup(ctx),
		ctx.store.findMany<Record<string, unknown>>('rating_scheme_entries', ctx.auth.orgId, undefined, {
			orderBy: [{ column: 'rating_period_end', ascending: true }]
		}),
		ctx.store
			.findOne<{
				loss_warning_window_days: number | null;
			}>('organizations', ctx.auth.orgId, {}, 'loss_warning_window_days')
			.catch(() => null)
	]);

	return {
		personnelLookup,
		ratingSchemeEntries: RatingSchemeEntryEntity.fromDbArray(ratingSchemeRows),
		lossWarningWindowDays: orgSettingsRow?.loss_warning_window_days ?? 180
	};
}

export async function streamRatingSchemeWorkspaceBootstrap(
	context: RatingSchemeWorkspaceRequestContext
): Promise<RatingSchemeWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		policyAction: POLICY_ACTION_CATALOG.ratingScheme.viewEntries,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const data = await fetchRatingSchemeWorkspaceData(ctx);
			return {
				laneKey: RATING_SCHEME_WORKSPACE_LANE_KEY,
				data,
				hydration: createRatingSchemeWorkspaceHydration(ctx.auth.orgId, data)
			} satisfies RatingSchemeWorkspaceResult;
		}
	});

	return {
		ratingScheme: deferred
	};
}
