import type { CatalogUsage } from './catalogArchive';

export type CatalogUsageStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * How many records use each catalog type, loaded when the archived list opens. A load that finishes
 * after the Organization changed, or after a newer load began, is dropped.
 */
export class CatalogUsageView {
	status = $state<CatalogUsageStatus>('idle');
	counts = $state.raw<CatalogUsage>({});
	#orgId: () => string;
	#fetch: () => Promise<CatalogUsage>;
	#ticket = 0;
	#loadedFor = '';

	constructor(orgId: () => string, fetchUsage: () => Promise<CatalogUsage>) {
		this.#orgId = orgId;
		this.#fetch = fetchUsage;
	}

	/** Records using the type, or null while the count is not known. */
	countFor(id: string): number | null {
		return this.status === 'ready' && this.#loadedFor === this.#orgId() ? (this.counts[id] ?? 0) : null;
	}

	async load(): Promise<void> {
		const orgId = this.#orgId();
		const ticket = ++this.#ticket;
		this.status = 'loading';
		try {
			const counts = await this.#fetch();
			if (ticket !== this.#ticket || orgId !== this.#orgId()) return;
			this.counts = counts;
			this.#loadedFor = orgId;
			this.status = 'ready';
		} catch {
			if (ticket !== this.#ticket || orgId !== this.#orgId()) return;
			this.status = 'error';
		}
	}
}
