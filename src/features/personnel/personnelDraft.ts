import { rejectedRequestMessage, StoreRequestError } from '$lib/stores/core';
import { formatDisplayDate } from '$lib/utils/dates';
import type { Group, RankCatalogEntry } from './contracts';
import type { Personnel } from './personnel.types';

/** The basic-info fields of a Person as the Add, Edit and Quick edit forms hold them: strings only, '' for none. */
export interface PersonnelDraft {
	rank: string;
	lastName: string;
	firstName: string;
	mos: string;
	clinicRole: string;
	groupId: string;
	ets: string;
	deros: string;
}

export type PersonnelDraftField = keyof PersonnelDraft;

export interface PersonnelDraftOption {
	value: string;
	label: string;
}

/** The order the change summary lists a Person's edits in. */
export const PERSONNEL_DRAFT_FIELDS = [
	'rank',
	'lastName',
	'firstName',
	'mos',
	'clinicRole',
	'groupId',
	'ets',
	'deros'
] as const satisfies readonly PersonnelDraftField[];

const FIELD_LABELS: Record<PersonnelDraftField, string> = {
	rank: 'Rank',
	lastName: 'Last name',
	firstName: 'First name',
	mos: 'MOS',
	clinicRole: 'Duty role',
	groupId: 'Group',
	ets: 'ETS',
	deros: 'PCS / DEROS'
};

const COMMON_NEW_PERSONNEL_RANK = 'SPC';

function normalizeRankCode(value: string): string {
	return value.trim().toUpperCase();
}

export function personnelDraftOf(person: Personnel | null, defaultRank = ''): PersonnelDraft {
	return {
		rank: person?.rank ?? defaultRank,
		lastName: person?.lastName ?? '',
		firstName: person?.firstName ?? '',
		mos: person?.mos ?? '',
		clinicRole: person?.clinicRole ?? '',
		groupId: person?.groupId ?? '',
		ets: person?.ets ?? '',
		deros: person?.deros ?? ''
	};
}

export function rankOptionsFor(rankCatalog: readonly RankCatalogEntry[], currentRank?: string): PersonnelDraftOption[] {
	const active = rankCatalog
		.filter((entry) => entry.state === 'active')
		.map((entry) => ({ value: entry.code, label: entry.code }));
	if (!currentRank || active.some((option) => normalizeRankCode(option.value) === normalizeRankCode(currentRank))) {
		return active;
	}
	// A Person keeps a rank the catalog has since retired until someone changes it.
	return [{ value: currentRank, label: currentRank }, ...active];
}

export function defaultNewPersonnelRank(options: readonly PersonnelDraftOption[]): string {
	return options.find((option) => normalizeRankCode(option.value) === COMMON_NEW_PERSONNEL_RANK)?.value ?? '';
}

export function groupOptionsFor(groups: readonly Group[], allowUnassigned: boolean): PersonnelDraftOption[] {
	return [
		...(allowUnassigned ? [{ value: '', label: 'No Group Assigned' }] : []),
		...groups.map((group) => ({ value: group.id, label: group.name }))
	];
}

export type PersonnelDraftErrors = Partial<Record<'rank' | 'lastName' | 'firstName' | 'groupId', string>>;

export interface PersonnelDraftRules {
	isEditing: boolean;
	allowUnassigned: boolean;
	groups: readonly Group[];
}

/** What is wrong with the draft, keyed by field. Empty when it can be saved. */
export function validatePersonnelDraft(
	draft: PersonnelDraft,
	{ isEditing, allowUnassigned, groups }: PersonnelDraftRules
): PersonnelDraftErrors {
	const errors: PersonnelDraftErrors = {};
	if (draft.rank.trim() === '') errors.rank = 'Select a rank.';
	if (draft.lastName.trim() === '') errors.lastName = 'Enter a last name.';
	if (draft.firstName.trim() === '') errors.firstName = 'Enter a first name.';
	if (!isEditing && !allowUnassigned && !groups.some((group) => group.id === draft.groupId)) {
		errors.groupId = 'Select a permitted Group.';
	}
	return errors;
}

export function normalizePersonnelDraft(draft: PersonnelDraft): PersonnelDraft {
	return {
		rank: draft.rank.trim(),
		lastName: draft.lastName.trim(),
		firstName: draft.firstName.trim(),
		mos: draft.mos.trim(),
		clinicRole: draft.clinicRole.trim(),
		groupId: draft.groupId,
		ets: draft.ets.trim(),
		deros: draft.deros.trim()
	};
}

/** The record the PUT or POST carries. `groupName` rides along so the roster can show the Group before the response. */
export function personnelPayloadOf(draft: PersonnelDraft, groups: readonly Group[]): Omit<Personnel, 'id'> {
	const clean = normalizePersonnelDraft(draft);
	return {
		rank: clean.rank,
		lastName: clean.lastName,
		firstName: clean.firstName,
		mos: clean.mos,
		clinicRole: clean.clinicRole,
		ets: clean.ets || null,
		deros: clean.deros || null,
		groupId: clean.groupId || null,
		groupName: groups.find((group) => group.id === clean.groupId)?.name ?? ''
	};
}

export interface PersonnelDraftChange {
	field: PersonnelDraftField;
	label: string;
	from: string;
	to: string;
}

function shown(field: PersonnelDraftField, value: string, groups: readonly Group[]): string {
	if (value === '') return 'None';
	if (field === 'groupId') return groups.find((group) => group.id === value)?.name ?? 'None';
	if (field === 'ets' || field === 'deros') return formatDisplayDate(value);
	return value;
}

/** Each field whose saved value differs from the opening one, as the `old → new` pairs the change summary repeats. */
export function personnelDraftChanges(
	opening: PersonnelDraft,
	draft: PersonnelDraft,
	groups: readonly Group[]
): PersonnelDraftChange[] {
	const before = normalizePersonnelDraft(opening);
	const after = normalizePersonnelDraft(draft);
	return PERSONNEL_DRAFT_FIELDS.filter((field) => before[field] !== after[field]).map((field) => ({
		field,
		label: FIELD_LABELS[field],
		from: shown(field, before[field], groups),
		to: shown(field, after[field], groups)
	}));
}

export function personnelSaveErrorMessage(error: unknown, isEditing: boolean): string {
	const fallback = isEditing ? 'Failed to update personnel' : 'Failed to add personnel';
	if (error instanceof StoreRequestError) return rejectedRequestMessage(error, fallback);
	if (error instanceof Error && error.message.trim()) return error.message;
	return fallback;
}
