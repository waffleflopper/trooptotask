import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createQueryWithRawStorePortsContext } from '$lib/server/adapters/inMemory';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { RatingSchemeWorkspaceData } from './ratingSchemeWorkspaceBootstrap';

const { loadWithContextMock, findManyMock, findOneMock, listActiveReferencesMock, mockCtx } = vi.hoisted(() => {
	const findManyMock = vi.fn();
	const findOneMock = vi.fn();
	const listActiveReferencesMock = vi.fn();
	const loadWithContextMock = vi.fn();

	return {
		findManyMock,
		findOneMock,
		listActiveReferencesMock,
		loadWithContextMock,
		mockCtx: {
			auth: {
				userId: 'user-1',
				orgId: '11111111-1111-1111-1111-111111111111',
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'all' }
			},
			store: {
				findMany: findManyMock,
				findOne: findOneMock
			},
			personnelRatingSchemeRoster: {
				listActiveReferences: listActiveReferencesMock
			}
		}
	};
});

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

import { fetchRatingSchemeWorkspaceData, streamRatingSchemeWorkspaceBootstrap } from './ratingSchemeWorkspaceBootstrap';

function makeRatingSchemeRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'rs1',
		organization_id: '11111111-1111-1111-1111-111111111111',
		rated_person_id: 'p1',
		eval_type: 'NCOER',
		rater_person_id: null,
		rater_name: null,
		senior_rater_person_id: null,
		senior_rater_name: null,
		intermediate_rater_person_id: null,
		intermediate_rater_name: null,
		reviewer_person_id: null,
		reviewer_name: null,
		rating_period_start: '2024-01-01',
		rating_period_end: '2024-12-31',
		status: 'active',
		notes: null,
		report_type: 'AN',
		workflow_status: 'drafting',
		...overrides
	};
}

describe('streamRatingSchemeWorkspaceBootstrap', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findOneMock.mockResolvedValue({ loss_warning_window_days: 120 });
		findManyMock.mockResolvedValue([makeRatingSchemeRow()]);
		listActiveReferencesMock.mockResolvedValue([{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }]);
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = config.fn(mockCtx as never);
			return config.defer ? { data } : data;
		});
	});

	it('streams a lane-keyed Rating Scheme workspace result with explicit hydration targets', async () => {
		const routeData = await streamRatingSchemeWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: '1-11-bde'
		});

		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'1-11-bde',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.ratingScheme.viewEntries,
				policyResource: { kind: 'unscoped' },
				defer: true
			})
		);
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('permission');
		expect(routeData.ratingScheme.data).toBeInstanceOf(Promise);

		await expect(routeData.ratingScheme.data).resolves.toMatchObject({
			laneKey: 'ratingScheme',
			data: {
				personnelLookup: [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }],
				lossWarningWindowDays: 120
			},
			hydration: {
				orgId: '11111111-1111-1111-1111-111111111111',
				ratingSchemeEntries: expect.objectContaining({
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String)
				})
			}
		});
	});

	it('composes Rating Scheme entries with Personnel-owned roster references', async () => {
		const result = await fetchRatingSchemeWorkspaceData(mockCtx as never);

		expect(listActiveReferencesMock).toHaveBeenCalledWith(mockCtx.auth);
		expect(findManyMock).toHaveBeenCalledWith(
			'rating_scheme_entries',
			'11111111-1111-1111-1111-111111111111',
			undefined,
			expect.objectContaining({
				orderBy: [{ column: 'rating_period_end', ascending: true }]
			})
		);
		expect(result).toMatchObject({
			personnelLookup: [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }],
			ratingSchemeEntries: [expect.objectContaining({ id: 'rs1' })],
			lossWarningWindowDays: 120
		} satisfies RatingSchemeWorkspaceData);
		expect(result).not.toHaveProperty('personnel');
		expect(result).not.toHaveProperty('groups');
		expect(result).not.toHaveProperty('statusTypes');
		expect(result.ratingSchemeEntries[0]).toMatchObject({
			id: 'rs1',
			evalType: 'NCOER',
			reportType: 'AN'
		} satisfies Partial<RatingSchemeEntry>);
	});
});

describe('fetchRatingSchemeWorkspaceData', () => {
	it('returns Rating Scheme data without Personnel workspace hydration data', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		ctx.store.seed('rating_scheme_entries', [makeRatingSchemeRow({ organization_id: 'test-org' })]);
		ctx.store.seed('organizations', [{ id: 'test-org', loss_warning_window_days: 120 }]);
		ctx.personnelRatingSchemeRoster = {
			listActiveReferences: vi.fn().mockResolvedValue([
				{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' },
				{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }
			])
		};

		const result = await fetchRatingSchemeWorkspaceData(ctx);

		expect(result).not.toHaveProperty('personnel');
		expect(result.personnelLookup).toEqual([
			{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' },
			{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }
		]);
		expect(result).not.toHaveProperty('groups');
		expect(result).not.toHaveProperty('statusTypes');
		expect(result).not.toHaveProperty('pinnedGroups');
		expect(result.ratingSchemeEntries).toHaveLength(1);
		expect(result.lossWarningWindowDays).toBe(120);
		expect(result).not.toHaveProperty('awardTrackingAcknowledgedPersonnelIds');
	});

	it('uses the Personnel-owned Rating Scheme roster port without requiring Personnel access', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'view'
				}
			}
		});
		const listActiveReferences = vi
			.fn()
			.mockResolvedValue([{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' }]);
		ctx.personnelRatingSchemeRoster = { listActiveReferences };

		const result = await fetchRatingSchemeWorkspaceData(ctx);

		expect(listActiveReferences).toHaveBeenCalledWith(ctx.auth);
		expect(result.personnelLookup).toEqual([{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' }]);
	});

	it('does not allow adjacent Personnel capability to read Rating Scheme roster references', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.personnelRatingSchemeRoster = { listActiveReferences: vi.fn().mockResolvedValue([]) };

		await expect(fetchRatingSchemeWorkspaceData(ctx)).rejects.toMatchObject({ status: 403 });
	});

	it('requires the Personnel-owned Rating Scheme roster port', async () => {
		const ctx = createQueryWithRawStorePortsContext();

		await expect(fetchRatingSchemeWorkspaceData(ctx)).rejects.toThrow(
			'Personnel Rating Scheme roster port is required'
		);
	});
});
