import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { downloadBlob } from '$lib/utils/downloadBlob';
import { filenameFromContentDisposition } from '$lib/utils/workbook';
import type { Personnel } from '../personnel.types';
import { archivePersonnel, type RequestPersonnelArchiveApproval } from '../utils/archivePersonnel';

export interface PersonnelRecordActionsInput {
	orgId: string;
	orgUrlSegment: string;
	person: Personnel;
	requestArchiveApproval: RequestPersonnelArchiveApproval;
}

export interface PersonnelRecordActionsDeps {
	fetch?: typeof fetch;
	goto?: typeof goto;
	resolve?: typeof resolve;
	archivePersonnel?: typeof archivePersonnel;
	downloadBlob?: typeof downloadBlob;
	filenameFromContentDisposition?: typeof filenameFromContentDisposition;
}

const defaultDeps = {
	fetch: (...request: Parameters<typeof fetch>) => fetch(...request),
	goto,
	resolve,
	archivePersonnel,
	downloadBlob,
	filenameFromContentDisposition
} satisfies Required<PersonnelRecordActionsDeps>;

export class PersonnelRecordActions {
	readonly #input: () => PersonnelRecordActionsInput;
	readonly #deps: Required<PersonnelRecordActionsDeps>;
	#disposed = false;

	exporting = $state(false);
	exportError = $state('');
	confirmingArchive = $state(false);
	archiving = $state(false);

	constructor(input: () => PersonnelRecordActionsInput, deps: PersonnelRecordActionsDeps = {}) {
		this.#input = input;
		this.#deps = { ...defaultDeps, ...deps };
	}

	dispose = (): void => {
		this.#disposed = true;
	};

	get archiveMessage(): string {
		const { person } = this.#input();
		return `Archive ${person.rank} ${person.lastName}? They will be removed from active rosters, calendars, and reports, but their records remain available in archived personnel.`;
	}

	exportRecords = async (): Promise<void> => {
		if (this.#disposed || this.exporting) return;
		const { orgId, person } = this.#input();
		this.exporting = true;
		this.exportError = '';
		try {
			const response = await this.#deps.fetch(`/org/${orgId}/api/personnel/${person.id}/export`);
			if (this.#disposed) return;
			if (!response.ok) throw new Error('Unable to export personnel records.');
			const blob = await response.blob();
			if (this.#disposed) return;
			this.#deps.downloadBlob(
				blob,
				this.#deps.filenameFromContentDisposition(
					response.headers.get('Content-Disposition'),
					`${person.rank}-${person.lastName}-records.xlsx`
				)
			);
		} catch (caught) {
			this.exportError = caught instanceof Error ? caught.message : 'Unable to export personnel records.';
		} finally {
			this.exporting = false;
		}
	};

	confirmArchive = async (): Promise<void> => {
		if (this.#disposed || this.archiving) return;
		const { orgId, orgUrlSegment, person, requestArchiveApproval } = this.#input();
		this.archiving = true;
		try {
			const result = await this.#deps.archivePersonnel({
				orgId,
				person,
				requestArchiveApproval,
				resourceUrl: `/org/${orgId}/personnel/${person.slug ?? person.id}`
			});
			if (this.#disposed) return;
			if (result === 'archived') {
				await this.#deps.goto(this.#deps.resolve(`/org/${orgUrlSegment}/personnel` as '/'), {
					invalidate: ['app:personnel-data']
				});
			} else {
				this.confirmingArchive = false;
			}
		} finally {
			this.archiving = false;
		}
	};
}
