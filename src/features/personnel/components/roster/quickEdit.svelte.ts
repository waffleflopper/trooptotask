import { stillInOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import type { Group } from '../../contracts';
import {
	personnelDraftChanges,
	personnelDraftOf,
	personnelPayloadOf,
	personnelSaveErrorMessage,
	validatePersonnelDraft,
	type PersonnelDraft,
	type PersonnelDraftChange,
	type PersonnelDraftErrors
} from '../../personnelDraft';
import type { Personnel } from '../../personnel.types';
import type { PeekChangeFields } from '../../rosterPeek';
import { changesSignalApplicability } from '../../rosterSignals';

export interface QuickEditDeps {
	person(id: string): Personnel | undefined;
	groups(): readonly Group[];
	save(id: string, data: Omit<Personnel, 'id'>): Promise<boolean>;
	refreshSignals(ids: string[]): void;
	peekChanged(id: string, before: Personnel, after: PeekChangeFields): void;
	dataSheetHref(person: Personnel): string;
	navigate(href: string): void;
	closed(personnelId: string): void;
}

export class QuickEditSession {
	readonly personnelId: string;
	readonly opening: PersonnelDraft;
	draft: PersonnelDraft;
	saving = $state(false);
	error = $state('');
	attempted = $state(false);
	readonly changes: PersonnelDraftChange[];
	readonly errors: PersonnelDraftErrors;
	readonly dirty: boolean;

	constructor(person: Personnel, groups: () => readonly Group[]) {
		this.personnelId = person.id;
		this.opening = personnelDraftOf(person);
		this.draft = $state(personnelDraftOf(person));
		this.changes = $derived(personnelDraftChanges(this.opening, this.draft, groups()));
		this.errors = $derived(
			validatePersonnelDraft(this.draft, { isEditing: true, allowUnassigned: true, groups: groups() })
		);
		this.dirty = $derived(this.changes.length > 0);
	}
}

export type QuickEditPrompt =
	| { kind: 'discard'; next: Personnel | null }
	| { kind: 'data-sheet' }
	| { kind: 'leave'; href: string };

export interface LeavingNavigation {
	readonly to: { readonly url: URL } | null;
	readonly willUnload: boolean;
	cancel(): void;
}

export class RosterQuickEdit {
	session = $state.raw<QuickEditSession | null>(null);
	prompt = $state.raw<QuickEditPrompt | null>(null);
	readonly #deps: QuickEditDeps;
	#disposed = false;

	constructor(deps: QuickEditDeps) {
		this.#deps = deps;
	}

	get editingId(): string | null {
		return this.session?.personnelId ?? null;
	}

	open(person: Personnel): void {
		const current = this.session;
		if (current?.saving || current?.personnelId === person.id) return;
		if (current?.dirty) this.prompt = { kind: 'discard', next: person };
		else this.#start(person);
	}

	toggle(person: Personnel): void {
		const current = this.session;
		if (current?.personnelId !== person.id) return this.open(person);
		if (current.saving) return;
		if (current.dirty) this.prompt = { kind: 'discard', next: null };
		else this.cancel();
	}

	cancel(): void {
		const current = this.session;
		if (!current || current.saving) return;
		this.#close(current);
	}

	dispose(): void {
		this.#disposed = true;
		this.session = null;
		this.prompt = null;
	}

	closeIfGone(): void {
		const current = this.session;
		if (current && !this.#deps.person(current.personnelId)) this.#close(current);
	}

	decideDiscard(discard: boolean): void {
		const prompt = this.prompt;
		this.prompt = null;
		if (prompt?.kind !== 'discard' || !discard) return;
		const current = this.session;
		if (current) this.#close(current, { restoreFocus: prompt.next === null });
		if (prompt.next) this.#start(prompt.next);
	}

	openDataSheet(): void {
		const current = this.session;
		if (!current || current.saving) return;
		if (current.dirty) this.prompt = { kind: 'data-sheet' };
		else this.#goToDataSheet(current.personnelId);
	}

	guardNavigation(navigation: LeavingNavigation): void {
		const current = this.session;
		if (this.#disposed || !current?.dirty || current.saving) return;
		navigation.cancel();
		if (navigation.willUnload || !navigation.to) return;
		const { pathname, search, hash } = navigation.to.url;
		this.prompt = { kind: 'leave', href: pathname + search + hash };
	}

	async decideLeave(choice: 'save' | 'discard' | 'cancel'): Promise<void> {
		const prompt = this.prompt;
		if (prompt?.kind !== 'leave') return;
		const current = this.session;
		if (!current || choice === 'cancel') {
			this.prompt = null;
			return;
		}
		if (choice === 'save' && !(await this.save())) {
			if (this.session === current) this.prompt = null;
			return;
		}
		this.prompt = null;
		if (choice === 'discard') this.#close(current, { restoreFocus: false });
		if (!this.#disposed) this.#deps.navigate(prompt.href);
	}

	async decideDataSheet(choice: 'save' | 'discard' | 'cancel'): Promise<void> {
		if (this.prompt?.kind !== 'data-sheet') return;
		const current = this.session;
		if (!current || choice === 'cancel') {
			this.prompt = null;
			return;
		}
		if (choice === 'save' && !(await this.save())) {
			if (this.session === current) this.prompt = null;
			return;
		}
		this.prompt = null;
		if (choice === 'discard') this.#close(current, { restoreFocus: false });
		if (!this.#disposed) this.#goToDataSheet(current.personnelId);
	}

	async save(): Promise<boolean> {
		const session = this.session;
		if (!session || session.saving) return false;
		session.attempted = true;
		if (!session.dirty || Object.keys(session.errors).length > 0) return false;

		const stillHere = stillInOrganizationLifetime();
		const payload = personnelPayloadOf(session.draft, this.#deps.groups());
		const before = this.#deps.person(session.personnelId);
		session.saving = true;
		session.error = '';
		try {
			if (!(await this.#deps.save(session.personnelId, payload))) throw new Error('Failed to update personnel');
		} catch (error) {
			if (stillHere() && this.session === session) session.error = personnelSaveErrorMessage(error, true);
			if (this.session === session) session.saving = false;
			return false;
		}
		if (!stillHere()) return false;
		if (!this.#disposed) {
			if (before) {
				this.#deps.peekChanged(session.personnelId, before, payload);
				if (changesSignalApplicability(before, payload)) this.#deps.refreshSignals([session.personnelId]);
			}
			if (this.session === session) this.#close(session);
		}
		toastStore.success('Personnel updated');
		return true;
	}

	#start(person: Personnel): void {
		this.session = new QuickEditSession(person, () => this.#deps.groups());
	}

	#close(session: QuickEditSession, { restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
		if (this.session !== session) return;
		this.session = null;
		if (restoreFocus) this.#deps.closed(session.personnelId);
	}

	#goToDataSheet(personnelId: string): void {
		const person = this.#deps.person(personnelId);
		if (person) this.#deps.navigate(this.#deps.dataSheetHref(person));
	}
}
