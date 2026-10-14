/**
 * Special days store — federal holidays and org closures shown on the calendar.
 *
 * Extended methods:
 * - `getByDate(date)` — returns the SpecialDay for a given date, or undefined
 * - `isSpecialDay(date)` — boolean check used to render calendar cell indicators
 * - `getByYear(year)` — all special days for a given year (for the special day manager UI)
 *
 * Loaded by the calendar and dashboard page load functions.
 */
import { defineStore, organizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import { formatDate } from '$lib/utils/dates';
import { specialDaysSchema, type SpecialDay } from '$features/calendar/contracts';
import { confirmedNotSaved } from './calendarCommandResponse';

export type FederalHolidayResetResult =
	| 'saved'
	| 'saved-unrefreshed'
	| 'not-saved'
	| 'unconfirmed'
	| 'unconfirmed-unrefreshed'
	| 'stale';

interface SpecialDayExtensions extends Record<string, unknown> {
	load: Store<SpecialDay>['load'];
	add: Store<SpecialDay>['add'];
	update: Store<SpecialDay>['update'];
	remove: (id: string) => Promise<boolean>;
	resetFederalHolidays: () => Promise<FederalHolidayResetResult>;
	getByDate: (date: Date) => SpecialDay | undefined;
	isSpecialDay: (date: Date) => boolean;
	getByYear: (year: number) => SpecialDay[];
}

function enhance(base: Store<SpecialDay>): SpecialDayExtensions {
	let resetSequence = 0;
	let loadGeneration = 0;
	const latestResetByOrg: Record<string, number> = {};
	let mutationsByOrg: Record<string, { version: number; pending: Promise<unknown>[] }> = {};
	function mutationState(orgId: string) {
		return (mutationsByOrg[`${organizationLifetime()}:${orgId}`] ??= { version: 0, pending: [] });
	}
	function trackMutation<T>(orgId: string, operation: Promise<T>): Promise<T> {
		const state = mutationState(orgId);
		state.version++;
		const tracked = operation.finally(() => {
			state.version++;
			state.pending = state.pending.filter((pending) => pending !== tracked);
		});
		state.pending.push(tracked);
		return tracked;
	}
	function currentReset(orgId: string, requestReset: number) {
		return base.orgId === orgId && latestResetByOrg[orgId] === requestReset;
	}
	async function refreshAfterOverlappingMutation(
		orgId: string,
		requestReset: number
	): Promise<'saved' | 'stale' | 'refresh-failed'> {
		const state = mutationState(orgId);
		for (let attempt = 0; attempt < 3; attempt++) {
			await Promise.allSettled(state.pending);
			if (!currentReset(orgId, requestReset)) return 'stale';
			const version = state.version;
			const requestLoadGeneration = loadGeneration;
			try {
				const response = await withinOrganizationLifetime(fetch(`/org/${orgId}/api/special-days`));
				if (!response.ok) return 'refresh-failed';
				const savedDays = specialDaysSchema.safeParse(await withinOrganizationLifetime(response.json()));
				if (!currentReset(orgId, requestReset)) return 'stale';
				if (!savedDays.success) return 'refresh-failed';
				if (state.version !== version || state.pending.length > 0 || loadGeneration !== requestLoadGeneration) {
					continue;
				}
				base.removeLocalWhere(() => true);
				base.appendLocal(savedDays.data);
				return 'saved';
			} catch {
				return currentReset(orgId, requestReset) ? 'refresh-failed' : 'stale';
			}
		}
		return 'refresh-failed';
	}
	async function unconfirmed(orgId: string, requestReset: number): Promise<FederalHolidayResetResult> {
		const refreshed = await refreshAfterOverlappingMutation(orgId, requestReset);
		return refreshed === 'saved' ? 'unconfirmed' : refreshed === 'stale' ? 'stale' : 'unconfirmed-unrefreshed';
	}
	return {
		load(items, orgId) {
			loadGeneration++;
			// Mutations from an Organization the user left never settle, so a later reset must not wait on them.
			if (orgId !== base.orgId) mutationsByOrg = {};
			base.load(items, orgId);
		},
		add: (data) => trackMutation(base.orgId, base.add(data)),
		update: (id, data) => trackMutation(base.orgId, base.update(id, data)),
		remove: (id) => trackMutation(base.orgId, base.removeBool(id)),

		async resetFederalHolidays(): Promise<FederalHolidayResetResult> {
			const orgId = base.orgId;
			const mutationVersion = mutationState(orgId).version;
			const requestLoadGeneration = loadGeneration;
			const requestReset = ++resetSequence;
			latestResetByOrg[orgId] = requestReset;
			let res: Response;
			try {
				res = await withinOrganizationLifetime(
					fetch(`/org/${orgId}/api/special-days`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'resetFederalHolidays' })
					})
				);
			} catch {
				return currentReset(orgId, requestReset) ? unconfirmed(orgId, requestReset) : 'stale';
			}
			if (!currentReset(orgId, requestReset)) return 'stale';
			if (!res.ok) return confirmedNotSaved(res) ? 'not-saved' : unconfirmed(orgId, requestReset);
			const savedHolidays = specialDaysSchema.safeParse(await withinOrganizationLifetime(res.json()).catch(() => null));
			if (!currentReset(orgId, requestReset)) return 'stale';
			if (!savedHolidays.success) return unconfirmed(orgId, requestReset);
			if (mutationState(orgId).version !== mutationVersion || loadGeneration !== requestLoadGeneration) {
				const refreshed = await refreshAfterOverlappingMutation(orgId, requestReset);
				return refreshed === 'refresh-failed' ? 'saved-unrefreshed' : refreshed;
			}
			base.removeLocalWhere((day) => day.type === 'federal-holiday');
			base.appendLocal(savedHolidays.data);
			return 'saved';
		},

		getByDate(date: Date): SpecialDay | undefined {
			const dateStr = formatDate(date);
			return base.find((d) => d.date === dateStr);
		},

		isSpecialDay(date: Date): boolean {
			const dateStr = formatDate(date);
			return base.find((d) => d.date === dateStr) !== undefined;
		},

		getByYear(year: number): SpecialDay[] {
			return base.filter((d) => d.date.startsWith(`${year}-`));
		}
	};
}

export const specialDaysStore = defineStore<SpecialDay, SpecialDayExtensions>({ table: 'special_days' }, enhance);
