import { error } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { createCapabilityMap, type OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { projectOrganizationAccessGrant } from '$lib/access/memberAccessProjection';
import {
	createPersonnelReadinessStreams,
	loadRequestPersonnelReadiness,
	loadRequestPersonnelReadinessBadge
} from './personnelReadinessLoad';
import type { loadWithContext } from './httpAdapter';

const person = { id: 'person-1' } as Personnel;
const streams = {
	attention: Promise.resolve({ readinessBadge: { count: 3, complete: true } })
};

function request() {
	return { locals: {} as App.Locals, cookies: {} as never, params: { orgId: 'org-1' } };
}

function loader(result: () => Promise<unknown>) {
	return vi.fn(result) as unknown as typeof loadWithContext & ReturnType<typeof vi.fn>;
}

describe('loadRequestPersonnelReadiness', () => {
	it('reads each source once per request for the page and the layout badge', async () => {
		const load = loader(async () => streams);
		const shared = request();

		void loadRequestPersonnelReadiness(shared, person, '2026-10-06', load);
		const badge = loadRequestPersonnelReadinessBadge(shared, person, '2026-10-06', load);

		expect(await badge).toEqual({ count: 3, complete: true });
		expect(load).toHaveBeenCalledTimes(1);

		await loadRequestPersonnelReadiness(request(), person, '2026-10-06', load);
		expect(load).toHaveBeenCalledTimes(2);
	});
});

describe('loadRequestPersonnelReadinessBadge', () => {
	it('hides the badge from a viewer denied sensitive records', async () => {
		const denied = loader(async () => error(403, 'Forbidden'));
		await expect(loadRequestPersonnelReadinessBadge(request(), person, '2026-10-06', denied)).resolves.toBeNull();
	});

	it('reports a failed read instead of an empty badge', async () => {
		const failed = loader(async () => {
			throw new Error('provider down');
		});
		await expect(loadRequestPersonnelReadinessBadge(request(), person, '2026-10-06', failed)).rejects.toThrow(
			'provider down'
		);
	});
});

describe('createPersonnelReadinessStreams', () => {
	const okafor = { id: 'okafor', groupId: null, ets: '2027-03-14', deros: null } as Personnel;
	const LANE_FEATURES: FeatureKey[] = ['training', 'criticalTasks', 'evaluations', 'onboarding'];
	const unreadable = new Proxy(
		{},
		{
			get: () => async () => {
				throw new Error('read a source the unit turned off');
			}
		}
	);

	function streamsFor(auth: OrganizationAccessGrant, disabledFeatures: FeatureKey[]) {
		const ctx = {
			detail: { auth, audit: { log() {} } },
			trainingCatalog: unreadable,
			trainingCompletions: unreadable,
			organizationSettings: unreadable,
			criticalTaskLibrary: unreadable,
			criticalTaskCompletions: unreadable,
			ratingScheme: unreadable,
			onboardingWorkflow: unreadable,
			findPersonNames: async () => new Map(),
			loadLossWarningWindowDays: disabledFeatures.includes('lossesAndAwards')
				? async () => {
						throw new Error('read the loss window while Losses and awards is off');
					}
				: async () => 180,
			disabledFeatures
		} as unknown as Parameters<typeof createPersonnelReadinessStreams>[0];
		return createPersonnelReadinessStreams(ctx, okafor, '2026-10-06');
	}

	function owner(disabledFeatures: FeatureKey[]) {
		return projectOrganizationAccessGrant({ role: 'owner' }, 'user-1', 'org-1', { disabledFeatures });
	}

	it('reads no switched-off source and reports none of them as unchecked', async () => {
		const streams = streamsFor(owner(LANE_FEATURES), LANE_FEATURES);

		expect([streams.training, streams.criticalTasks, streams.evaluation, streams.onboarding]).toEqual([
			null,
			null,
			null,
			null
		]);
		expect(await streams.attention).toEqual({
			items: [
				{
					kind: 'loss',
					status: 'upcoming',
					id: 'ETS',
					title: 'ETS 14 Mar 2027',
					detail: 'Inside the 180-day loss window',
					dueDate: '2027-03-14',
					daysUntilDue: 159,
					target: { tab: 'data-sheet' }
				}
			],
			readinessBadge: { count: 0, complete: true },
			checked: {
				training: { state: 'off' },
				criticalTasks: { state: 'off' },
				evaluation: { state: 'off' },
				loss: { state: 'checked' },
				onboarding: { state: 'off' }
			},
			failed: []
		});
	});

	it('keeps loss dates without a window or warning when Losses and awards is off', async () => {
		const off: FeatureKey[] = [...LANE_FEATURES, 'lossesAndAwards'];
		const streams = streamsFor(owner(off), off);

		expect(await streams.loss).toEqual({
			windowDays: null,
			ets: { date: '2027-03-14', daysRemaining: 159 },
			deros: null,
			inWindow: null
		});
		expect((await streams.attention).items).toEqual([]);
		expect((await streams.attention).failed).toEqual([]);
	});

	it('still reports a lane the member lacks as unchecked while the feature is on', async () => {
		const member: OrganizationAccessGrant = {
			userId: 'user-2',
			orgId: 'org-1',
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: { ...createCapabilityMap('view'), training: 'none' },
			scopeSet: { kind: 'organization' }
		};
		const streams = streamsFor(member, []);

		await expect(streams.training).rejects.toMatchObject({ status: 403 });
		expect((await streams.attention).checked.training).toEqual({ state: 'failed' });
		expect((await streams.attention).failed).toContain('training');
	});
});
