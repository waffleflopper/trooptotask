import { rejectedRequestMessage } from '$lib/stores/core';
import type { PersonnelLeaderNote, PersonnelLogNotes } from '../contracts';
import { olderNotesQuery } from '../leaderNotePaging';
import { ArtifactDraft } from './artifactDraft.svelte';
import { sendArtifactRequest } from './artifactRequest';
import { refreshPersonnelDetailCounts } from './detailCounts';
import { leaderNoteDraftSpec } from './personnelArtifactDraftSpecs';

export interface LeaderNoteListDeps {
	orgId: string;
	personnelId: string;
	fetch: typeof fetch;
}

export class LeaderNoteList {
	readonly #deps: LeaderNoteListDeps;
	readonly #first: PersonnelLeaderNote[];
	readonly #total: number;
	readonly draft: ArtifactDraft<{ text: string }, PersonnelLeaderNote>;
	#older = $state<PersonnelLeaderNote[]>([]);
	#archivedIds = $state<string[]>([]);
	#busyIds = $state<string[]>([]);
	#exhausted = $state(false);
	readonly rows: PersonnelLeaderNote[];
	readonly count: number;
	readonly olderRemaining: number;
	loadingOlder = $state(false);
	olderError = $state('');
	rowErrors = $state<Record<string, string>>({});

	constructor(initial: PersonnelLogNotes, deps: LeaderNoteListDeps) {
		this.#deps = deps;
		this.#first = initial.notes;
		this.#total = initial.total;
		this.draft = new ArtifactDraft(leaderNoteDraftSpec, {
			context: { orgId: deps.orgId, personId: deps.personnelId },
			fetch: (input, init) => deps.fetch(input, init)
		});
		this.rows = $derived(
			this.draft
				.mergeLoaded(this.#loaded())
				.filter((note) => !this.#archivedIds.includes(note.id))
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
		);
		this.count = $derived(
			this.#total + (this.draft.mergeLoaded(this.#loaded()).length - this.#loaded().length) - this.#archivedIds.length
		);
		this.olderRemaining = $derived(this.#exhausted ? 0 : Math.max(0, this.count - this.rows.length));
	}

	#loaded(): PersonnelLeaderNote[] {
		return [...this.#first, ...this.#older];
	}

	isBusy(id: string): boolean {
		return this.#busyIds.includes(id);
	}

	#url(id: string): string {
		return `/org/${this.#deps.orgId}/api/personnel/${this.#deps.personnelId}/leader-notes/${id}`;
	}

	async loadOlder(): Promise<void> {
		const oldest = this.#loaded().at(-1);
		if (!oldest || this.loadingOlder) return;
		this.olderError = '';
		this.loadingOlder = true;
		try {
			const page = await sendArtifactRequest<PersonnelLeaderNote[]>(
				this.#deps.fetch,
				`/org/${this.#deps.orgId}/api/personnel/${this.#deps.personnelId}/leader-notes?${olderNotesQuery(oldest)}`,
				'GET'
			);
			const known = [...this.#loaded(), ...this.draft.items];
			const fresh = (page ?? []).filter((note) => !known.some((existing) => existing.id === note.id));
			if (fresh.length === 0) this.#exhausted = true;
			this.#older = [...this.#older, ...fresh];
		} catch (caught) {
			this.olderError = rejectedRequestMessage(caught, 'Unable to load older notes.');
		} finally {
			this.loadingOlder = false;
		}
	}

	async #write(id: string, body: Record<string, unknown>, fallback: string): Promise<PersonnelLeaderNote | null> {
		this.rowErrors = { ...this.rowErrors, [id]: '' };
		this.#busyIds = [...this.#busyIds, id];
		try {
			const saved = await sendArtifactRequest<Partial<PersonnelLeaderNote>>(
				this.#deps.fetch,
				this.#url(id),
				'PATCH',
				body
			);
			const current = this.rows.find((note) => note.id === id);
			return current ? { ...current, ...saved } : null;
		} catch (caught) {
			this.rowErrors = { ...this.rowErrors, [id]: rejectedRequestMessage(caught, fallback) };
			return null;
		} finally {
			this.#busyIds = this.#busyIds.filter((busy) => busy !== id);
		}
	}

	async save(id: string, text: string): Promise<boolean> {
		const issue = leaderNoteDraftSpec.validate({ text });
		if (issue) {
			this.rowErrors = { ...this.rowErrors, [id]: issue.message };
			return false;
		}
		const saved = await this.#write(id, { text: text.trim() }, 'Unable to update leader note.');
		if (!saved) return false;
		this.draft.upsert(saved);
		return true;
	}

	async archive(id: string): Promise<boolean> {
		const saved = await this.#write(id, { action: 'archive' }, 'Unable to archive leader note.');
		if (!saved) return false;
		this.#archivedIds = [...this.#archivedIds, id];
		void refreshPersonnelDetailCounts();
		return true;
	}
}
