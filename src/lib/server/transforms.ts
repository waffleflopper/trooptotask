import type { Personnel, StatusType, TrainingType, PersonnelTraining, AvailabilityEntry, SpecialDay } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { AssignmentType, DailyAssignment } from '$lib/stores/dailyAssignments.svelte';
import type { RosterHistoryItem } from '$lib/stores/dutyRosterHistory.svelte';

export function transformPersonnel(data: any[]): Personnel[] {
	return data.map((p: any) => ({
		id: p.id,
		rank: p.rank,
		lastName: p.last_name,
		firstName: p.first_name,
		mos: p.mos ?? '',
		clinicRole: p.clinic_role,
		groupId: p.group_id,
		groupName: p.groups?.name ?? '',
		archivedAt: p.archived_at ?? null
	}));
}

export function transformGroups(data: any[]): Group[] {
	return data.map((g: any) => ({
		id: g.id,
		name: g.name,
		sortOrder: g.sort_order
	}));
}

export function transformStatusTypes(data: any[]): StatusType[] {
	return data.map((s: any) => ({
		id: s.id,
		name: s.name,
		color: s.color,
		textColor: s.text_color
	}));
}

export function transformTrainingTypes(data: any[]): TrainingType[] {
	return data.map((t: any) => ({
		id: t.id,
		name: t.name,
		description: t.description,
		expirationMonths: t.expiration_months,
		warningDaysYellow: t.warning_days_yellow,
		warningDaysOrange: t.warning_days_orange,
		requiredForRoles: t.required_for_roles ?? [],
		color: t.color,
		sortOrder: t.sort_order,
		expirationDateOnly: t.expiration_date_only ?? false,
		canBeExempted: t.can_be_exempted ?? false,
		exemptPersonnelIds: t.exempt_personnel_ids ?? []
	}));
}

export function transformPersonnelTrainings(data: any[]): PersonnelTraining[] {
	return data.map((t: any) => ({
		id: t.id,
		personnelId: t.personnel_id,
		trainingTypeId: t.training_type_id,
		completionDate: t.completion_date,
		expirationDate: t.expiration_date,
		notes: t.notes,
		certificateUrl: t.certificate_url
	}));
}

export function transformAvailabilityEntries(data: any[]): AvailabilityEntry[] {
	return data.map((a: any) => ({
		id: a.id,
		personnelId: a.personnel_id,
		statusTypeId: a.status_type_id,
		startDate: a.start_date,
		endDate: a.end_date,
		note: a.note ?? null
	}));
}

export function transformAssignmentTypes(data: any[]): AssignmentType[] {
	return data.map((t: any) => ({
		id: t.id,
		name: t.name,
		shortName: t.short_name,
		assignTo: t.assign_to,
		color: t.color,
		exemptPersonnelIds: t.exempt_personnel_ids ?? []
	}));
}

export function transformDailyAssignments(data: any[]): DailyAssignment[] {
	return data.map((a: any) => ({
		id: a.id,
		date: a.date,
		assignmentTypeId: a.assignment_type_id,
		assigneeId: a.assignee_id
	}));
}

export function transformSpecialDays(data: any[]): SpecialDay[] {
	return data.map((d: any) => ({
		id: d.id,
		date: d.date,
		name: d.name,
		type: d.type
	}));
}

export function transformRosterHistory(data: any[]): RosterHistoryItem[] {
	return data.map((r: any) => ({
		id: r.id,
		assignmentTypeId: r.assignment_type_id,
		name: r.name,
		startDate: r.start_date,
		endDate: r.end_date,
		roster: r.roster,
		config: r.config ?? {},
		createdAt: r.created_at
	}));
}
