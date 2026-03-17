import type { Personnel } from '$lib/types';
import type { StatusType, AvailabilityEntry, SpecialDay } from '$features/calendar/calendar.types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { AssignmentType, DailyAssignment } from '$features/calendar/stores/dailyAssignments.svelte';
import type { RosterHistoryItem } from '$features/duty-roster/stores/dutyRosterHistory.svelte';

type DbRow = Record<string, unknown>;

export function transformPersonnel(data: DbRow[]): Personnel[] {
	return data.map((p) => ({
		id: p.id as string,
		rank: p.rank as string,
		lastName: p.last_name as string,
		firstName: p.first_name as string,
		mos: (p.mos as string) ?? '',
		clinicRole: p.clinic_role as string,
		groupId: p.group_id as string,
		groupName: ((p.groups as DbRow)?.name as string) ?? '',
		archivedAt: (p.archived_at as string) ?? null
	}));
}

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

export function transformPersonnelTrainings(data: DbRow[]): PersonnelTraining[] {
	return data.map((t) => ({
		id: t.id as string,
		personnelId: t.personnel_id as string,
		trainingTypeId: t.training_type_id as string,
		completionDate: t.completion_date as string,
		expirationDate: t.expiration_date as string,
		notes: t.notes as string,
		certificateUrl: t.certificate_url as string
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

export function transformDailyAssignments(data: DbRow[]): DailyAssignment[] {
	return data.map((a) => ({
		id: a.id as string,
		date: a.date as string,
		assignmentTypeId: a.assignment_type_id as string,
		assigneeId: a.assignee_id as string
	}));
}

export function transformSpecialDays(data: DbRow[]): SpecialDay[] {
	return data.map((d) => ({
		id: d.id as string,
		date: d.date as string,
		name: d.name as string,
		type: d.type as SpecialDay['type']
	}));
}

export function transformRosterHistory(data: DbRow[]): RosterHistoryItem[] {
	return data.map((r) => ({
		id: r.id as string,
		assignmentTypeId: r.assignment_type_id as string,
		name: r.name as string,
		startDate: r.start_date as string,
		endDate: r.end_date as string,
		roster: r.roster as RosterHistoryItem['roster'],
		config: (r.config as Record<string, unknown>) ?? {},
		createdAt: r.created_at as string
	}));
}
