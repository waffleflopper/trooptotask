import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	loadAvailabilityReadinessLane,
	loadLossTrackingReadinessLane,
	loadRatingSchemeReadinessLane
} from './personnelReadinessLanes';

const AS_OF = '2026-05-14';
const listStatusTypes = async () => [{ id: 'tdy', name: 'TDY', color: '#000', textColor: '#fff' }];

function seedPerson(ctx: ReturnType<typeof createTestContext>, overrides: Record<string, unknown> = {}) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: 'group-1',
			rank: 'SGT',
			last_name: 'Rivera',
			first_name: 'Monica',
			mos: '68W',
			clinic_role: 'Medic',
			ets: '2026-06-20',
			deros: null,
			archived_at: null,
			...overrides
		}
	]);
}

describe('personnel readiness lanes', () => {
	it('flags an active Calendar status for attention', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		ctx.store.seed('status_types', [
			{
				id: 'tdy',
				organization_id: ctx.auth.orgId,
				name: 'TDY',
				color: '#000',
				text_color: '#fff'
			}
		]);
		const listEntries = vi.fn().mockResolvedValue([
			{
				id: 'availability-1',
				personnelId: 'person-1',
				statusTypeId: 'tdy',
				startDate: '2026-05-13',
				endDate: '2026-05-15',
				note: 'Range support'
			}
		]);

		await expect(
			loadAvailabilityReadinessLane(ctx, 'person-1', AS_OF, listEntries, listStatusTypes)
		).resolves.toMatchObject({
			label: 'Availability',
			value: 'TDY',
			detail: 'TDY through May 15, 2026. Range support',
			tone: 'watch'
		});
	});

	it('reports present when Calendar entries are outside today', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		const listEntries = vi.fn().mockResolvedValue([]);
		await expect(
			loadAvailabilityReadinessLane(ctx, 'person-1', AS_OF, listEntries, listStatusTypes)
		).resolves.toMatchObject({
			value: 'Present',
			tone: 'good'
		});
		expect(listEntries).toHaveBeenCalledWith(ctx, {
			rangeStart: AS_OF,
			rangeEnd: AS_OF,
			personnelId: 'person-1',
			orderByEndDate: true
		});
	});

	it('denies availability without Calendar access before reading Calendar facts', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPerson(ctx);
		const reads = vi.spyOn(ctx.store, 'findMany');
		await expect(loadAvailabilityReadinessLane(ctx, 'person-1', AS_OF, vi.fn(), listStatusTypes)).rejects.toMatchObject(
			{ status: 403 }
		);
		expect(reads).not.toHaveBeenCalled();
	});

	it('denies availability outside the member Group scope before reading Calendar facts', async () => {
		const ctx = createTestContext({
			auth: { role: 'member', scopeSet: { kind: 'groups', groupIds: ['other-group'] } }
		});
		seedPerson(ctx);
		const reads = vi.spyOn(ctx.store, 'findMany');
		await expect(loadAvailabilityReadinessLane(ctx, 'person-1', AS_OF, vi.fn(), listStatusTypes)).rejects.toMatchObject(
			{ status: 403 }
		);
		expect(reads).not.toHaveBeenCalled();
	});

	it('does not disclose availability for another Organization personnel id', async () => {
		const ctx = createTestContext();
		seedPerson(ctx, { organization_id: 'foreign-org' });
		const reads = vi.spyOn(ctx.store, 'findMany');
		await expect(loadAvailabilityReadinessLane(ctx, 'person-1', AS_OF, vi.fn(), listStatusTypes)).rejects.toMatchObject(
			{ status: 404 }
		);
		expect(reads).not.toHaveBeenCalled();
	});

	it('reports whether Rating Scheme raters are assigned', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rating-1',
				organization_id: ctx.auth.orgId,
				rated_person_id: 'person-1',
				eval_type: 'NCOER',
				rater_person_id: 'rater-1',
				rater_name: null,
				senior_rater_person_id: null,
				senior_rater_name: null,
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-12-31',
				status: 'active'
			}
		]);

		await expect(loadRatingSchemeReadinessLane(ctx, 'person-1', AS_OF)).resolves.toMatchObject({
			label: 'Rating Scheme',
			value: 'Senior rater needed',
			detail: 'Rater assigned. Senior rater missing.',
			tone: 'watch'
		});
	});

	it('calculates Loss Tracking from the Soldier ETS proximity', async () => {
		const ctx = createTestContext();
		seedPerson(ctx, { ets: '2026-06-20' });

		await expect(loadLossTrackingReadinessLane(ctx, 'person-1', AS_OF)).resolves.toMatchObject({
			label: 'Loss Tracking',
			value: 'Action needed',
			detail: 'ETS Jun 20, 2026 is 37 days away.',
			tone: 'watch'
		});
	});
});
