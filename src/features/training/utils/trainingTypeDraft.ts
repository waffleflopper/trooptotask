import type { Personnel } from '$features/personnel/contracts';
import { DEFAULT_TRAINING_TYPE_COLOR } from '../contracts';
import type { TrainingType } from '../training.types';
import { isTrainingApplicable } from './applicability';

export type RenewalDraft =
	| { kind: 'months'; months: number; firstWarningDays: number; finalWarningDays: number }
	| { kind: 'cardDate'; firstWarningDays: number; finalWarningDays: number }
	| { kind: 'never' };

export type ApplicabilityChip = { kind: 'role' | 'mos' | 'rank'; value: string };

export type ApplicabilityDraft = {
	mode: 'everyone' | 'onlySome' | 'optional';
	only: ApplicabilityChip[];
	except: ApplicabilityChip[];
};

export type TrainingTypeDraft = Pick<
	TrainingType,
	'name' | 'description' | 'color' | 'canBeExempted' | 'sortOrder' | 'exemptPersonnelIds'
> & {
	renewal: RenewalDraft;
	applicability: ApplicabilityDraft;
	// Hidden renewal fields must survive editing a saved type with another renewal kind.
	preservedRenewalFields: Pick<TrainingType, 'expirationMonths' | 'warningDaysYellow' | 'warningDaysOrange'>;
};

export function newTrainingTypeDraft(): TrainingTypeDraft {
	return {
		name: '',
		description: null,
		color: DEFAULT_TRAINING_TYPE_COLOR,
		canBeExempted: false,
		sortOrder: 0,
		exemptPersonnelIds: [],
		renewal: { kind: 'months', months: 12, firstWarningDays: 60, finalWarningDays: 30 },
		applicability: { mode: 'everyone', only: [], except: [] },
		preservedRenewalFields: { expirationMonths: null, warningDaysYellow: 60, warningDaysOrange: 30 }
	};
}

function chipsFrom(roles: string[], mos: string[], ranks: string[]): ApplicabilityChip[] {
	return [
		...roles.map((value): ApplicabilityChip => ({ kind: 'role', value })),
		...mos.map((value): ApplicabilityChip => ({ kind: 'mos', value })),
		...ranks.map((value): ApplicabilityChip => ({ kind: 'rank', value }))
	];
}

export function trainingTypeDraftFrom(type: TrainingType): TrainingTypeDraft {
	const warnings = { firstWarningDays: type.warningDaysYellow, finalWarningDays: type.warningDaysOrange };
	const only = chipsFrom(type.appliesToRoles, type.appliesToMos, type.appliesToRanks);
	return {
		name: type.name,
		description: type.description,
		color: type.color,
		canBeExempted: type.canBeExempted,
		sortOrder: type.sortOrder,
		exemptPersonnelIds: [...type.exemptPersonnelIds],
		renewal: type.expirationDateOnly
			? { kind: 'cardDate', ...warnings }
			: type.expirationMonths === null
				? { kind: 'never' }
				: { kind: 'months', months: type.expirationMonths, ...warnings },
		applicability: {
			mode: type.isOptional ? 'optional' : only.length > 0 ? 'onlySome' : 'everyone',
			only,
			except: chipsFrom(type.excludedRoles, type.excludedMos, type.excludedRanks)
		},
		preservedRenewalFields: {
			expirationMonths: type.expirationMonths,
			warningDaysYellow: type.warningDaysYellow,
			warningDaysOrange: type.warningDaysOrange
		}
	};
}

function renewalFieldsFromDraft(draft: TrainingTypeDraft, intent: 'create' | 'update') {
	const renewal = draft.renewal;
	switch (renewal.kind) {
		case 'months':
			return {
				expirationMonths: renewal.months,
				expirationDateOnly: false,
				warningDaysYellow: renewal.firstWarningDays,
				warningDaysOrange: renewal.finalWarningDays
			};
		case 'cardDate':
			return {
				expirationMonths: draft.preservedRenewalFields.expirationMonths,
				expirationDateOnly: true,
				warningDaysYellow: renewal.firstWarningDays,
				warningDaysOrange: renewal.finalWarningDays
			};
		case 'never':
			return {
				expirationMonths: null,
				expirationDateOnly: false,
				...(intent === 'create' ? { warningDaysYellow: 60, warningDaysOrange: 30 } : {})
			};
	}
}

function applicabilityFieldsFromDraft(draft: ApplicabilityDraft) {
	const only = draft.mode === 'everyone' ? [] : draft.only;
	const values = (chips: ApplicabilityChip[], kind: ApplicabilityChip['kind']) =>
		chips.filter((chip) => chip.kind === kind).map((chip) => chip.value);
	return {
		appliesToRoles: values(only, 'role'),
		appliesToMos: values(only, 'mos'),
		appliesToRanks: values(only, 'rank'),
		excludedRoles: values(draft.except, 'role'),
		excludedMos: values(draft.except, 'mos'),
		excludedRanks: values(draft.except, 'rank'),
		isOptional: draft.mode === 'optional'
	};
}

type TrainingTypeDraftInput = Omit<TrainingType, 'id' | 'warningDaysYellow' | 'warningDaysOrange'> &
	Partial<Pick<TrainingType, 'warningDaysYellow' | 'warningDaysOrange'>>;

export function trainingTypeInputFromDraft(draft: TrainingTypeDraft, intent: 'update'): TrainingTypeDraftInput;
export function trainingTypeInputFromDraft(draft: TrainingTypeDraft, intent?: 'create'): Omit<TrainingType, 'id'>;
export function trainingTypeInputFromDraft(
	draft: TrainingTypeDraft,
	intent: 'create' | 'update' = 'create'
): TrainingTypeDraftInput {
	return {
		name: draft.name,
		description: draft.description,
		color: draft.color,
		canBeExempted: draft.canBeExempted,
		sortOrder: draft.sortOrder,
		exemptPersonnelIds: [...draft.exemptPersonnelIds],
		...renewalFieldsFromDraft(draft, intent),
		...applicabilityFieldsFromDraft(draft.applicability)
	};
}

export function validateTrainingTypeDraft(
	draft: TrainingTypeDraft
): Partial<Record<'name' | 'months' | 'firstWarningDays' | 'finalWarningDays', string>> {
	const errors: ReturnType<typeof validateTrainingTypeDraft> = {};
	if (!draft.name.trim()) errors.name = 'Give the type a name.';
	else if (draft.name.length > 100) errors.name = 'Keep the name to 100 characters.';
	const renewal = draft.renewal;
	if (renewal.kind === 'months') {
		if (!Number.isInteger(renewal.months) || renewal.months < 1 || renewal.months > 120) {
			errors.months = 'Use a whole number of months from 1 to 120.';
		}
	}
	if (renewal.kind !== 'never') {
		if (!Number.isInteger(renewal.firstWarningDays) || renewal.firstWarningDays < 1) {
			errors.firstWarningDays = 'Use a whole number of days, 1 or more.';
		}
		if (!Number.isInteger(renewal.finalWarningDays) || renewal.finalWarningDays < 0) {
			errors.finalWarningDays = 'Use a whole number of days, 0 or more.';
		} else if (renewal.finalWarningDays >= renewal.firstWarningDays) {
			errors.finalWarningDays = 'Make the final warning shorter than the first.';
		}
	}
	return errors;
}

export function applicabilityMatches(
	applicability: ApplicabilityDraft,
	personnel: Personnel[]
): { matched: Personnel[]; removedByExcept: Personnel[] } {
	const type = {
		id: '',
		...trainingTypeInputFromDraft({ ...newTrainingTypeDraft(), applicability })
	};
	const withoutExceptions = { ...type, excludedRoles: [], excludedMos: [], excludedRanks: [] };
	const matched: Personnel[] = [];
	const removedByExcept: Personnel[] = [];
	for (const person of personnel) {
		if (isTrainingApplicable(type, person)) matched.push(person);
		else if (isTrainingApplicable(withoutExceptions, person)) removedByExcept.push(person);
	}
	return { matched, removedByExcept };
}
