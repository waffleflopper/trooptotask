import type { StatusType, AvailabilityEntry, AssignmentType } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';

// CounselingRecord and DevelopmentGoal types are now defined in their entity files.
// Re-exported here for backward compatibility.
import { CounselingRecordEntity } from '$lib/server/entities/counselingRecord';
import { DevelopmentGoalEntity } from '$lib/server/entities/developmentGoal';
export type { CounselingRecord } from '$lib/server/entities/counselingRecord';
export type { DevelopmentGoal } from '$lib/server/entities/developmentGoal';

type DbRow = Record<string, unknown>;

export function transformGroups(data: DbRow[]): Group[] {
	return data.map((g) => ({
		id: g.id as string,
		name: g.name as string,
		sortOrder: g.sort_order as number
	}));
}

export function transformStatusTypes(data: DbRow[]): StatusType[] {
	return data.map((s) => ({
		id: s.id as string,
		name: s.name as string,
		color: s.color as string,
		textColor: s.text_color as string
	}));
}

export function transformTrainingTypes(data: DbRow[]): TrainingType[] {
	return data.map((t) => ({
		id: t.id as string,
		name: t.name as string,
		description: t.description as string,
		expirationMonths: t.expiration_months as number,
		warningDaysYellow: t.warning_days_yellow as number,
		warningDaysOrange: t.warning_days_orange as number,
		requiredForRoles: (t.required_for_roles as string[]) ?? [],
		color: t.color as string,
		sortOrder: t.sort_order as number,
		expirationDateOnly: (t.expiration_date_only as boolean) ?? false,
		canBeExempted: (t.can_be_exempted as boolean) ?? false,
		exemptPersonnelIds: (t.exempt_personnel_ids as string[]) ?? []
	}));
}

export function transformAvailabilityEntries(data: DbRow[]): AvailabilityEntry[] {
	return data.map((a) => ({
		id: a.id as string,
		personnelId: a.personnel_id as string,
		statusTypeId: a.status_type_id as string,
		startDate: a.start_date as string,
		endDate: a.end_date as string,
		note: (a.note as string) ?? null
	}));
}

export function transformAssignmentTypes(data: DbRow[]): AssignmentType[] {
	return data.map((t) => ({
		id: t.id as string,
		name: t.name as string,
		shortName: t.short_name as string,
		assignTo: t.assign_to as AssignmentType['assignTo'],
		color: t.color as string,
		exemptPersonnelIds: (t.exempt_personnel_ids as string[]) ?? []
	}));
}

/** @deprecated Use CounselingRecordEntity.fromDbArray instead */
export const transformCounselingRecords = CounselingRecordEntity.fromDbArray;

/** @deprecated Use DevelopmentGoalEntity.fromDbArray instead */
export const transformDevelopmentGoals = DevelopmentGoalEntity.fromDbArray;
