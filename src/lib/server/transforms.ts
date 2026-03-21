import type { Personnel, StatusType, AvailabilityEntry, AssignmentType } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';

import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	OnboardingStepNote,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';

/**
 * Simplified counseling record for the new Leaders Book model.
 * See PRD: leaders-book-redesign — counseling_records (simplify).
 */
export interface CounselingRecord {
	id: string;
	personnelId: string;
	dateConducted: string;
	subject: string;
	notes: string | null;
	filePath: string | null;
}

/**
 * Simplified development goal for the new Leaders Book model.
 * See PRD: leaders-book-redesign — development_goals (simplify).
 */
export interface DevelopmentGoal {
	id: string;
	personnelId: string;
	title: string;
	termType: 'short' | 'long';
	isCompleted: boolean;
	notes: string | null;
}

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

export function transformOnboardingTemplates(data: DbRow[]): OnboardingTemplate[] {
	return data.map((t) => ({
		id: t.id as string,
		orgId: t.organization_id as string,
		name: t.name as string,
		description: (t.description as string | null) ?? null,
		createdAt: t.created_at as string
	}));
}

export function transformOnboardingTemplateSteps(data: DbRow[]): OnboardingTemplateStep[] {
	return data.map((t) => ({
		id: t.id as string,
		templateId: t.template_id as string,
		name: t.name as string,
		description: (t.description as string | null) ?? null,
		stepType: t.step_type as OnboardingTemplateStep['stepType'],
		trainingTypeId: (t.training_type_id as string | null) ?? null,
		stages: (t.stages as string[] | null) ?? null,
		sortOrder: t.sort_order as number
	}));
}

export function transformPersonnelOnboardings(data: DbRow[]): PersonnelOnboarding[] {
	return data.map((o) => ({
		id: o.id as string,
		personnelId: o.personnel_id as string,
		startedAt: o.started_at as string,
		completedAt: (o.completed_at as string | null) ?? null,
		status: o.status as PersonnelOnboarding['status'],
		templateId: (o.template_id as string | null) ?? null,
		steps: ((o.onboarding_step_progress as DbRow[]) ?? [])
			.sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
			.map((s) => ({
				id: s.id as string,
				onboardingId: s.onboarding_id as string,
				stepName: s.step_name as string,
				stepType: s.step_type as OnboardingTemplateStep['stepType'],
				trainingTypeId: (s.training_type_id as string | null) ?? null,
				stages: (s.stages as string[] | null) ?? null,
				sortOrder: s.sort_order as number,
				completed: s.completed as boolean,
				currentStage: (s.current_stage as string | null) ?? null,
				notes: Array.isArray(s.notes) ? (s.notes as OnboardingStepNote[]) : [],
				templateStepId: (s.template_step_id as string | null) ?? null
			}))
	}));
}

export function transformCounselingRecords(data: DbRow[]): CounselingRecord[] {
	return data.map((r) => ({
		id: r.id as string,
		personnelId: r.personnel_id as string,
		dateConducted: r.date_conducted as string,
		subject: r.subject as string,
		notes: (r.notes as string) ?? null,
		filePath: (r.file_path as string) ?? null
	}));
}

export function transformDevelopmentGoals(data: DbRow[]): DevelopmentGoal[] {
	return data.map((r) => ({
		id: r.id as string,
		personnelId: r.personnel_id as string,
		title: r.title as string,
		termType: r.term_type as DevelopmentGoal['termType'],
		isCompleted: (r.is_completed as boolean) ?? false,
		notes: (r.notes as string) ?? null
	}));
}
