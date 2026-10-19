import { rejectedRequestMessage } from '$lib/stores/core';
import type { PersonnelArchivedArtifact } from '../contracts';
import { archivedTitle, type ArchivedFilter } from '../logModel';
import { sendArtifactRequest } from './artifactRequest';
import { refreshPersonnelDetailCounts } from './detailCounts';

export interface ArchivedListDeps {
	orgId: string;
	personnelId: string;
	fetch: typeof fetch;
}

type ArchivedKind = PersonnelArchivedArtifact['kind'];

const COLLECTION: Record<ArchivedKind, string> = {
	'follow-up': 'follow-ups',
	counseling: 'counseling-records',
	document: 'documents',
	note: 'leader-notes'
};

const keyOf = (record: Pick<PersonnelArchivedArtifact, 'kind' | 'id'>) => `${record.kind}:${record.id}`;

export class ArchivedList {
	readonly #deps: ArchivedListDeps;
	#removedKeys = $state<string[]>([]);
	#busyKeys = $state<string[]>([]);
	filter = $state<ArchivedFilter>('all');
	error = $state('');
	/** Set when a deleted item's stored file will be removed later. */
	notice = $state('');
	readonly #all: PersonnelArchivedArtifact[];
	readonly records: PersonnelArchivedArtifact[];
	readonly visible: PersonnelArchivedArtifact[];

	constructor(initial: PersonnelArchivedArtifact[], deps: ArchivedListDeps) {
		this.#all = initial;
		this.#deps = deps;
		this.records = $derived(this.#all.filter((record) => !this.#removedKeys.includes(keyOf(record))));
		this.visible = $derived(
			this.filter === 'all' ? this.records : this.records.filter((record) => record.kind === this.filter)
		);
	}

	countOf(filter: ArchivedFilter): number {
		return filter === 'all' ? this.records.length : this.records.filter((record) => record.kind === filter).length;
	}

	isBusy(record: PersonnelArchivedArtifact): boolean {
		return this.#busyKeys.includes(keyOf(record));
	}

	endpoint(record: PersonnelArchivedArtifact): string {
		return `/org/${this.#deps.orgId}/api/personnel/${this.#deps.personnelId}/${COLLECTION[record.kind]}/${record.id}`;
	}

	async restore(record: PersonnelArchivedArtifact): Promise<void> {
		if (this.isBusy(record)) return;
		this.error = '';
		const key = keyOf(record);
		this.#busyKeys = [...this.#busyKeys, key];
		try {
			await sendArtifactRequest(this.#deps.fetch, this.endpoint(record), 'PATCH', { action: 'restore' });
			this.#removedKeys = [...this.#removedKeys, keyOf(record)];
			void refreshPersonnelDetailCounts();
		} catch (caught) {
			this.error = rejectedRequestMessage(caught, 'Unable to restore archived item.');
		} finally {
			this.#busyKeys = this.#busyKeys.filter((busy) => busy !== key);
		}
	}

	async remove(record: PersonnelArchivedArtifact): Promise<string | null> {
		if (this.isBusy(record)) return null;
		this.error = '';
		this.notice = '';
		const key = keyOf(record);
		this.#busyKeys = [...this.#busyKeys, key];
		try {
			const body = await sendArtifactRequest<{ fileCleanup?: string }>(
				this.#deps.fetch,
				this.endpoint(record),
				'DELETE'
			);
			if (body?.fileCleanup === 'pending')
				this.notice = `Deleted ${archivedTitle(record)}. Its stored file will be removed automatically.`;
			this.#removedKeys = [...this.#removedKeys, keyOf(record)];
			void refreshPersonnelDetailCounts();
			return null;
		} catch (caught) {
			return rejectedRequestMessage(caught, 'Unable to delete archived item.');
		} finally {
			this.#busyKeys = this.#busyKeys.filter((busy) => busy !== key);
		}
	}
}
