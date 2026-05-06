import { fail as actionFail } from '@sveltejs/kit';

export function dutyRosterFormValues(formData: FormData, name: string): string[] {
	return formData.getAll(name).map((value) => String(value));
}

export function parseDutyRosterBaselineCounts(formData: FormData): Record<string, number | null> {
	const counts: Record<string, number | null> = {};

	for (const [key, value] of formData.entries()) {
		if (!key.startsWith('baseline:')) {
			continue;
		}

		const personId = key.slice('baseline:'.length);
		const raw = String(value).trim();
		counts[personId] = raw ? Number(raw) : null;
	}

	return counts;
}

export function dutyRosterBaselineFormValues(formData: FormData): Record<string, string> {
	const counts: Record<string, string> = {};

	for (const [key, value] of formData.entries()) {
		if (!key.startsWith('baseline:')) {
			continue;
		}

		counts[key.slice('baseline:'.length)] = String(value);
	}

	return counts;
}

export function dutyRosterActionStatus(errorValue: unknown): number {
	return errorValue && typeof errorValue === 'object' && 'status' in errorValue && typeof errorValue.status === 'number'
		? errorValue.status
		: 500;
}

export function dutyRosterActionMessage(errorValue: unknown, fallback: string): string {
	const status = dutyRosterActionStatus(errorValue);
	return status >= 500 ? fallback : errorValue instanceof Error ? errorValue.message : fallback;
}

export function dutyRosterActionError<Value>(
	errorValue: unknown,
	input: {
		key: string;
		fallback: string;
		values?: Value;
		valuesKey?: 'values' | 'generateValues';
	}
) {
	const status = dutyRosterActionStatus(errorValue);
	const data: Record<string, unknown> = {
		[input.key]: dutyRosterActionMessage(errorValue, input.fallback)
	};

	if (input.values !== undefined) {
		data[input.valuesKey ?? 'values'] = input.values;
	}

	return actionFail(status, data);
}
