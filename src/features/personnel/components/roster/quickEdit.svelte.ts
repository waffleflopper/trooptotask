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
	/** Writes through the Personnel store; resolves false when the write did not land. */
	save(id: string, data: Omit<Personnel, 'id'>): Promise<boolean>;
	/** Rereads the roster signals of People whose rank, MOS, duty role or Group changed. */
	refreshSignals(ids: string[]): void;
	/** A saved edit changed the Person from `before` to `after`. */
	peekChanged(id: string, before: Personnel, after: PeekChangeFields): void;
	dataSheetHref(person: Personnel): string;
	navigate(href: string): void;
	/** The editor closed; put focus back on the Person's row. */
	closed(personnelId: string): void;
}

/** One open editor: the Person, the values it opened with and what the user has typed since. */
export class QuickEditSession {
	readonly personnelId: string;
	readonly opening: PersonnelDraft;
	draft: PersonnelDraft;
	saving = $state(false);
	error = $state('');
	/** Set by the first Save, so a field is not reported before the user tried to save. */
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

/** What the editor is waiting on the user to decide. */
export type QuickEditPrompt =
	/** Unsaved changes would be lost by opening `next`'s editor, or by closing the editor when `next` is null. */
	| { kind: 'discard'; next: Personnel | null }
	/** Unsaved changes would not travel to the Data sheet. */
	| { kind: 'data-sheet' }
	/** Unsaved changes would be lost by leaving the roster for `href`. */
	| { kind: 'leave'; href: string };

/** The part of SvelteKit's `beforeNavigate` argument the editor reads. */
export interface LeavingNavigation {
	readonly to: { readonly url: URL } | null;
	readonly willUnload: boolean;
	cancel(): void;
}

/** The roster's one open quick editor: at most one row edits at a time, and leaving unsaved changes asks first. */
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

	/** Opens a row's editor, asking before it drops another row's unsaved changes. */
	open(person: Personnel): void {
		const current = this.session;
		if (current?.saving || current?.personnelId === person.id) return;
		if (current?.dirty) this.prompt = { kind: 'discard', next: person };
		else this.#start(person);
	}

	/** The pencil: opens the row's editor, or closes it when it is already the open one. */
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

	/** The roster is gone: an in-flight save may still land, but nothing after it touches the page or navigates. */
	dispose(): void {
		this.#disposed = true;
		this.session = null;
		this.prompt = null;
	}

	/** Drops the editor when its Person has left the roster. */
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

	/** Holds a navigation away from the roster while the editor has unsaved changes, and asks what to do with them. */
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

	/** Saves the open editor. Resolves true once the write landed; a failure keeps the editor open with its values. */
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
