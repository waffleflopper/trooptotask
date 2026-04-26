import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { createInMemoryOrgWorkspacePort } from '$lib/server/adapters/inMemoryOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { WorkspaceBootstrap, WorkspaceKey } from '$lib/server/core/orgShell';
import type { RatingSchemeBootstrap } from '$lib/server/core/useCases/personnelWorkspaceQuery';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelLookup } from '$lib/types';
import { _createEvalsLayoutLoad } from './+layout.server';

describe('evals layout server load', () => {
	it('loads the rating-scheme workspace behind the dedicated rating-scheme route', async () => {
		const ratingSchemeEntries = [
			{
				id: 'rs1',
				ratedPersonId: 'p1',
				evalType: 'NCOER',
				raterPersonId: null,
				raterName: null,
				seniorRaterPersonId: null,
				seniorRaterName: null,
				intermediateRaterPersonId: null,
				intermediateRaterName: null,
				reviewerPersonId: null,
				reviewerName: null,
				ratingPeriodStart: '2024-01-01',
				ratingPeriodEnd: '2024-12-31',
				status: 'active',
				notes: null,
				reportType: 'AN',
				workflowStatus: 'drafting'
			} satisfies RatingSchemeEntry
		];
		const evalsData: RatingSchemeBootstrap = {
			personnelLookup: [{ id: 'p1', rank: 'SGT', firstName: 'John', lastName: 'Smith' } as PersonnelLookup],
			ratingSchemeEntries,
			lossWarningWindowDays: 180
		};
		const depends = vi.fn();
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['rating-scheme', evalsData]])
		);
		const plannerPort = createDefaultHydrationPlanner('org-1');
		const createWorkspacePort = vi.fn().mockReturnValue(workspacePort);
		const createPlannerPort = vi.fn().mockReturnValue(plannerPort);
		const load = _createEvalsLayoutLoad({
			createWorkspacePort,
			createPlannerPort
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;

		const result = await load({
			params: { orgId: 'org-1' },
			locals,
			cookies,
			depends,
			url: new URL('https://example.test/org/org-1/evals')
		} as unknown as Parameters<typeof load>[0]);

		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:rating-scheme-data');
		expect(createWorkspacePort).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(createPlannerPort).toHaveBeenCalledWith('org-1');
		expect(result).toMatchObject({
			ratingScheme: {
				workspace: 'rating-scheme',
				data: evalsData,
				hydration: {
					orgId: 'org-1',
					ratingSchemeEntries: expect.objectContaining({
						mode: 'replace',
						items: evalsData.ratingSchemeEntries,
						deferred: false,
						snapshotKey: expect.any(String)
					})
				}
			} satisfies WorkspaceBootstrap<RatingSchemeBootstrap>
		});
	});
});
