import type { Personnel } from '$lib/types';
import type { StatusType, AvailabilityEntry, SpecialDay } from '$features/calendar/calendar.types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { AssignmentType, DailyAssignment } from '$features/calendar/stores/dailyAssignments.svelte';
import type { RosterHistoryItem } from '$features/duty-roster/stores/dutyRosterHistory.svelte';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	OnboardingStepNote,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';

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

export function transformPinnedGroups(data: DbRow[]): string[] {
	return data.map((p) => p.group_name as string);
}

export function transformRatingSchemeEntries(data: DbRow[]): RatingSchemeEntry[] {
	return data.map((r) => ({
		id: r.id as string,
		ratedPersonId: r.rated_person_id as string,
		evalType: r.eval_type as RatingSchemeEntry['evalType'],
		raterPersonId: (r.rater_person_id as string) ?? null,
		raterName: (r.rater_name as string) ?? null,
		seniorRaterPersonId: (r.senior_rater_person_id as string) ?? null,
		seniorRaterName: (r.senior_rater_name as string) ?? null,
		intermediateRaterPersonId: (r.intermediate_rater_person_id as string) ?? null,
		intermediateRaterName: (r.intermediate_rater_name as string) ?? null,
		reviewerPersonId: (r.reviewer_person_id as string) ?? null,
		reviewerName: (r.reviewer_name as string) ?? null,
		ratingPeriodStart: r.rating_period_start as string,
		ratingPeriodEnd: r.rating_period_end as string,
		status: r.status as RatingSchemeEntry['status'],
		notes: (r.notes as string) ?? null,
		reportType: (r.report_type as RatingSchemeEntry['reportType']) ?? null,
		workflowStatus: (r.workflow_status as RatingSchemeEntry['workflowStatus']) ?? null
	}));
}
