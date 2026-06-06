import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelLookup } from '$lib/types';
import type { RatingSchemeWorkspaceRouteData } from '$features/rating-scheme/server/ratingSchemeWorkspaceBootstrap';
import { _createEvalsLayoutLoad } from './+layout.server';

describe('evals layout server load', () => {
	it('registers Evals dependencies and streams the Rating Scheme-owned workspace bootstrap', async () => {
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
		const evalsData = {
			personnelLookup: [{ id: 'p1', rank: 'SGT', firstName: 'John', lastName: 'Smith' } as PersonnelLookup],
			ratingSchemeEntries,
			lossWarningWindowDays: 180
		};
		const depends = vi.fn();
		const streamRatingSchemeWorkspace = vi.fn<() => Promise<RatingSchemeWorkspaceRouteData>>().mockResolvedValue({
			ratingScheme: {
				data: Promise.resolve({
					laneKey: 'ratingScheme',
					data: evalsData,
					hydration: {
						orgId: 'org-1',
						ratingSchemeEntries: {
							mode: 'replace',
							items: ratingSchemeEntries,
							snapshotKey: 'rating-scheme:1'
						}
					}
				})
			}
		});
		const load = _createEvalsLayoutLoad({
			streamRatingSchemeWorkspace
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;

		const result = await load({
			params: { orgId: 'org-1' },
			locals,
			cookies,
			depends,
			parent: async () => createReadyAppShellRouteData({ orgId: 'org-1' }),
			url: new URL('https://example.test/org/org-1/evals')
		} as unknown as Parameters<typeof load>[0]);

		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:rating-scheme-data');
		expect(streamRatingSchemeWorkspace).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(result).toEqual({
			ratingScheme: { data: expect.any(Promise) }
		});
		if (!result) {
			throw new Error('Expected Evals layout load to return data');
		}
		await expect(result.ratingScheme.data).resolves.toMatchObject({
			laneKey: 'ratingScheme',
			data: evalsData,
			hydration: {
				orgId: 'org-1',
				ratingSchemeEntries: expect.objectContaining({
					mode: 'replace',
					items: ratingSchemeEntries,
					snapshotKey: 'rating-scheme:1'
				})
			}
		});
	});
});
