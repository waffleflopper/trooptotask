import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import {
	plannerRostersSchema,
	rosterDayReplySchema,
	rosterFillPreviewSchema,
	type RosterDay,
	type RosterFillPreview
} from '$features/calendar/contracts';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { decodePlannerRosters, type RosterView } from '$features/calendar/utils/plannerRosters';
import { buildRequestError, withinOrganizationLifetime } from '$lib/stores/core';

export type PlannerRosterStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * One roster day for the duty picker. A refetch after a write keeps the shown day until the new one arrives, and
 * marks it stale if the refetch fails.
 */
export type RosterDayRead =
	| { readonly status: 'loading' }
	/** A null day is a type with no open roster form. */
	| { readonly status: 'ready'; readonly day: RosterDay | null; readonly stale?: true }
	| { readonly status: 'error' };

type MonthRequest = { readonly orgId: string; readonly month: string; readonly today: string };
type DayRequest = { readonly orgId: string; readonly typeId: string; readonly date: string; readonly today: string };

const dayKey = (request: DayRequest) => `${request.typeId}|${request.date}`;

/**
 * Roster counts for one Organization month, and the roster days the duty picker opens. Nothing retries on its own:
 * a failed read waits for `retry` or `retryDay`. Every assignment or availability write this client confirms
 * refetches the month and the open picker's day, and any other cached day on its next open. A reply for an
 * Organization, month or request the page has left is dropped. Create it during component setup.
 */
export class PlannerRosterRead {
	status = $state<PlannerRosterStatus>('idle');
	rosters = $state.raw<ReadonlyMap<string, RosterView>>(new Map());
	/** A refresh failed, so the shown counts may miss the latest write. */
	stale = $state(false);

	#request: MonthRequest | null = null;
	#serial = 0;
	#days = new SvelteMap<string, RosterDayRead>();
	#dayOrg = $state<string | null>(null);
	/** Bumped by each write, so a day read before it no longer counts as asked for. */
	#generation = $state(0);
	#dayGeneration = new Map<string, number>();

	constructor() {
		let seen = rosterInputWrites();
		$effect(() => {
			const writes = rosterInputWrites();
			if (writes === seen) return;
			seen = writes;
			untrack(() => this.#invalidate());
		});
	}

	/** Starts the read for `month` unless that month was already requested, even if it failed. */
	load(request: MonthRequest): void {
		untrack(() => {
			const current = this.#request;
			if (current?.orgId === request.orgId && current.month === request.month && current.today === request.today)
				return;
			const sameMonth = current?.orgId === request.orgId && current.month === request.month;
			this.#request = request;
			if (!sameMonth || this.status === 'error') {
				this.rosters = new Map();
				this.status = 'loading';
				this.stale = false;
			}
			void this.#read(request);
		});
	}

	/** Reads the current month again after a write elsewhere moved the counts. */
	refresh(): void {
		if (this.#request) void this.#read(this.#request);
	}

	retry(): void {
		if (!this.#request) return;
		if (this.status === 'error') this.status = 'loading';
		void this.#read(this.#request);
	}

	reset(): void {
		untrack(() => {
			this.#serial += 1;
			this.#request = null;
			this.rosters = new Map();
			this.status = 'idle';
			this.stale = false;
		});
	}

	/** The roster day the picker shows, or undefined before `loadDay` asked for it. */
	day(request: DayRequest): RosterDayRead | undefined {
		return request.orgId === this.#dayOrg ? this.#days.get(dayKey(request)) : undefined;
	}

	/**
	 * Starts the read for one roster day unless it was asked for since the last write, even if it failed. Called from
	 * an effect, the effect reruns after a write and refetches the day it shows.
	 */
	loadDay(request: DayRequest): void {
		void this.#generation;
		untrack(() => {
			if (request.orgId !== this.#dayOrg) this.#dropDays(request.orgId);
			const key = dayKey(request);
			if (this.#dayGeneration.get(key) === this.#generation) return;
			void this.#readDay(request);
		});
	}

	retryDay(request: DayRequest): void {
		if (request.orgId === this.#dayOrg) void this.#readDay(request);
	}

	#invalidate(): void {
		if (this.status === 'ready' || this.status === 'loading') this.refresh();
		this.#generation += 1;
	}

	#dropDays(orgId: string): void {
		this.#dayOrg = orgId;
		this.#generation += 1;
		this.#days.clear();
		this.#dayGeneration.clear();
	}

	async #read(request: MonthRequest): Promise<void> {
		const serial = ++this.#serial;
		const owns = () => serial === this.#serial;
		const resource = `/org/${request.orgId}/api/duty-rosters?today=${request.today}&month=${request.month}`;
		try {
			const res = await withinOrganizationLifetime(fetch(resource), owns);
			if (!res.ok) throw await withinOrganizationLifetime(buildRequestError(res, 'GET', resource), owns);
			const rosters = plannerRostersSchema.parse(await withinOrganizationLifetime(res.json(), owns));
			this.rosters = decodePlannerRosters(rosters);
			this.status = 'ready';
			this.stale = false;
		} catch {
			if (!owns()) return;
			if (this.status === 'ready') this.stale = true;
			else this.status = 'error';
		}
	}

	async #readDay(request: DayRequest): Promise<void> {
		const key = dayKey(request);
		const generation = this.#generation;
		this.#dayGeneration.set(key, generation);
		const shown = this.#days.get(key);
		if (shown?.status !== 'ready') this.#days.set(key, { status: 'loading' });
		const owns = () => request.orgId === this.#dayOrg && this.#dayGeneration.get(key) === generation;
		const resource = `/org/${request.orgId}/api/duty-rosters/day?typeId=${request.typeId}&date=${request.date}&today=${request.today}`;
		try {
			const res = await withinOrganizationLifetime(fetch(resource), owns);
			if (!res.ok) throw await withinOrganizationLifetime(buildRequestError(res, 'GET', resource), owns);
			const day = rosterDayReplySchema.parse(await withinOrganizationLifetime(res.json(), owns));
			this.#days.set(key, { status: 'ready', day });
		} catch {
			if (!owns()) return;
			const current = this.#days.get(key);
			this.#days.set(key, current?.status === 'ready' ? { ...current, stale: true } : { status: 'error' });
		}
	}
}

/** Changes whenever this client confirms an assignment or availability write, either of which can move counts. */
function rosterInputWrites(): number {
	return dailyAssignmentsStore.writes + availabilityStore.writes;
}

/** The picks Fill from roster would make. Nothing is written. */
export async function previewRosterFill(
	orgId: string,
	input: { typeId: string; today: string; from: string; through: string }
): Promise<RosterFillPreview> {
	const resource = `/org/${orgId}/api/duty-rosters/fill/preview`;
	const res = await withinOrganizationLifetime(
		fetch(resource, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input)
		})
	);
	if (!res.ok) throw await withinOrganizationLifetime(buildRequestError(res, 'POST', resource));
	return rosterFillPreviewSchema.parse(await withinOrganizationLifetime(res.json()));
}
