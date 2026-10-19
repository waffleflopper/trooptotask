import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from './ratingSchemePersistence.test-support.server';
import { createSupabaseRatingSchemePersistence } from './ratingSchemePersistence.server';
import { mapRatingSchemeEntry, type RatingSchemeRow } from './ratingSchemeEntryMapping.server';
import { loadRatingSchemeWorkspace } from './ratingSchemeWorkspaceQuery.server';

const orgId = 'test-org';
const actor = {
	role: 'member' as const,
	isPrivileged: false,
	capabilityMap: {
		calendar: 'none',
		personnel: 'none',
		training: 'none',
		criticalTasks: 'none',
		onboarding: 'none',
		ratingScheme: 'view'
	} as const,
	scopeSet: { kind: 'groups' as const, groupIds: ['alpha'] }
};
const person = { id: 'person-alpha', rank: 'SGT', firstName: 'Synthetic', lastName: 'Able' };
function row(id: string, ratedPersonId = person.id) {
	return {
		id,
		organization_id: orgId,
		rated_person_id: ratedPersonId,
		eval_type: 'NCOER',
		rater_person_id: null,
		rater_name: 'External rater',
		senior_rater_person_id: null,
		senior_rater_name: 'External senior',
		intermediate_rater_person_id: null,
		intermediate_rater_name: null,
		reviewer_person_id: null,
		reviewer_name: null,
		rating_period_start: '2026-01-01',
		rating_period_end: '2026-12-31',
		status: 'active',
		notes: 'Saved note',
		report_type: 'AN',
		workflow_status: 'with-rater'
	};
}

function context() {
	const ctx = createTestContext({ auth: actor });
	ctx.personnelRatingSchemeRoster = {
		listActiveReferences: vi.fn().mockResolvedValue([person]),
		listArchivedIds: vi.fn().mockResolvedValue([]),
		findRatedPersonForWrite: vi.fn(),
		hasEvaluatorReferences: vi.fn()
	};
	return ctx;
}

/** Real request adapter, synthetic PostgREST responses; no provider/network claim. */
function pagedStore(rows: ReturnType<typeof row>[], failSecondPage = false) {
	const requests: URL[] = [];
	const client = createClient('http://127.0.0.1:1', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input) => {
				const url = new URL(String(input));
				requests.push(url);
				if (
					url.pathname !== '/rest/v1/rating_scheme_entries' ||
					url.searchParams.get('organization_id') !== 'eq.test-org'
				) {
					return new Response(JSON.stringify({ message: 'Unexpected source scope' }), { status: 400 });
				}
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (failSecondPage && offset === 1000)
					return new Response(JSON.stringify({ message: 'Later page unavailable' }), {
						status: 503,
						headers: { 'Retry-After': '0' }
					});
				const order = (url.searchParams.get('order') ?? '').split(',');
				const ordered = [...rows].sort((a, b) => {
					for (const clause of order) {
						const [column, direction] = clause.split('.');
						const value = String(a[column as keyof typeof a] ?? '').localeCompare(
							String(b[column as keyof typeof b] ?? '')
						);
						if (value) return direction === 'desc' ? -value : value;
					}
					return 0;
				});
				return new Response(
					JSON.stringify(ordered.slice(offset, offset + Number(url.searchParams.get('limit') ?? 1000))),
					{ headers: { 'Content-Type': 'application/json' } }
				);
			}
		}
	});
	return { ratingScheme: createSupabaseRatingSchemePersistence(client, orgId), requests };
}

describe('Rating-owned Evals workspace', () => {
	it('loads Rating-only references and complete tied-date pages with stable identities', async () => {
		const ctx = context();
		const ids = Array.from({ length: 1001 }, (_, i) => `entry-${String(i).padStart(4, '0')}`);
		const provider = pagedStore(ids.map((id) => row(id)).reverse());
		const result = await loadRatingSchemeWorkspace({ ...ctx, ratingScheme: provider.ratingScheme });
		expect(result.personnelLookup).toEqual([person]);
		expect(result.ratingSchemeEntries.map((entry) => entry.id)).toEqual(ids);
		expect(result.ratingSchemeEntries[1000]).toMatchObject({
			ratedPersonId: 'person-alpha',
			raterName: 'External rater',
			reportType: 'AN',
			workflowStatus: 'with-rater',
			notes: 'Saved note'
		});
		expect(provider.requests.map((url) => url.searchParams.get('offset'))).toEqual(['0', '1000']);
	});
	it('omits entries whose rated Person is archived, matching IDs case-insensitively', async () => {
		const ctx = context();
		vi.mocked(ctx.personnelRatingSchemeRoster!.listArchivedIds).mockResolvedValue([
			'PERSON-ARCHIVED',
			'person-archived-lower'
		]);
		const provider = pagedStore([
			row('entry-active'),
			row('entry-archived', 'person-archived'),
			row('entry-archived-upper', 'PERSON-ARCHIVED-LOWER'),
			row('entry-other-active', 'person-bravo')
		]);
		const result = await loadRatingSchemeWorkspace({ ...ctx, ratingScheme: provider.ratingScheme });
		expect(result.ratingSchemeEntries.map((entry) => entry.id)).toEqual(['entry-active', 'entry-other-active']);
		expect(ctx.personnelRatingSchemeRoster?.listArchivedIds).toHaveBeenCalledWith(ctx.auth);
	});
	it('rejects an archived-ID provider failure rather than publishing archived entries', async () => {
		const ctx = context();
		vi.mocked(ctx.personnelRatingSchemeRoster!.listArchivedIds).mockRejectedValue(new Error('Archived unavailable'));
		await expect(loadRatingSchemeWorkspace(ctx)).rejects.toThrow('Archived unavailable');
	});
	it('rejects a later-page failure rather than publishing a truncated workspace', async () => {
		const ctx = context();
		const provider = pagedStore(
			Array.from({ length: 1001 }, (_, i) => row(`entry-${i}`)),
			true
		);
		await expect(loadRatingSchemeWorkspace({ ...ctx, ratingScheme: provider.ratingScheme })).rejects.toThrow(
			'Later page unavailable'
		);
	});
	it('denies Personnel-only readers before either private read', async () => {
		const ctx = context();
		const auth = {
			...ctx.auth,
			capabilityMap: { ...ctx.auth.capabilityMap, personnel: 'view' as const, ratingScheme: 'none' as const }
		};
		const listWorkspace = vi.fn();
		await expect(loadRatingSchemeWorkspace({ ...ctx, auth, ratingScheme: { listWorkspace } })).rejects.toMatchObject({
			status: 403
		});
		expect(listWorkspace).not.toHaveBeenCalled();
		expect(ctx.personnelRatingSchemeRoster?.listActiveReferences).not.toHaveBeenCalled();
		expect(ctx.personnelRatingSchemeRoster?.listArchivedIds).not.toHaveBeenCalled();
	});
	it('propagates a reference-provider failure', async () => {
		const ctx = context();
		ctx.rawStore.seed('rating_scheme_entries', [row('entry-1')]);
		vi.mocked(ctx.personnelRatingSchemeRoster!.listActiveReferences).mockRejectedValue(
			new Error('References unavailable')
		);
		await expect(loadRatingSchemeWorkspace(ctx)).rejects.toThrow('References unavailable');
	});
	it('does not serialize the independent entry and reference reads', async () => {
		const ctx = context();
		const started = new Set<string>();
		let release!: () => void;
		const wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		const ratingScheme = {
			listWorkspace: async () => {
				started.add('entries');
				await wait;
				return [mapRatingSchemeEntry(row('entry-1') as RatingSchemeRow)];
			}
		};
		const personnelRatingSchemeRoster = {
			listActiveReferences: async () => {
				started.add('references');
				await wait;
				return [person];
			},
			listArchivedIds: async () => {
				started.add('archived');
				await wait;
				return [];
			}
		};
		const pending = loadRatingSchemeWorkspace({ ...ctx, ratingScheme, personnelRatingSchemeRoster });
		try {
			await vi.waitFor(() => expect(started).toEqual(new Set(['entries', 'references', 'archived'])));
		} finally {
			release();
		}
		await expect(pending).resolves.toMatchObject({ ratingSchemeEntries: [{ id: 'entry-1' }] });
	});
});
