import type { Personnel } from './personnel.types';
import type { PersonnelExtendedInfo } from './personnelExtendedInfo.types';
import { isInLossWindow } from './upcomingLoss';
import { normalizeDodId } from './dodId';

/** The Data sheet form: basic info and extended info as the strings the fields edit. */
export interface DataSheetValues {
	dodId: string;
	rank: string;
	firstName: string;
	lastName: string;
	mos: string;
	clinicRole: string;
	/** An empty Group means unassigned. */
	groupId: string;
	ets: string;
	deros: string;
	bloodType: string;
	basd: string;
	dateOfRank: string;
	maritalStatus: string;
	maritalStatusDate: string;
	/** A number input binds a number, or null when empty. */
	numberOfDependents: DataSheetNumber;
	children: { name: string; age: DataSheetNumber }[];
	civilianEducation: string;
	/** One course per line. */
	militaryEducation: string;
	emergencyContactName: string;
	emergencyContactRelationship: string;
	emergencyContactPhone: string;
	spouseName: string;
	spousePhone: string;
	vehicleMakeModel: string;
	vehicleColor: string;
	vehiclePlate: string;
	personalEmail: string;
	personalPhone: string;
	addressStreet: string;
	addressCity: string;
	addressState: string;
	addressZip: string;
}

/** What a number input holds: its text before binding, then a number, or null once cleared. */
type DataSheetNumber = string | number | null;

export type DataSheetField = keyof DataSheetValues;

const BASIC_FIELDS = ['rank', 'firstName', 'lastName', 'mos', 'clinicRole', 'groupId', 'ets', 'deros'] as const;

const emptyPerson: Personnel = {
	id: '',
	rank: '',
	lastName: '',
	firstName: '',
	mos: '',
	clinicRole: '',
	groupId: null,
	groupName: ''
};

export function isDataSheetField(name: string): name is DataSheetField {
	return FIELD_NAMES.has(name);
}

export function dataSheetValues(person: Personnel, info: PersonnelExtendedInfo | null): DataSheetValues {
	return {
		dodId: info?.dodId ?? '',
		rank: person.rank,
		firstName: person.firstName,
		lastName: person.lastName,
		mos: person.mos ?? '',
		clinicRole: person.clinicRole ?? '',
		groupId: person.groupId ?? '',
		ets: person.ets ?? '',
		deros: person.deros ?? '',
		bloodType: info?.bloodType ?? '',
		basd: info?.basd ?? '',
		dateOfRank: info?.dateOfRank ?? '',
		maritalStatus: info?.maritalStatus ?? '',
		maritalStatusDate: info?.maritalStatusDate ?? '',
		numberOfDependents: info?.numberOfDependents == null ? '' : String(info.numberOfDependents),
		children: (info?.children ?? []).map((child) => ({
			name: child.name,
			age: child.age == null ? '' : String(child.age)
		})),
		civilianEducation: info?.civilianEducation ?? '',
		militaryEducation: (info?.militaryEducation ?? []).join('\n'),
		emergencyContactName: info?.emergencyContactName ?? '',
		emergencyContactRelationship: info?.emergencyContactRelationship ?? '',
		emergencyContactPhone: info?.emergencyContactPhone ?? '',
		spouseName: info?.spouseName ?? '',
		spousePhone: info?.spousePhone ?? '',
		vehicleMakeModel: info?.vehicleMakeModel ?? '',
		vehicleColor: info?.vehicleColor ?? '',
		vehiclePlate: info?.vehiclePlate ?? '',
		personalEmail: info?.personalEmail ?? '',
		personalPhone: info?.personalPhone ?? '',
		addressStreet: info?.addressStreet ?? '',
		addressCity: info?.addressCity ?? '',
		addressState: info?.addressState ?? '',
		addressZip: info?.addressZip ?? ''
	};
}

function courses(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

function numberText(value: DataSheetNumber): string {
	return value === null ? '' : String(value).trim();
}

function childList(children: DataSheetValues['children']) {
	return children
		.filter((child) => child.name.trim() !== '' || numberText(child.age) !== '')
		.map((child) => ({
			name: child.name.trim(),
			age: numberText(child.age) === '' ? null : Number(child.age)
		}));
}

function sameField(field: DataSheetField, saved: DataSheetValues, draft: DataSheetValues): boolean {
	if (field === 'dodId') return normalizeDodId(saved.dodId) === normalizeDodId(draft.dodId);
	if (field === 'children')
		return JSON.stringify(childList(saved.children)) === JSON.stringify(childList(draft.children));
	if (field === 'militaryEducation')
		return courses(saved.militaryEducation).join('\n') === courses(draft.militaryEducation).join('\n');
	if (field === 'numberOfDependents') return numberText(saved[field]) === numberText(draft[field]);
	return (saved[field] as string).trim() === (draft[field] as string).trim();
}

export function changedDataSheetFields(saved: DataSheetValues, draft: DataSheetValues): DataSheetField[] {
	return (Object.keys(saved) as DataSheetField[]).filter((field) => !sameField(field, saved, draft));
}

export interface DataSheetSavePayload {
	basicInfo: Record<string, unknown>;
	extendedInfo: Record<string, unknown>;
}

/** The sheet save replaces every sheet field, so the payload always carries all of them. */
export function dataSheetSavePayload(draft: DataSheetValues): DataSheetSavePayload {
	const basic: Record<string, string> = {};
	for (const field of BASIC_FIELDS) basic[field] = draft[field].trim();
	const dependents = numberText(draft.numberOfDependents);
	return {
		basicInfo: { ...basic, groupId: basic.groupId || null, ets: basic.ets || null, deros: basic.deros || null },
		extendedInfo: {
			dodId: normalizeDodId(draft.dodId),
			bloodType: draft.bloodType.trim(),
			basd: draft.basd,
			dateOfRank: draft.dateOfRank,
			maritalStatus: draft.maritalStatus.trim(),
			maritalStatusDate: draft.maritalStatusDate,
			numberOfDependents: dependents === '' ? null : Number(dependents),
			children: childList(draft.children),
			civilianEducation: draft.civilianEducation.trim(),
			militaryEducation: courses(draft.militaryEducation),
			emergencyContactName: draft.emergencyContactName.trim(),
			emergencyContactRelationship: draft.emergencyContactRelationship.trim(),
			emergencyContactPhone: draft.emergencyContactPhone.trim(),
			spouseName: draft.spouseName.trim(),
			spousePhone: draft.spousePhone.trim(),
			vehicleMakeModel: draft.vehicleMakeModel.trim(),
			vehicleColor: draft.vehicleColor.trim(),
			vehiclePlate: draft.vehiclePlate.trim(),
			personalEmail: draft.personalEmail.trim(),
			personalPhone: draft.personalPhone.trim(),
			addressStreet: draft.addressStreet.trim(),
			addressCity: draft.addressCity.trim(),
			addressState: draft.addressState.trim(),
			addressZip: draft.addressZip.trim()
		}
	};
}

const FIELD_NAMES = new Set<string>(Object.keys(dataSheetValues(emptyPerson, null)));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-03-14" as "14 Mar 2027". */
export function formatSheetDate(isoDate: string): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	if (!year || !month || !day) return isoDate;
	return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The read view's footer: when and by whom the sheet was last saved, then where to edit. */
export function lastUpdatedLine(info: Pick<PersonnelExtendedInfo, 'updatedAt' | 'updatedBy'> | null): string {
	const editHint = 'Use Edit in the header to change these fields.';
	if (!info?.updatedAt) return editHint;
	const savedAt = new Date(info.updatedAt);
	const day = [savedAt.getFullYear(), savedAt.getMonth() + 1, savedAt.getDate()]
		.map((part) => String(part).padStart(2, '0'))
		.join('-');
	const by = info.updatedBy ? ` by ${info.updatedBy}` : '';
	return `Last updated ${formatSheetDate(day)}${by}. ${editHint}`;
}

/** A date or ETS or DEROS draft's consequence line; null while the draft matches the saved date. */
export function lossWindowHint(
	saved: string,
	draft: string,
	today: string,
	warningWindowDays: number | null
): string | null {
	if (saved === draft) return null;
	const was = saved ? `Was ${formatSheetDate(saved)}.` : 'Was not set.';
	if (warningWindowDays === null) return was;
	const before = isInLossWindow(saved, today, warningWindowDays);
	const after = isInLossWindow(draft, today, warningWindowDays);
	if (before && !after) return `${was} Leaves the loss window on save.`;
	if (!before && after) return `${was} Enters the loss window on save.`;
	return was;
}

export function educationSummary(values: DataSheetValues): string {
	const military = courses(values.militaryEducation).length;
	return (
		[
			values.civilianEducation.trim(),
			military > 0 ? `${military} military ${military === 1 ? 'course' : 'courses'}` : ''
		]
			.filter(Boolean)
			.join(' · ') || 'Not set'
	);
}

export function vehicleSummary(values: DataSheetValues): string {
	return (
		[[values.vehicleColor, values.vehicleMakeModel].filter(Boolean).join(' '), values.vehiclePlate]
			.map((part) => part.trim())
			.filter(Boolean)
			.join(' · ') || 'Not set'
	);
}

/** The count when it is set, else the number of saved children; the children are listed whenever there are any. */
function dependentsLine(count: number | null, children: PersonnelExtendedInfo['children']): string {
	if (count === null && children.length === 0) return '';
	const names =
		children.length === 0
			? 'no children'
			: children.map((child) => (child.age == null ? child.name : `${child.name} (${child.age})`)).join(', ');
	return `${count ?? children.length} · ${names}`;
}

/** What the read view shows for the saved sheet. Each value is already display text. */
export function dataSheetReadModel(person: Personnel, info: PersonnelExtendedInfo | null) {
	const date = (value: string | null | undefined) => (value ? formatSheetDate(value) : '');
	const join = (parts: (string | null | undefined)[], separator: string) =>
		parts
			.map((part) => part?.trim())
			.filter(Boolean)
			.join(separator);
	const children = info?.children ?? [];
	const cityLine = join([join([info?.addressCity, info?.addressState], ', '), info?.addressZip], ' ');
	return {
		dodId: info?.dodId ?? '',
		basd: date(info?.basd),
		dateOfRank: date(info?.dateOfRank),
		ets: date(person.ets),
		deros: date(person.deros),
		bloodType: info?.bloodType ?? '',
		civilianEducation: info?.civilianEducation ?? '',
		militaryEducation: join(info?.militaryEducation ?? [], ' · '),
		personalPhone: info?.personalPhone ?? '',
		personalEmail: info?.personalEmail ?? '',
		addressLines: [info?.addressStreet?.trim() ?? '', cityLine].filter(Boolean),
		emergencyContact: join([info?.emergencyContactName, info?.emergencyContactRelationship?.toLowerCase()], ' · '),
		emergencyPhone: info?.emergencyContactPhone ?? '',
		maritalStatus: join([info?.maritalStatus, date(info?.maritalStatusDate)], ' · '),
		spouse: join([info?.spouseName, info?.spousePhone], ' · '),
		dependents: dependentsLine(info?.numberOfDependents ?? null, children),
		vehicle: join([info?.vehicleColor, info?.vehicleMakeModel], ' '),
		vehiclePlate: info?.vehiclePlate ?? ''
	};
}

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated'];
export const EMERGENCY_RELATIONSHIPS = ['Spouse', 'Parent', 'Sibling', 'Child', 'Partner', 'Friend', 'Other'];

/** Free text saved before these selects existed stays selectable until it is changed. */
export function optionsKeeping(options: string[], current: string): string[] {
	return current && !options.includes(current) ? [current, ...options] : options;
}
