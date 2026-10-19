import type { Personnel } from '../personnel.types';
import type { PersonnelDataSheetSaveResult, PersonnelExtendedInfo } from '../personnelExtendedInfo.types';
import {
	changedDataSheetFields,
	dataSheetSavePayload,
	dataSheetValues,
	isDataSheetField,
	type DataSheetField,
	type DataSheetValues
} from '../dataSheetModel';
import { personnelStore } from '../stores/personnel.svelte';
import { buildRequestError, rejectedRequestMessage } from '$lib/stores/core';

export interface DataSheetDraftInput {
	orgId: string;
	person: Personnel;
	info: PersonnelExtendedInfo | null;
}

export interface DataSheetDraftDeps {
	fetch?: typeof fetch;
}

interface FieldRejection {
	field: DataSheetField;
	message: string;
	/** The field's value when the server refused it, so the message goes away once the field changes. */
	value: string;
}

export interface SavedDataSheet {
	person: Personnel;
	extendedInfo: PersonnelExtendedInfo;
}

export class DataSheetDraft {
	readonly #input: DataSheetDraftInput;
	readonly #fetch: typeof fetch;

	values = $state<DataSheetValues>({} as DataSheetValues);
	saved = $state.raw<DataSheetValues>({} as DataSheetValues);
	saving = $state(false);
	formError = $state('');
	rejection = $state.raw<FieldRejection | null>(null);

	changedFields = $derived(changedDataSheetFields(this.saved, this.values));
	changeCount = $derived(this.changedFields.length);

	constructor(input: DataSheetDraftInput, deps: DataSheetDraftDeps = {}) {
		this.#input = input;
		this.#fetch = deps.fetch ?? ((...request) => fetch(...request));
		this.saved = dataSheetValues(input.person, input.info);
		this.values = dataSheetValues(input.person, input.info);
	}

	isChanged = (field: DataSheetField): boolean => this.changedFields.includes(field);

	errorFor = (field: DataSheetField): string | undefined => {
		const rejection = this.rejection;
		if (!rejection || rejection.field !== field) return undefined;
		return fieldKey(this.values[field]) === rejection.value ? rejection.message : undefined;
	};

	/** Resolves with the saved record, or null when the save was refused or failed. */
	save = async (): Promise<SavedDataSheet | null> => {
		if (this.saving || this.changeCount === 0) return null;
		const { orgId, person } = this.#input;
		this.saving = true;
		this.formError = '';
		this.rejection = null;
		try {
			const response = await this.#fetch(`/org/${orgId}/api/personnel/${person.id}/data-sheet`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(dataSheetSavePayload(this.values))
			});
			const result = await readSaveResult(response);
			if (!result) throw await buildRequestError(response, 'PUT', 'personnel');
			if (!result.saved) {
				if (isDataSheetField(result.field)) {
					this.rejection = {
						field: result.field,
						message: result.message,
						value: fieldKey(this.values[result.field])
					};
				} else {
					this.formError = result.message;
				}
				return null;
			}
			personnelStore.updateLocalWhere(
				(item) => item.id === result.person.id,
				() => result.person
			);
			this.saved = dataSheetValues(result.person, result.extendedInfo);
			return { person: result.person, extendedInfo: result.extendedInfo };
		} catch (caught) {
			this.formError = rejectedRequestMessage(caught, 'Unable to save the data sheet.');
			return null;
		} finally {
			this.saving = false;
		}
	};
}

function fieldKey(value: DataSheetValues[DataSheetField]): string {
	return typeof value === 'string' ? value : JSON.stringify(value);
}

async function readSaveResult(response: Response): Promise<PersonnelDataSheetSaveResult | null> {
	if (response.ok) return (await response.json()) as PersonnelDataSheetSaveResult;
	if (response.status !== 400) return null;
	const body: unknown = await response
		.clone()
		.json()
		.catch(() => null);
	return typeof body === 'object' && body !== null && 'saved' in body && body.saved === false
		? (body as PersonnelDataSheetSaveResult)
		: null;
}
