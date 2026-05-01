import type { Da6AvailabilityTreatment, StatusType } from '$lib/types';

export const DA6_TREATMENT_NONE = 'none' as const;

export type Da6AvailabilityTreatmentOption = Da6AvailabilityTreatment | typeof DA6_TREATMENT_NONE;

export const DA6_AVAILABILITY_TREATMENT_OPTIONS: Array<{
	value: Da6AvailabilityTreatmentOption;
	label: string;
	description: string;
	disabled?: boolean;
}> = [
	{
		value: DA6_TREATMENT_NONE,
		label: 'No effect (available, chargeable)',
		description: 'Does not block selection or change DA Form 6 numbering.'
	},
	{
		value: 'authorized-absence',
		label: 'Authorized absence (unavailable, nonchargeable)',
		description: 'Blocks selection and interrupts the DA Form 6 count.'
	},
	{
		value: 'other-duty',
		label: 'Other duty (unavailable, chargeable)',
		description: 'Blocks selection while the DA Form 6 count continues.'
	},
	{
		value: 'misconduct-unavailable',
		label: 'Misconduct (unavailable, chargeable)',
		description: 'Future workflow: blocks selection while the DA Form 6 count continues.',
		disabled: true
	}
];

export const DA6_AVAILABILITY_HELP =
	"DA Form 6 counts chargeable unavailable days, such as other duty or misconduct, as the Soldier's turn continuing. Authorized absences are nonchargeable and interrupt the count. Appointment-style statuses can have no DA6 effect.";

export function formatDa6AvailabilityTreatment(value: Da6AvailabilityTreatment | null | undefined): string {
	return (
		DA6_AVAILABILITY_TREATMENT_OPTIONS.find((option) => option.value === (value ?? DA6_TREATMENT_NONE))?.label ??
		'No effect (available, chargeable)'
	);
}

export function toDa6AvailabilityTreatment(value: string): Da6AvailabilityTreatment | null {
	return value === DA6_TREATMENT_NONE ? null : (value as Da6AvailabilityTreatment);
}

const DA6_TREATMENT_PRIORITY: Record<Da6AvailabilityTreatment, number> = {
	'misconduct-unavailable': 3,
	'authorized-absence': 2,
	'other-duty': 1
};

export function highestPriorityDa6Treatment(
	statusTypes: StatusType[],
	statusTypeIds: Iterable<string>
): Da6AvailabilityTreatment | null {
	const statusTypeById = new Map(statusTypes.map((statusType) => [statusType.id, statusType]));
	let selected: Da6AvailabilityTreatment | null = null;

	for (const statusTypeId of statusTypeIds) {
		const treatment = statusTypeById.get(statusTypeId)?.da6AvailabilityTreatment ?? null;
		if (!treatment) {
			continue;
		}
		if (!selected || DA6_TREATMENT_PRIORITY[treatment] > DA6_TREATMENT_PRIORITY[selected]) {
			selected = treatment;
		}
	}

	return selected;
}
