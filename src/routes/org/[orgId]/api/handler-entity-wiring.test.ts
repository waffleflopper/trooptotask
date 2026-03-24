import { describe, it, expect } from 'vitest';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { RosterHistoryEntity } from '$lib/server/entities/rosterHistory';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createCrudUseCases, type CrudConfig } from '$lib/server/core/useCases/crud';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { specialDayCrudConfig } from '$lib/server/core/useCases/specialDayCrud';

describe('Handler → Entity schema compatibility', () => {
	describe('SpecialDay handler inputs', () => {
		it('toDbInsert produces same row as manual mapping in POST handler', () => {
			const body = { date: '2026-12-25', name: 'Christmas', type: 'federal-holiday' as const };
			const result = SpecialDayEntity.toDbInsert(body, 'org-1');
			expect(result).toEqual({
				organization_id: 'org-1',
				date: '2026-12-25',
				name: 'Christmas',
				type: 'federal-holiday'
			});
		});

		it('fromDb produces same response as manual mapping in POST handler', () => {
			const dbRow = { id: 'sd-1', date: '2026-12-25', name: 'Christmas', type: 'federal-holiday' };
			const result = SpecialDayEntity.fromDb(dbRow);
			expect(result).toMatchObject({
				id: 'sd-1',
				date: '2026-12-25',
				name: 'Christmas',
				type: 'federal-holiday'
			});
		});

		it('createSchema accepts valid special day input', () => {
			const result = SpecialDayEntity.createSchema.safeParse({
				date: '2026-12-25',
				name: 'Christmas',
				type: 'federal-holiday'
			});
			expect(result.success).toBe(true);
		});

		it('createSchema accepts org-closure type', () => {
			const result = SpecialDayEntity.createSchema.safeParse({
				date: '2026-01-01',
				name: 'Company Day',
				type: 'org-closure'
			});
			expect(result.success).toBe(true);
		});
	});

	describe('DailyAssignment handler inputs', () => {
		it('toDbInsert produces same row as manual mapping in POST handler', () => {
			const body = { date: '2026-03-21', assignmentTypeId: 'at-1', assigneeId: 'p-1' };
			const result = DailyAssignmentEntity.toDbInsert(body, 'org-1');
			expect(result).toEqual({
				organization_id: 'org-1',
				date: '2026-03-21',
				assignment_type_id: 'at-1',
				assignee_id: 'p-1'
			});
		});

		it('fromDb produces same response as manual mapping in POST handler', () => {
			const dbRow = { id: 'da-1', date: '2026-03-21', assignment_type_id: 'at-1', assignee_id: 'p-1' };
			const result = DailyAssignmentEntity.fromDb(dbRow);
			expect(result).toMatchObject({
				id: 'da-1',
				date: '2026-03-21',
				assignmentTypeId: 'at-1',
				assigneeId: 'p-1'
			});
		});
	});

	describe('RosterHistory handler inputs', () => {
		it('toDbInsert produces same row as manual mapping in POST handler (minus created_by_user_id)', () => {
			const body = {
				assignmentTypeId: 'at-1',
				name: 'Week 1',
				startDate: '2026-03-01',
				endDate: '2026-03-07',
				roster: [{ id: 'p-1', name: 'Smith' }],
				config: { setting: true }
			};
			const result = RosterHistoryEntity.toDbInsert(body, 'org-1');
			expect(result).toEqual({
				organization_id: 'org-1',
				assignment_type_id: 'at-1',
				name: 'Week 1',
				start_date: '2026-03-01',
				end_date: '2026-03-07',
				roster: [{ id: 'p-1', name: 'Smith' }],
				config: { setting: true }
			});
		});

		it('fromDb produces same response as manual mapping in GET/POST handler', () => {
			const dbRow = {
				id: 'rh-1',
				assignment_type_id: 'at-1',
				name: 'Week 1',
				start_date: '2026-03-01',
				end_date: '2026-03-07',
				roster: [{ id: 'p-1', name: 'Smith' }],
				config: { setting: true },
				created_at: '2026-03-01T00:00:00Z'
			};
			const result = RosterHistoryEntity.fromDb(dbRow);
			expect(result).toMatchObject({
				id: 'rh-1',
				assignmentTypeId: 'at-1',
				name: 'Week 1',
				startDate: '2026-03-01',
				endDate: '2026-03-07',
				roster: [{ id: 'p-1', name: 'Smith' }],
				config: { setting: true },
				createdAt: '2026-03-01T00:00:00Z'
			});
		});
	});

	describe('Personnel handler inputs', () => {
		it('toDbInsert produces same row as manual mapping in POST handler', () => {
			const body = {
				rank: 'SGT',
				lastName: 'Smith',
				firstName: 'John',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: 'g-1'
			};
			const result = PersonnelEntity.toDbInsert(body, 'org-1');
			expect(result).toEqual({
				organization_id: 'org-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'g-1'
			});
		});

		it('toDbInsert defaults mos to empty string when omitted', () => {
			const body = { rank: 'PVT', lastName: 'Doe', firstName: 'Jane', clinicRole: '' };
			const result = PersonnelEntity.toDbInsert(body, 'org-1');
			expect(result.mos).toBe('');
		});

		it('toDbInsert defaults groupId to null when omitted', () => {
			const body = { rank: 'PVT', lastName: 'Doe', firstName: 'Jane', clinicRole: '' };
			const result = PersonnelEntity.toDbInsert(body, 'org-1');
			expect(result.group_id).toBeNull();
		});

		it('fromDb produces same response as manual mapping in POST handler', () => {
			const dbRow = {
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'g-1',
				groups: { name: 'Alpha' },
				archived_at: null
			};
			const result = PersonnelEntity.fromDb(dbRow);
			expect(result).toEqual({
				id: 'p-1',
				rank: 'SGT',
				lastName: 'Smith',
				firstName: 'John',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: 'g-1',
				groupName: 'Alpha',
				archivedAt: null
			});
		});

		it('toDbUpdate maps personnel fields correctly', () => {
			const body = { id: 'p-1', rank: 'SSG', lastName: 'Jones' };
			const result = PersonnelEntity.toDbUpdate(body);
			expect(result).toEqual({ rank: 'SSG', last_name: 'Jones' });
		});
	});

	describe('PersonnelTraining handler inputs', () => {
		it('fromDb produces same response as manual mapping in POST handler', () => {
			const dbRow = {
				id: 'pt-1',
				personnel_id: 'p-1',
				training_type_id: 'tt-1',
				completion_date: '2026-03-01',
				expiration_date: '2027-03-01',
				notes: 'good',
				certificate_url: null
			};
			const result = PersonnelTrainingEntity.fromDb(dbRow);
			expect(result).toMatchObject({
				id: 'pt-1',
				personnelId: 'p-1',
				trainingTypeId: 'tt-1',
				completionDate: '2026-03-01',
				expirationDate: '2027-03-01',
				notes: 'good',
				certificateUrl: null
			});
		});
	});

	describe('RatingSchemeEntry handler inputs', () => {
		it('toDbInsert produces same row as manual mapping in POST handler', () => {
			const body = {
				ratedPersonId: 'p-1',
				evalType: 'OER' as const,
				raterPersonId: 'p-2',
				raterName: 'Smith',
				seniorRaterPersonId: null,
				seniorRaterName: null,
				intermediateRaterPersonId: null,
				intermediateRaterName: null,
				reviewerPersonId: null,
				reviewerName: null,
				ratingPeriodStart: '2026-01-01',
				ratingPeriodEnd: '2026-12-31',
				status: 'active',
				notes: null,
				reportType: 'AN',
				workflowStatus: 'drafting'
			};
			const result = RatingSchemeEntryEntity.toDbInsert(body, 'org-1');
			expect(result).toEqual({
				organization_id: 'org-1',
				rated_person_id: 'p-1',
				eval_type: 'OER',
				rater_person_id: 'p-2',
				rater_name: 'Smith',
				senior_rater_person_id: null,
				senior_rater_name: null,
				intermediate_rater_person_id: null,
				intermediate_rater_name: null,
				reviewer_person_id: null,
				reviewer_name: null,
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-12-31',
				status: 'active',
				notes: null,
				report_type: 'AN',
				workflow_status: 'drafting'
			});
		});

		it('fromDb produces same response as toClient in handler', () => {
			const dbRow = {
				id: 'rs-1',
				rated_person_id: 'p-1',
				eval_type: 'OER',
				rater_person_id: 'p-2',
				rater_name: 'Smith',
				senior_rater_person_id: null,
				senior_rater_name: null,
				intermediate_rater_person_id: null,
				intermediate_rater_name: null,
				reviewer_person_id: null,
				reviewer_name: null,
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-12-31',
				status: 'active',
				notes: null,
				report_type: 'AN',
				workflow_status: 'drafting'
			};
			const result = RatingSchemeEntryEntity.fromDb(dbRow);
			expect(result).toMatchObject({
				id: 'rs-1',
				ratedPersonId: 'p-1',
				evalType: 'OER',
				raterPersonId: 'p-2',
				raterName: 'Smith',
				seniorRaterPersonId: null,
				seniorRaterName: null,
				intermediateRaterPersonId: null,
				intermediateRaterName: null,
				reviewerPersonId: null,
				reviewerName: null,
				ratingPeriodStart: '2026-01-01',
				ratingPeriodEnd: '2026-12-31',
				status: 'active',
				notes: null,
				reportType: 'AN',
				workflowStatus: 'drafting'
			});
		});

		it('toDbUpdate maps rating scheme fields correctly', () => {
			const body = { id: 'rs-1', raterPersonId: 'p-3', raterName: 'Jones' };
			const result = RatingSchemeEntryEntity.toDbUpdate(body);
			expect(result).toEqual({
				rater_person_id: 'p-3',
				rater_name: 'Jones'
			});
		});

		it('createSchema accepts valid rating scheme entry', () => {
			const result = RatingSchemeEntryEntity.createSchema.safeParse({
				ratedPersonId: 'p-1',
				evalType: 'OER',
				ratingPeriodStart: '2026-01-01',
				ratingPeriodEnd: '2026-12-31',
				status: 'active'
			});
			expect(result.success).toBe(true);
		});
	});

	describe('OnboardingTemplateStep handler inputs', () => {
		it('toDbInsert produces same row as manual mapping in POST handler', () => {
			const body = {
				templateId: 't-1',
				name: 'Step 1',
				description: null,
				stepType: 'checkbox' as const,
				trainingTypeId: null,
				stages: null,
				sortOrder: 0
			};
			const result = OnboardingTemplateStepEntity.toDbInsert(body, 'org-1');
			expect(result).toEqual({
				organization_id: 'org-1',
				template_id: 't-1',
				name: 'Step 1',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0
			});
		});

		it('fromDb produces same response as transformRow in handler', () => {
			const dbRow = {
				id: 'ots-1',
				template_id: 't-1',
				name: 'Step 1',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0
			};
			const result = OnboardingTemplateStepEntity.fromDb(dbRow);
			expect(result).toMatchObject({
				id: 'ots-1',
				templateId: 't-1',
				name: 'Step 1',
				description: null,
				stepType: 'checkbox',
				trainingTypeId: null,
				stages: null,
				sortOrder: 0
			});
		});

		it('toDbUpdate maps onboarding template step fields correctly', () => {
			const body = { id: 'ots-1', name: 'Updated Step', sortOrder: 5 };
			const result = OnboardingTemplateStepEntity.toDbUpdate(body);
			expect(result).toEqual({
				name: 'Updated Step',
				sort_order: 5
			});
		});
	});
});

describe('handle() + entity pipeline integration', () => {
	it('crudHandlers create inserts via entity schema through handle pipeline', async () => {
		const useCases = createCrudUseCases(specialDayCrudConfig);
		const ctx = createTestContext();

		const config = {
			permission: specialDayCrudConfig.permission as 'calendar',
			mutation: true as const,
			fn: (c: UseCaseContext, input: Record<string, unknown>) => useCases.create(c, input)
		};

		const result = (await handleUseCaseRequest(config, ctx, {
			date: '2026-12-25',
			name: 'Christmas',
			type: 'federal-holiday'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ date: '2026-12-25', name: 'Christmas', type: 'federal-holiday' });

		const stored = await ctx.store.findMany('special_days', 'test-org');
		expect(stored).toHaveLength(1);
	});

	it('crudHandlers update modifies entity fields through handle pipeline', async () => {
		const useCases = createCrudUseCases(specialDayCrudConfig);
		const ctx = createTestContext();

		ctx.store.seed('special_days', [
			{ id: 'sd-1', organization_id: 'test-org', date: '2026-12-25', name: 'Christmas', type: 'federal-holiday' }
		]);

		const config = {
			permission: specialDayCrudConfig.permission as 'calendar',
			mutation: true as const,
			fn: (c: UseCaseContext, input: Record<string, unknown>) => useCases.update(c, input)
		};

		const result = (await handleUseCaseRequest(config, ctx, {
			id: 'sd-1',
			name: 'Christmas Day'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ id: 'sd-1', name: 'Christmas Day' });
	});

	it('handle pipeline enforces permission before entity operations', async () => {
		const useCases = createCrudUseCases(specialDayCrudConfig);
		const ctx = createTestContext({
			auth: {
				requireEdit() {
					throw Object.assign(new Error('Forbidden'), { status: 403 });
				}
			}
		});

		const config = {
			permission: 'calendar' as const,
			mutation: true as const,
			fn: (c: UseCaseContext, input: Record<string, unknown>) => useCases.create(c, input)
		};

		await expect(
			handleUseCaseRequest(config, ctx, { date: '2026-12-25', name: 'X', type: 'federal-holiday' })
		).rejects.toMatchObject({ status: 403 });

		const stored = await ctx.store.findMany('special_days', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('handle pipeline blocks mutations when read-only before entity operations', async () => {
		const useCases = createCrudUseCases(specialDayCrudConfig);
		const ctx = createTestContext({ readOnly: true });

		const config = {
			permission: 'calendar' as const,
			mutation: true as const,
			fn: (c: UseCaseContext, input: Record<string, unknown>) => useCases.create(c, input)
		};

		await expect(
			handleUseCaseRequest(config, ctx, { date: '2026-12-25', name: 'X', type: 'federal-holiday' })
		).rejects.toMatchObject({ status: 403 });
	});
});
