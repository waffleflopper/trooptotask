import { describe, expect, it, vi } from 'vitest';
import type { CapabilityLevel } from '$lib/access/memberAccessShape';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { loadTaskingAvailabilityGaps, type CalendarAvailabilityGapsPorts } from './availabilityGaps.server';

const TASKING = '00000000-0000-4000-8000-000000000101';
const ALICE = '00000000-0000-4000-8000-000000000501';

function member(calendar: CapabilityLevel) {
	const listGaps = vi.fn(async () => [ALICE]);
	const ctx: CalendarAvailabilityGapsPorts = {
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
		calendarAvailabilityGaps: { listGaps }
	};
	return { ctx, listGaps };
}

describe('loadTaskingAvailabilityGaps', () => {
	it('reads the uncovered people for a reader who can view Events', async () => {
		const { ctx, listGaps } = member('view');

		await expect(loadTaskingAvailabilityGaps(ctx, TASKING)).resolves.toEqual([ALICE]);
		expect(listGaps).toHaveBeenCalledExactlyOnceWith(TASKING);
	});

	it('reads nothing for a member without Calendar access', async () => {
		const { ctx, listGaps } = member('none');

		await expect(loadTaskingAvailabilityGaps(ctx, TASKING)).rejects.toMatchObject({ status: 403 });
		expect(listGaps).not.toHaveBeenCalled();
	});

	it('answers 404 for an id that is not a Tasking id without reading', async () => {
		const { ctx, listGaps } = member('operate');

		await expect(loadTaskingAvailabilityGaps(ctx, 'not-an-id')).rejects.toMatchObject({ status: 404 });
		expect(listGaps).not.toHaveBeenCalled();
	});
});
