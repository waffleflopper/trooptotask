import { untrack } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { invalidate } from '$app/navigation';
import { isTimeZone, localDateIn } from '$lib/utils/dates';
import { rememberViewerTimeZone } from '$lib/utils/viewerTimeZone';
import { withinOrganizationLifetime } from '$lib/stores/core';
import {
	NO_SIGNAL_ACCESS,
	PERSONNEL_SIGNALS_DEPENDENCY,
	ROSTER_SIGNAL_BATCH_LIMIT,
	matchesRosterFilter,
	summarizeRosterSignals,
	type PersonSignalCore,
	type RosterFilter,
	type RosterLoss,
	type RosterSignalRead,
	type RosterStatusType,
	type SignalAccess,
	type SignalRow,
	type SummaryState
} from './rosterSignals';

export type RosterSignalsStatus = 'pending' | 'ready' | 'failed';

export interface RosterSignalsOptions {
	readPeople?: (orgId: string, personnelIds: string[]) => Promise<RosterSignalRead>;
	invalidate?: (dependency: string) => Promise<void>;
	browserDay?: () => string | null;
}

function readBrowserDay(): string | null {
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	return isTimeZone(timeZone) ? localDateIn(timeZone, new Date()) : null;
}

async function readPeopleFromEndpoint(orgId: string, personnelIds: string[]): Promise<RosterSignalRead> {
	const response = await fetch(`/org/${orgId}/api/personnel/roster-signals`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ personnelIds })
	});
	if (!response.ok) throw new Error('Roster signals could not be read');
	const read = (await response.json()) as RosterSignalRead;
	if (typeof read?.asOf !== 'string' || !Array.isArray(read.people))
		throw new Error('Roster signals could not be read');
	return read;
}

const withheld = (personnelId: string): PersonSignalCore => ({
	personnelId,
	today: { kind: 'withheld' },
	attention: { kind: 'withheld' },
	matches: {},
	openFollowUps: { kind: 'withheld' }
});

export class RosterSignals {
	status = $state<RosterSignalsStatus>('pending');
	asOf = $state('');
	access = $state.raw<SignalAccess>(NO_SIGNAL_ACCESS);
	statusTypes = $state.raw<RosterStatusType[]>([]);

	#orgId = '';
	#lane: Promise<RosterSignalRead> | null = null;
	#cores = new SvelteMap<string, PersonSignalCore>();
	#reading = new SvelteSet<string>();
	#generation = 0;
	#settledGeneration = 0;
	#refreshedAt = new Map<string, number>();
	#serial = 0;
	#latestRefresh = new Map<string, number>();
	#covered = new Set<string>();
	#asked = new Set<string>();
	readonly #readPeople: NonNullable<RosterSignalsOptions['readPeople']>;
	readonly #invalidate: NonNullable<RosterSignalsOptions['invalidate']>;
	readonly #browserDay: NonNullable<RosterSignalsOptions['browserDay']>;
	#dayLeft = '';

	constructor(options: RosterSignalsOptions = {}) {
		this.#readPeople = options.readPeople ?? readPeopleFromEndpoint;
		this.#invalidate = options.invalidate ?? invalidate;
		this.#browserDay = options.browserDay ?? readBrowserDay;
	}

	observe(orgId: string, asOf: string, lane: Promise<RosterSignalRead>): void {
		untrack(() => {
			if (lane === this.#lane && orgId === this.#orgId) return;
			const keepShown = orgId === this.#orgId && asOf === this.asOf && this.status === 'ready';
			if (orgId !== this.#orgId) this.#forgetRefreshes();
			this.#orgId = orgId;
			this.#lane = lane;
			const generation = ++this.#generation;
			if (!keepShown) {
				this.#cores.clear();
				this.status = 'pending';
			}
			this.asOf = asOf;
			this.#leaveDay(asOf);
			const current = () => this.#lane === lane && this.#orgId === orgId;
			withinOrganizationLifetime(lane, current).then(
				(read) => this.#settle(read, generation),
				() => {
					this.#cores.clear();
					this.status = 'failed';
				}
			);
		});
	}

	#leaveDay(asOf: string): string | null {
		const browserDay = this.#browserDay();
		if (browserDay === null || browserDay === asOf) return null;
		if (this.#dayLeft !== asOf) {
			this.#dayLeft = asOf;
			rememberViewerTimeZone();
			void this.#invalidate(PERSONNEL_SIGNALS_DEPENDENCY);
		}
		return browserDay;
	}

	viewerDay(): string {
		return this.#leaveDay(this.asOf) ?? this.asOf;
	}

	#settle(read: RosterSignalRead, generation: number): void {
		this.#settledGeneration = generation;
		const refreshedSince = (id: string) => (this.#refreshedAt.get(id) ?? -1) >= generation;
		for (const id of [...this.#cores.keys()]) if (!refreshedSince(id)) this.#cores.delete(id);
		for (const core of read.people) if (!refreshedSince(core.personnelId)) this.#cores.set(core.personnelId, core);
		this.access = read.access;
		this.statusTypes = read.statusTypes;
		this.#covered = new Set(read.people.map((core) => core.personnelId));
		this.#asked.clear();
		this.status = 'ready';
	}

	#forgetRefreshes(): void {
		this.#refreshedAt.clear();
		this.#latestRefresh.clear();
		this.#reading.clear();
	}

	get readsAnySource(): boolean {
		return Object.values(this.access).some(Boolean);
	}

	row(personnelId: string, loss: RosterLoss | null = null): SignalRow {
		if (this.status === 'failed') return { kind: 'failed' };
		const core = this.#cores.get(personnelId);
		if (this.status === 'pending' || (!core && this.#reading.has(personnelId))) return { kind: 'pending' };
		return { kind: 'ready', value: { ...(core ?? withheld(personnelId)), loss } };
	}

	summarize(
		personnelIds: readonly string[],
		losses: ReadonlyMap<string, RosterLoss>,
		lossesEnabled: boolean
	): SummaryState {
		if (this.status !== 'ready') return { kind: this.status };
		const rows = personnelIds.flatMap((id) => {
			const row = this.row(id, losses.get(id) ?? null);
			return row.kind === 'ready' ? [row.value] : [];
		});
		return {
			kind: 'ready',
			value: summarizeRosterSignals({ rows, access: this.access, lossesEnabled, statusTypes: this.statusTypes })
		};
	}

	matches(personnelId: string, filter: RosterFilter, loss: RosterLoss | null = null): boolean {
		const row = this.row(personnelId, loss);
		return row.kind === 'ready' && matchesRosterFilter(row.value, filter);
	}

	async refresh(personnelIds: readonly string[]): Promise<void> {
		const ids = [...new Set(personnelIds)];
		if (ids.length === 0 || this.status === 'failed') return;
		if (ids.length > ROSTER_SIGNAL_BATCH_LIMIT) return this.reload();
		const orgId = this.#orgId;
		const asOf = this.asOf;
		const generation = this.#generation;
		const serial = ++this.#serial;
		for (const id of ids) {
			this.#latestRefresh.set(id, serial);
			this.#refreshedAt.set(id, generation);
			this.#reading.add(id);
		}
		const owns = (id: string) => this.#orgId === orgId && this.#latestRefresh.get(id) === serial;
		try {
			const read = await withinOrganizationLifetime(this.#readPeople(orgId, ids), () => ids.some(owns));
			if (this.asOf !== asOf || this.#settledGeneration > generation) return;
			if (read.asOf !== asOf) return await this.#invalidate(PERSONNEL_SIGNALS_DEPENDENCY);
			const cores = new Map(read.people.map((core) => [core.personnelId, core]));
			for (const id of ids) {
				if (!owns(id)) continue;
				const core = cores.get(id);
				if (core) this.#cores.set(id, core);
				else this.#cores.delete(id);
			}
		} catch {
			return;
		} finally {
			for (const id of ids) if (owns(id)) this.#reading.delete(id);
		}
	}

	ensure(rosterIds: readonly string[]): void {
		untrack(() => {
			if (this.status !== 'ready' || !this.readsAnySource) return;
			const missing = rosterIds.filter(
				(id) => !this.#covered.has(id) && !this.#cores.has(id) && !this.#reading.has(id) && !this.#asked.has(id)
			);
			if (missing.length === 0) return;
			for (const id of missing) this.#asked.add(id);
			if (missing.length > ROSTER_SIGNAL_BATCH_LIMIT) void this.reload();
			else void this.refresh(missing);
		});
	}

	reload(): Promise<void> {
		return this.#invalidate(PERSONNEL_SIGNALS_DEPENDENCY);
	}
}
