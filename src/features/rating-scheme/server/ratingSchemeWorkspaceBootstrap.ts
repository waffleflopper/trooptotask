import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { QueryWithRawStorePorts, RatingSchemePersonnelLookupRecord } from '$lib/server/core/ports';
import type { DeferredData, HydrationItems } from '$lib/server/core/orgShell';
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

export interface RatingSchemeWorkspaceHydrationTarget<T> {
	mode: RatingSchemeWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: HydrationItems<T>;
}

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

const deferredSnapshotKeys = new WeakMap<object, string>();
let fallbackSnapshotCounter = 0;

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function generateSnapshotId(prefix: string): string {
	const randomId = globalThis.crypto?.randomUUID?.();
	if (randomId) {
		return `${prefix}:${randomId}`;
	}

	fallbackSnapshotCounter = (fallbackSnapshotCounter + 1) % 1_000_000;
	return `${prefix}:fallback:${fallbackSnapshotCounter}`;
}

function createSnapshotKey(value: unknown): string {
	if (isPromiseLike(value)) {
		let key = deferredSnapshotKeys.get(value);
		if (!key) {
			key = generateSnapshotId('deferred');
			deferredSnapshotKeys.set(value, key);
		}
		return key;
	}

	try {
		return `resolved:${JSON.stringify(value)}`;
	} catch {
		return generateSnapshotId('resolved:fallback');
	}
}

function toPersonnelLookup(rows: RatingSchemePersonnelLookupRecord[]): PersonnelLookup[] {
	return rows.map((person) => ({
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName
	}));
}

async function loadRatingSchemePersonnelLookup(ctx: QueryWithRawStorePorts): Promise<PersonnelLookup[]> {
	if (!ctx.ratingSchemePersonnelLookup) {
		throw new Error('Rating Scheme personnel lookup port is required');
	}

	const records = await ctx.ratingSchemePersonnelLookup.listPersonnelLookup(ctx.auth.orgId);
	return toPersonnelLookup(records);
}

function createHydrationTarget<T>(items: HydrationItems<T>): RatingSchemeWorkspaceHydrationTarget<T> {
	return {
		mode: 'replace',
		deferred: isPromiseLike(items),
		snapshotKey: createSnapshotKey(items),
		items
	};
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
