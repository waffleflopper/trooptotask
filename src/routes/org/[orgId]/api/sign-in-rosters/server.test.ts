import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('/api/sign-in-rosters route config', () => {
	it('persists sign-in rosters through the Training record policy for operators', async () => {
		let legacyEditCalled = false;
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'operate',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' },
				requireEdit() {
					legacyEditCalled = true;
					throw new Error('legacy Training edit flag should not decide sign-in roster writes');
				}
			}
		});

		const result = (await handleUseCaseRequest(_postConfig, ctx, {
			title: 'Annual AT Sign-In',
			rosterDate: '2026-05-02',
			blankDate: false,
			separateByGroup: true,
			sortBy: 'rank',
			personnelSnapshot: [{ id: 'p-1', rank: 'SGT', lastName: 'Smith', firstName: 'Jane' }],
			filterConfig: { groups: ['Alpha'] }
		})) as Record<string, unknown>;

		expect(result).toMatchObject({
			title: 'Annual AT Sign-In',
			sortBy: 'rank'
		});
		expect(legacyEditCalled).toBe(false);

		const stored = await ctx.store.findMany('sign_in_rosters', ctx.auth.orgId);
		expect(stored).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'sign_in_roster.created',
			resourceType: 'sign_in_roster'
		});
	});
});
