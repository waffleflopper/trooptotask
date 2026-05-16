import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	loadAvailabilityReadinessLane,
	loadCriticalTasksReadinessLane,
	loadDutyRosterReadinessLane,
	loadLossTrackingReadinessLane,
	loadRatingSchemeReadinessLane,
	loadTrainingReadinessLane
} from './personnelReadinessLanes';

const AS_OF = '2026-05-14';

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
	it('loads today availability from Calendar status entries', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		ctx.store.seed('status_types', [
			{
				id: 'tdy',
				organization_id: ctx.auth.orgId,
				name: 'TDY',
				color: '#000',
				text_color: '#fff',
				da6_treatment_reviewed: true
			}
		]);
		ctx.store.seed('availability_entries', [
			{
				id: 'availability-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				status_type_id: 'tdy',
				start_date: '2026-05-13',
				end_date: '2026-05-15',
				note: 'Range support'
			}
		]);

		await expect(loadAvailabilityReadinessLane(ctx, 'person-1', AS_OF)).resolves.toMatchObject({
			label: 'Availability',
			value: 'TDY',
			detail: 'TDY through May 15, 2026. Range support',
			tone: 'watch'
		});
	});

	it('counts due and overdue Training requirements for the Soldier', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		ctx.store.seed('training_types', [
			{
				id: 'hipaa',
				organization_id: ctx.auth.orgId,
				name: 'HIPAA',
				description: null,
				expiration_months: 12,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#000',
				sort_order: 1,
				expiration_date_only: true,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			},
			{
				id: 'cyber',
				organization_id: ctx.auth.orgId,
				name: 'Cyber Awareness',
				description: null,
				expiration_months: 12,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#000',
				sort_order: 2,
				expiration_date_only: true,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);
		ctx.store.seed('personnel_trainings', [
			{
				id: 'training-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				training_type_id: 'hipaa',
				completion_date: null,
				expiration_date: '2026-05-10',
				notes: null,
				certificate_url: null
			},
			{
				id: 'training-2',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				training_type_id: 'cyber',
				completion_date: null,
				expiration_date: '2026-05-20',
				notes: null,
				certificate_url: null
			}
		]);

		await expect(loadTrainingReadinessLane(ctx, 'person-1', AS_OF)).resolves.toMatchObject({
			label: 'Training',
			value: '2 due',
			detail: 'HIPAA expired 4d ago. Cyber Awareness 6d left.',
			tone: 'bad'
		});
	});

	it('calculates Critical Tasks readiness for applicable ICT tasks', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-1',
				organization_id: ctx.auth.orgId,
				task_code: 'ICT-1',
				title: 'Airway',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: `${AS_OF}T00:00:00Z`
			},
			{
				id: 'task-2',
				organization_id: ctx.auth.orgId,
				task_code: 'ICT-2',
				title: 'IV validation',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 2,
				archived_at: null,
				created_at: `${AS_OF}T00:00:00Z`
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				ict_task_id: 'task-1',
				completed_at: '2026-05-01',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: null,
				created_at: `${AS_OF}T00:00:00Z`
			}
		]);

		await expect(loadCriticalTasksReadinessLane(ctx, 'person-1', AS_OF)).resolves.toMatchObject({
			label: 'Critical Tasks',
			value: '50%',
			detail: '1 of 2 applicable ICT tasks current. 1 task needs attention.',
			tone: 'bad'
		});
	});

	it('loads Duty Roster last duty date and exemption status', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		ctx.store.seed('duty_templates', [
			{
				id: 'template-1',
				organization_id: ctx.auth.orgId,
				name: 'Staff Duty',
				status: 'active',
				exempt_personnel_ids: ['person-1']
			}
		]);
		ctx.store.seed('duty_roster_history', [
			{
				id: 'history-1',
				organization_id: ctx.auth.orgId,
				assignment_type_id: 'assignment-1',
				name: 'Staff Duty',
				start_date: '2026-05-01',
				end_date: '2026-05-03',
				roster: [
					{ date: '2026-05-01', assigneeId: 'other-person' },
					{ date: '2026-05-03', assigneeId: 'person-1' }
				],
				config: {},
				created_at: `${AS_OF}T00:00:00Z`
			}
		]);

		await expect(loadDutyRosterReadinessLane(ctx, 'person-1', AS_OF)).resolves.toMatchObject({
			label: 'Duty Roster',
			value: 'Exempt',
			detail: 'Exempt from 1 active template. Last duty was 11 days ago.',
			tone: 'info'
		});
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

	it('enforces group scope before cross-feature lane reads', async () => {
		const ctx = createTestContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['other-group'] },
				requireGroupAccess: vi.fn(async () => {
					throw Object.assign(new Error('out of scope'), { status: 403 });
				})
			}
		});
		seedPerson(ctx, { group_id: 'group-1' });

		await expect(loadTrainingReadinessLane(ctx, 'person-1', AS_OF)).rejects.toMatchObject({ status: 403 });
		expect(ctx.auth.requireGroupAccess).toHaveBeenCalledWith('person-1');
	});
});
