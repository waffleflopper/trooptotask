import { describe, expect, it, vi } from 'vitest';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { CapabilityLevel } from '$lib/access/memberAccessShape';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { fetchDashboardTaskings } from './dashboardTaskings.server';

const attention = { rows: [], total: 0 };
const event = {
	id: '00000000-0000-4000-8000-000000000301',
	title: 'Best Medic Competition',
	startsOn: '2026-10-30',
	endsOn: '2026-11-02',
	cancelled: false,
	hasWork: true
};
const suspense = {
	taskingId: '00000000-0000-4000-8000-000000000401',
	title: 'Alpha lane coverage',
	suspenseOn: '2026-11-08',
	status: 'open' as const
};

function ctx(calendar: CapabilityLevel, disabledFeatures: FeatureKey[] = []) {
	return {
		auth: createTestAuthContext({
			userId: '00000000-0000-4000-8000-000000000001',
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar,
				personnel: 'view',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'organization' }
		}),
		taskingAttention: { read: vi.fn(async () => attention) },
		calendarProjection: {
			read: vi.fn(async () => ({ events: [event], suspenses: [suspense], commitments: [] }))
		},
		disabledFeatures
	};
}

describe('fetchDashboardTaskings', () => {
	it('reads attention for the day and the forecast over its 14 days, without commitments', async () => {
		const context = ctx('view');

		await expect(fetchDashboardTaskings(context, '2026-10-26')).resolves.toEqual({
			attention,
			forecast: { events: [event], suspenses: [suspense] }
		});
		expect(context.taskingAttention.read).toHaveBeenCalledWith('2026-10-26');
		expect(context.calendarProjection.read).toHaveBeenCalledWith({
			rangeStart: '2026-10-26',
			rangeEnd: '2026-11-08'
		});
	});

	it('fails as one read when the forecast cannot load', async () => {
		const context = ctx('view');
		context.calendarProjection.read.mockRejectedValueOnce(new Error('projection down'));

		await expect(fetchDashboardTaskings(context, '2026-10-26')).rejects.toThrow('projection down');
	});

	it('makes no request and answers null when the switch is off', async () => {
		const context = ctx('view', ['eventsAndTaskings']);

		await expect(fetchDashboardTaskings(context, '2026-10-26')).resolves.toBeNull();
		expect(context.taskingAttention.read).not.toHaveBeenCalled();
		expect(context.calendarProjection.read).not.toHaveBeenCalled();
	});

	it('answers null for a viewer without the Calendar lane', async () => {
		const context = ctx('none');

		await expect(fetchDashboardTaskings(context, '2026-10-26')).resolves.toBeNull();
		expect(context.taskingAttention.read).not.toHaveBeenCalled();
	});
});
