import { describe, it, expect } from 'vitest';
import * as entities from './index';

describe('entities barrel export', () => {
	it('exports all entity definitions', () => {
		expect(entities.GroupEntity).toBeDefined();
		expect(entities.StatusTypeEntity).toBeDefined();
		expect(entities.AssignmentTypeEntity).toBeDefined();
		expect(entities.TrainingTypeEntity).toBeDefined();
		expect(entities.AvailabilityEntryEntity).toBeDefined();
		expect(entities.SpecialDayEntity).toBeDefined();
		expect(entities.DailyAssignmentEntity).toBeDefined();
		expect(entities.PersonnelTrainingEntity).toBeDefined();
		expect(entities.RosterHistoryEntity).toBeDefined();
		expect(entities.RatingSchemeEntryEntity).toBeDefined();
		expect(entities.PinnedGroupsEntity).toBeDefined();
		expect(entities.PersonnelEntity).toBeDefined();
		expect(entities.OnboardingTemplateEntity).toBeDefined();
		expect(entities.OnboardingTemplateStepEntity).toBeDefined();
		expect(entities.PersonnelOnboardingEntity).toBeDefined();
		expect(entities.CounselingRecordEntity).toBeDefined();
		expect(entities.DevelopmentGoalEntity).toBeDefined();
	});

	it('each entity has fromDb, fromDbArray, and repo', () => {
		const allEntities = [
			entities.GroupEntity,
			entities.StatusTypeEntity,
			entities.AssignmentTypeEntity,
			entities.TrainingTypeEntity,
			entities.AvailabilityEntryEntity,
			entities.SpecialDayEntity,
			entities.DailyAssignmentEntity,
			entities.PersonnelTrainingEntity,
			entities.RosterHistoryEntity,
			entities.RatingSchemeEntryEntity,
			entities.PinnedGroupsEntity,
			entities.PersonnelEntity,
			entities.OnboardingTemplateEntity,
			entities.OnboardingTemplateStepEntity,
			entities.PersonnelOnboardingEntity,
			entities.CounselingRecordEntity,
			entities.DevelopmentGoalEntity
		];

		for (const entity of allEntities) {
			expect(entity.fromDb).toBeTypeOf('function');
			expect(entity.fromDbArray).toBeTypeOf('function');
			expect(entity.table).toBeTypeOf('string');
		}
	});
});
