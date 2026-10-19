import { describe, expect, it } from 'vitest';
import { createTestContext as baseCreateTestContext } from '$lib/server/adapters/inMemory';
import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { loadPersonnelLossReadiness } from './personnelLossReadiness.server';

const AS_OF = '2026-10-06';

async function personWith(dates: { ets: string | null; deros: string | null }) {
	const ctx = withPersonnelPersistence(baseCreateTestContext());
	ctx.store.seed('personnel', [
		{
			id: 'okafor',
			organization_id: ctx.auth.orgId,
			group_id: 'group-1',
			rank: 'SGT',
			last_name: 'Okafor',
			first_name: 'Daniel',
			mos: '68W',
			clinic_role: 'Medic',
			archived_at: null,
			...dates
		}
	]);
	return { ctx, person: (await ctx.organizationPersonnel.findById('okafor'))! };
}

describe('loadPersonnelLossReadiness', () => {
	it('reports both dates and the day the nearest one entered the loss window', async () => {
		const { ctx, person } = await personWith({ ets: '2027-03-14', deros: '2027-06-01' });

		await expect(loadPersonnelLossReadiness(ctx, person, AS_OF, async () => 180)).resolves.toEqual({
			windowDays: 180,
			ets: { date: '2027-03-14', daysRemaining: 159 },
			deros: { date: '2027-06-01', daysRemaining: 238 },
			inWindow: { trigger: 'ETS', date: '2027-03-14', daysRemaining: 159, enteredOn: '2026-09-15' }
		});
	});

	it('has no window entry when neither date is inside it', async () => {
		const { ctx, person } = await personWith({ ets: '2028-01-01', deros: null });

		await expect(loadPersonnelLossReadiness(ctx, person, AS_OF, async () => null)).resolves.toEqual({
			windowDays: 180,
			ets: { date: '2028-01-01', daysRemaining: 452 },
			deros: null,
			inWindow: null
		});
	});

	it('fails rather than guessing when the window setting cannot be read', async () => {
		const { ctx, person } = await personWith({ ets: '2027-03-14', deros: null });

		await expect(
			loadPersonnelLossReadiness(ctx, person, AS_OF, async () => {
				throw new Error('Settings unavailable');
			})
		).rejects.toThrow('Loss warning window unavailable');
	});
});
