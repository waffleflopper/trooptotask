import { rejectedRequestMessage } from '$lib/stores/core';
import type { PersonnelFollowUp } from '../contracts';
import { nowIso } from '../logModel';
import { ArtifactDraft } from './artifactDraft.svelte';
import { sendArtifactRequest } from './artifactRequest';
import { refreshPersonnelDetailCounts } from './detailCounts';
import { followUpDraftSpec } from './personnelArtifactDraftSpecs';

export interface FollowUpEdit {
	title: string;
	notes: string;
	dueDate: string;
}

export interface FollowUpListDeps {
	orgId: string;
	personnelId: string;
	fetch: typeof fetch;
	now?: () => string;
}

export class FollowUpList {
	readonly #initial: PersonnelFollowUp[];
	readonly #deps: FollowUpListDeps;
	readonly draft: ArtifactDraft<{ title: string; notes: string; dueDate: string }, PersonnelFollowUp>;
	readonly rows: PersonnelFollowUp[];
	#archivedIds = $state<string[]>([]);
	#busyIds = $state<string[]>([]);
	rowErrors = $state<Record<string, string>>({});

	constructor(initial: PersonnelFollowUp[], deps: FollowUpListDeps) {
		this.#initial = initial;
		this.#deps = deps;
		this.draft = new ArtifactDraft(followUpDraftSpec, {
			context: { orgId: deps.orgId, personId: deps.personnelId },
			fetch: (input, init) => deps.fetch(input, init)
		});
		this.rows = $derived(this.draft.mergeLoaded(this.#initial).filter((row) => !this.#archivedIds.includes(row.id)));
	}

	isBusy(id: string): boolean {
		return this.#busyIds.includes(id);
	}

	#url(id: string): string {
		return `/org/${this.#deps.orgId}/api/personnel/${this.#deps.personnelId}/follow-ups/${id}`;
	}

	#find(id: string): PersonnelFollowUp | undefined {
		return this.rows.find((row) => row.id === id);
	}

	async #write(id: string, body: Record<string, unknown>, fallback: string): Promise<PersonnelFollowUp | null> {
		this.rowErrors = { ...this.rowErrors, [id]: '' };
		this.#busyIds = [...this.#busyIds, id];
		try {
			const saved = await sendArtifactRequest<Partial<PersonnelFollowUp>>(
				this.#deps.fetch,
				this.#url(id),
				'PATCH',
				body
			);
			const current = this.#find(id);
			return current ? { ...current, ...saved } : null;
		} catch (caught) {
			this.rowErrors = { ...this.rowErrors, [id]: rejectedRequestMessage(caught, fallback) };
			return null;
		} finally {
			this.#busyIds = this.#busyIds.filter((busy) => busy !== id);
		}
	}

	/** Completes or reopens at once and restores the row with an inline error if the write fails. True once it saved. */
	async toggle(id: string): Promise<boolean> {
		const before = this.#find(id);
		if (!before || this.isBusy(id)) return false;
		const completing = before.status !== 'completed';
		this.draft.upsert({
			...before,
			status: completing ? 'completed' : 'open',
			completedAt: completing ? (this.#deps.now?.() ?? nowIso()) : null,
			completedBy: null
		});
		const saved = await this.#write(
			id,
			{ status: completing ? 'completed' : 'open' },
			completing ? 'Unable to complete follow-up.' : 'Unable to reopen follow-up.'
		);
		if (!saved) {
			this.draft.upsert(before);
			return false;
		}
		this.draft.upsert(saved);
		void refreshPersonnelDetailCounts();
		return true;
	}

	async save(id: string, edit: FollowUpEdit): Promise<boolean> {
		const issue = followUpDraftSpec.validate(edit);
		if (issue) {
			this.rowErrors = { ...this.rowErrors, [id]: issue.message };
			return false;
		}
		const saved = await this.#write(
			id,
			{ title: edit.title.trim(), notes: edit.notes.trim(), dueDate: edit.dueDate || null },
			'Unable to update follow-up.'
		);
		if (!saved) return false;
		this.draft.upsert(saved);
		void refreshPersonnelDetailCounts();
		return true;
	}

	async archive(id: string): Promise<boolean> {
		const saved = await this.#write(id, { status: 'archived' }, 'Unable to archive follow-up.');
		if (!saved) return false;
		this.#archivedIds = [...this.#archivedIds, id];
		void refreshPersonnelDetailCounts();
		return true;
	}
}
