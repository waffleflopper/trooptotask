import { SvelteMap } from 'svelte/reactivity';
import {
	ROSTER_PEEK_SECTIONS,
	peekSectionsAffectedBy,
	type PeekChangeFields,
	type RosterPeekRead,
	type RosterPeekSection,
	type RosterPeekValues
} from './rosterPeek';

export type PeekSectionState<S extends RosterPeekSection> =
	| { state: 'loading' }
	| { state: 'ready'; value: RosterPeekValues[S] }
	| { state: 'hidden' }
	| { state: 'failed' };

export type PeekSections = { [S in RosterPeekSection]: PeekSectionState<S> };

export type ReadPeekSection = (
	orgId: string,
	personnelId: string,
	section: RosterPeekSection,
	signal: AbortSignal
) => Promise<RosterPeekRead>;

export interface RosterPeekOptions {
	readSection?: ReadPeekSection;
	/** How long J/K browsing waits on a Person before reading them. */
	browseDelayMs?: number;
}

const LOADING: PeekSections = {
	identity: { state: 'loading' },
	next7: { state: 'loading' },
	attention: { state: 'loading' },
	followUps: { state: 'loading' },
	note: { state: 'loading' }
};

async function readSectionFromEndpoint(
	orgId: string,
	personnelId: string,
	section: RosterPeekSection,
	signal: AbortSignal
): Promise<RosterPeekRead> {
	const response = await fetch(`/org/${orgId}/api/personnel/${personnelId}/peek?section=${section}`, { signal });
	if (response.status === 403) return { state: 'hidden' };
	if (!response.ok) throw new Error(`Peek ${section} could not be read`);
	return (await response.json()) as RosterPeekRead;
}

/** Readiness that could not check every source is not a settled result: the next show reads it again. */
function isPartialRead(section: RosterPeekSection, value: unknown): boolean {
	return section === 'attention' && (value as RosterPeekValues['attention']).failed.length > 0;
}

class PeekEntry {
	sections = $state<PeekSections>({ ...LOADING });
	/** Sections a write changed since they were read; the next show reads them again. */
	readonly stale = new Set<RosterPeekSection>();
	/** The latest read per section, so an older reply never overwrites a newer one. */
	readonly serial: Partial<Record<RosterPeekSection, number>> = {};
}

/**
 * The peek panel's sections, read only when a Person is shown and kept per Person for the page. Showing someone else
 * aborts the previous Person's reads at once; J/K browsing waits `browseDelayMs` before reading. One per page context,
 * so the cache ends with the workspace load that made it.
 */
export class RosterPeek {
	readonly #orgId: string;
	readonly #read: ReadPeekSection;
	readonly #browseDelayMs: number;
	readonly #entries = new SvelteMap<string, PeekEntry>();
	#shown: string | null = null;
	#controller: AbortController | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;

	constructor(orgId: string, options: RosterPeekOptions = {}) {
		this.#orgId = orgId;
		this.#read = options.readSection ?? readSectionFromEndpoint;
		this.#browseDelayMs = options.browseDelayMs ?? 150;
	}

	/** What the panel draws for a Person: their cached sections, or every section loading. */
	sections(personnelId: string): PeekSections {
		return this.#entries.get(personnelId)?.sections ?? LOADING;
	}

	show(personnelId: string, { browsing = false }: { browsing?: boolean } = {}): void {
		if (personnelId === this.#shown) return;
		this.close();
		this.#shown = personnelId;
		if (browsing) this.#timer = setTimeout(() => this.#load(personnelId), this.#browseDelayMs);
		else this.#load(personnelId);
	}

	close(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.#controller?.abort();
		this.#controller = null;
		this.#shown = null;
	}

	retry(personnelId: string, section: RosterPeekSection): void {
		const entry = this.#entries.get(personnelId);
		if (entry && personnelId === this.#shown && this.#controller)
			this.#fetch(personnelId, entry, section, this.#controller);
	}

	/**
	 * A write changed these sections for these People. Their cached copies are not reused; a shown Person's sections read again in place
	 * unless `refetchShown` is false, as when the panel already shows the change itself.
	 */
	invalidate(
		personnelIds: readonly string[],
		sections: readonly RosterPeekSection[],
		{ refetchShown = true }: { refetchShown?: boolean } = {}
	): void {
		for (const id of personnelIds) {
			const entry = this.#entries.get(id);
			if (!entry) continue;
			const controller = id === this.#shown && refetchShown ? this.#controller : null;
			for (const section of sections) {
				if (controller) this.#fetch(id, entry, section, controller);
				else entry.stale.add(section);
			}
		}
	}

	/** A write changed a Person from `before` to `after`; the sections that change leaves out of date are not reused. */
	changed(personnelId: string, before: PeekChangeFields, after: PeekChangeFields): void {
		const sections = peekSectionsAffectedBy(before, after);
		if (sections.length) this.invalidate([personnelId], sections);
	}

	#load(personnelId: string): void {
		this.#timer = null;
		const controller = new AbortController();
		this.#controller = controller;
		let entry = this.#entries.get(personnelId);
		if (!entry) {
			entry = new PeekEntry();
			this.#entries.set(personnelId, entry);
		}
		for (const section of ROSTER_PEEK_SECTIONS) {
			const current = entry.sections[section];
			const settled =
				current.state === 'hidden' || (current.state === 'ready' && !isPartialRead(section, current.value));
			if (settled && !entry.stale.has(section)) continue;
			this.#fetch(personnelId, entry, section, controller);
		}
	}

	/** A settled section stays drawn while it reads again; a failed one shows its skeleton. */
	async #fetch(
		personnelId: string,
		entry: PeekEntry,
		section: RosterPeekSection,
		controller: AbortController
	): Promise<void> {
		const serial = (entry.serial[section] ?? 0) + 1;
		entry.serial[section] = serial;
		entry.stale.delete(section);
		if (entry.sections[section].state === 'failed') entry.sections[section] = { state: 'loading' };
		let next: PeekSectionState<RosterPeekSection>;
		try {
			const read = await this.#read(this.#orgId, personnelId, section, controller.signal);
			next = read.state === 'ready' ? { state: 'ready', value: read.value } : { state: 'hidden' };
		} catch {
			next = { state: 'failed' };
		}
		if (entry.serial[section] !== serial) return;
		if (controller.signal.aborted) {
			entry.stale.add(section);
			return;
		}
		(entry.sections as Record<RosterPeekSection, PeekSectionState<RosterPeekSection>>)[section] = next;
	}
}
