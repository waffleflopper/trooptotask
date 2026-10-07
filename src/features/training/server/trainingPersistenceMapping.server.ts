import { z } from 'zod';
import type {
	SavedTrainingType,
	SavedTrainingView,
	SavedTrainingCompletion,
	TrainingTypeCreate,
	TrainingTypePatch,
	TrainingViewCreate,
	TrainingViewPatch,
	TrainingCompletionCreate,
	TrainingCompletionPatch,
	TrainingCompletedUpsert
} from '../contracts';

export type TrainingTypeRow = {
	id?: string;
	name?: string;
	description?: string | null;
	expiration_months?: number | null;
	warning_days_yellow?: number;
	warning_days_orange?: number;
	applies_to_roles?: string[] | null;
	applies_to_mos?: string[] | null;
	applies_to_ranks?: string[] | null;
	excluded_roles?: string[] | null;
	excluded_mos?: string[] | null;
	excluded_ranks?: string[] | null;
	color?: string;
	sort_order?: number;
	expiration_date_only?: boolean | null;
	can_be_exempted?: boolean | null;
	exempt_personnel_ids?: string[] | null;
	is_optional?: boolean | null;
	organization_id?: string;
	created_at?: string;
};
export const TRAINING_TYPE_FIELDS =
	'id, name, description, expiration_months, warning_days_yellow, warning_days_orange, applies_to_roles, applies_to_mos, applies_to_ranks, excluded_roles, excluded_mos, excluded_ranks, color, sort_order, expiration_date_only, can_be_exempted, exempt_personnel_ids, is_optional, organization_id, created_at';

export function toTrainingType(row: TrainingTypeRow): SavedTrainingType {
	return {
		...('id' in row ? { id: row.id } : {}),
		...('name' in row ? { name: row.name } : {}),
		...('description' in row ? { description: row.description } : {}),
		...('expiration_months' in row ? { expirationMonths: row.expiration_months } : {}),
		...('warning_days_yellow' in row ? { warningDaysYellow: row.warning_days_yellow } : {}),
		...('warning_days_orange' in row ? { warningDaysOrange: row.warning_days_orange } : {}),
		...('applies_to_roles' in row ? { appliesToRoles: row.applies_to_roles === null ? [] : row.applies_to_roles } : {}),
		...('applies_to_mos' in row ? { appliesToMos: row.applies_to_mos === null ? [] : row.applies_to_mos } : {}),
		...('applies_to_ranks' in row ? { appliesToRanks: row.applies_to_ranks === null ? [] : row.applies_to_ranks } : {}),
		...('excluded_roles' in row ? { excludedRoles: row.excluded_roles === null ? [] : row.excluded_roles } : {}),
		...('excluded_mos' in row ? { excludedMos: row.excluded_mos === null ? [] : row.excluded_mos } : {}),
		...('excluded_ranks' in row ? { excludedRanks: row.excluded_ranks === null ? [] : row.excluded_ranks } : {}),
		...('color' in row ? { color: row.color } : {}),
		...('sort_order' in row ? { sortOrder: row.sort_order } : {}),
		...('expiration_date_only' in row
			? { expirationDateOnly: row.expiration_date_only === null ? false : row.expiration_date_only }
			: {}),
		...('can_be_exempted' in row ? { canBeExempted: row.can_be_exempted === null ? false : row.can_be_exempted } : {}),
		...('exempt_personnel_ids' in row
			? { exemptPersonnelIds: row.exempt_personnel_ids === null ? [] : row.exempt_personnel_ids }
			: {}),
		...('is_optional' in row ? { isOptional: row.is_optional === null ? false : row.is_optional } : {}),
		...('organization_id' in row ? { organization_id: row.organization_id } : {}),
		...('created_at' in row ? { created_at: row.created_at } : {})
	} as SavedTrainingType;
}

export type TrainingViewRow = {
	id?: string;
	name?: string;
	column_ids?: string[] | null;
	created_by?: string;
	created_at?: string;
	updated_at?: string;
	organization_id?: string;
};
export const TRAINING_VIEW_FIELDS = 'id, name, column_ids, created_by, created_at, updated_at, organization_id';

export function toTrainingView(row: TrainingViewRow): SavedTrainingView {
	return {
		...('id' in row ? { id: row.id } : {}),
		...('name' in row ? { name: row.name } : {}),
		...('column_ids' in row ? { columnIds: row.column_ids === null ? [] : row.column_ids } : {}),
		...('created_by' in row ? { createdBy: row.created_by } : {}),
		...('created_at' in row ? { createdAt: row.created_at } : {}),
		...('updated_at' in row ? { updatedAt: row.updated_at } : {}),
		...('organization_id' in row ? { organization_id: row.organization_id } : {})
	} as SavedTrainingView;
}

export type TrainingCompletionRow = {
	id?: string;
	personnel_id?: string;
	training_type_id?: string;
	completion_date?: string | null;
	expiration_date?: string | null;
	notes?: string | null;
	certificate_url?: string | null;
	organization_id?: string;
	created_at?: string;
	updated_at?: string;
};
export const TRAINING_COMPLETION_FIELDS =
	'id, personnel_id, training_type_id, completion_date, expiration_date, notes, certificate_url, organization_id, created_at, updated_at';

export function toTrainingCompletion(row: TrainingCompletionRow): SavedTrainingCompletion {
	return {
		...('id' in row ? { id: row.id } : {}),
		...('personnel_id' in row ? { personnelId: row.personnel_id } : {}),
		...('training_type_id' in row ? { trainingTypeId: row.training_type_id } : {}),
		...('completion_date' in row ? { completionDate: row.completion_date } : {}),
		...('expiration_date' in row ? { expirationDate: row.expiration_date } : {}),
		...('notes' in row ? { notes: row.notes } : {}),
		...('certificate_url' in row ? { certificateUrl: row.certificate_url } : {}),
		...('organization_id' in row ? { organization_id: row.organization_id } : {}),
		...('created_at' in row ? { created_at: row.created_at } : {}),
		...('updated_at' in row ? { updated_at: row.updated_at } : {})
	} as SavedTrainingCompletion;
}

export function trainingTypePatchRow(input: TrainingTypePatch) {
	return {
		name: input.name,
		description: input.description,
		expiration_months: input.expirationMonths,
		warning_days_yellow: input.warningDaysYellow,
		warning_days_orange: input.warningDaysOrange,
		applies_to_roles: input.appliesToRoles,
		applies_to_mos: input.appliesToMos,
		applies_to_ranks: input.appliesToRanks,
		excluded_roles: input.excludedRoles,
		excluded_mos: input.excludedMos,
		excluded_ranks: input.excludedRanks,
		color: input.color,
		sort_order: input.sortOrder,
		expiration_date_only: input.expirationDateOnly,
		can_be_exempted: input.canBeExempted,
		exempt_personnel_ids: input.exemptPersonnelIds,
		is_optional: input.isOptional
	};
}

export function trainingViewPatchRow(input: TrainingViewPatch) {
	return {
		name: input.name,
		column_ids: input.columnIds
	};
}

export function trainingCompletionPatchRow(input: TrainingCompletionPatch) {
	return {
		completion_date: input.completionDate,
		expiration_date: input.expirationDate,
		notes: input.notes,
		certificate_url: input.certificateUrl,
		updated_at: input.updatedAt
	};
}

export function trainingTypeCreateRow(input: TrainingTypeCreate, orgId: string) {
	return {
		organization_id: orgId,
		name: input.name,
		description: input.description !== undefined ? input.description : null,
		expiration_months: input.expirationMonths !== undefined ? input.expirationMonths : null,
		warning_days_yellow: input.warningDaysYellow ?? 60,
		warning_days_orange: input.warningDaysOrange ?? 30,
		applies_to_roles: input.appliesToRoles ?? [],
		applies_to_mos: input.appliesToMos ?? [],
		applies_to_ranks: input.appliesToRanks ?? [],
		excluded_roles: input.excludedRoles ?? [],
		excluded_mos: input.excludedMos ?? [],
		excluded_ranks: input.excludedRanks ?? [],
		exempt_personnel_ids: input.exemptPersonnelIds ?? [],
		color: input.color ?? '#6b7280',
		sort_order: input.sortOrder ?? 0,
		expiration_date_only: input.expirationDateOnly ?? false,
		can_be_exempted: input.canBeExempted ?? false,
		is_optional: input.isOptional ?? false
	};
}

export function trainingViewCreateRow(input: TrainingViewCreate, orgId: string) {
	return { organization_id: orgId, name: input.name, column_ids: input.columnIds ?? [] };
}

export function trainingCompletionCreateRow(input: TrainingCompletionCreate, orgId: string) {
	return {
		organization_id: orgId,
		personnel_id: input.personnelId,
		training_type_id: input.trainingTypeId,
		completion_date: input.completionDate ?? null,
		expiration_date: input.expirationDate ?? null,
		notes: input.notes ?? null,
		certificate_url: input.certificateUrl ?? null
	};
}

export function trainingCompletedRow(input: TrainingCompletedUpsert, orgId: string) {
	return {
		organization_id: orgId,
		personnel_id: input.personnelId,
		training_type_id: input.trainingTypeId,
		completion_date: input.completionDate,
		expiration_date: input.expirationDate,
		notes: input.notes,
		updated_at: input.updatedAt
	};
}

export const trainingTypeCreateInput = z.object({
	name: z.string().min(1).max(100),
	description: z.string().nullable().optional(),
	expirationMonths: z.number().int().nullable().optional(),
	warningDaysYellow: z.number().int().optional(),
	warningDaysOrange: z.number().int().optional(),
	appliesToRoles: z.array(z.string()).optional(),
	appliesToMos: z.array(z.string()).optional(),
	appliesToRanks: z.array(z.string()).optional(),
	excludedRoles: z.array(z.string()).optional(),
	excludedMos: z.array(z.string()).optional(),
	excludedRanks: z.array(z.string()).optional(),
	exemptPersonnelIds: z.array(z.string()).optional(),
	color: z.string().optional(),
	sortOrder: z.number().int().optional(),
	expirationDateOnly: z.boolean().optional(),
	canBeExempted: z.boolean().optional(),
	isOptional: z.boolean().optional()
});
export const trainingTypeUpdateInput = trainingTypeCreateInput.partial().extend({ id: z.string() });
export const trainingViewCreateInput = z.object({
	name: z.string().min(1).max(100),
	columnIds: z.array(z.string()).optional()
});
export const trainingViewUpdateInput = trainingViewCreateInput.partial().extend({ id: z.string() });
export const trainingCompletionCreateInput = z.object({
	personnelId: z.string(),
	trainingTypeId: z.string(),
	completionDate: z.string().nullable().optional(),
	expirationDate: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	certificateUrl: z.string().nullable().optional()
});
