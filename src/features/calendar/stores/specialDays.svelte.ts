/**
 * Special days store — federal holidays and org closures shown on the calendar.
 *
 * Extended methods:
 * - `getByDate(date)` — returns the SpecialDay for a given date, or undefined
 * - `isSpecialDay(date)` — boolean check used to render calendar cell indicators
 * - `getByYear(year)` — all special days for a given year (for the special day manager UI)
 * - `resetFederalHolidays()` — calls the server to delete and re-seed federal holidays
 *
 * Loaded by the calendar and dashboard page load functions.
 */
import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import { formatDate } from '$lib/utils/dates';
import type { SpecialDay } from '$lib/types';

interface SpecialDayExtensions extends Record<string, unknown> {
	load: Store<SpecialDay>['load'];
	add: Store<SpecialDay>['add'];
	update: Store<SpecialDay>['update'];
	remove: (id: string) => Promise<boolean>;
	resetFederalHolidays: () => Promise<'saved' | 'failed' | 'stale' | 'refresh-failed'>;
	getByDate: (date: Date) => SpecialDay | undefined;
	isSpecialDay: (date: Date) => boolean;
	getByYear: (year: number) => SpecialDay[];
}

function enhance(base: Store<SpecialDay>): SpecialDayExtensions {
	let resetSequence = 0;
	let loadGeneration = 0;
	const latestResetByOrg: Record<string, number> = {};
	const mutationsByOrg: Record<string, { version: number; pending: Promise<unknown>[] }> = {};
	function mutationState(orgId: string) {
		return (mutationsByOrg[orgId] ??= { version: 0, pending: [] });
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
				const response = await fetch(`/org/${orgId}/api/special-days`);
				if (!response.ok) return 'refresh-failed';
				const savedDays = (await response.json()) as SpecialDay[];
				if (!currentReset(orgId, requestReset)) return 'stale';
				if (state.version !== version || state.pending.length > 0 || loadGeneration !== requestLoadGeneration) {
					continue;
				}
				base.removeLocalWhere(() => true);
				base.appendLocal(savedDays);
				return 'saved';
			} catch {
				return currentReset(orgId, requestReset) ? 'refresh-failed' : 'stale';
			}
		}
		return 'refresh-failed';
	}
	return {
		load(items, orgId) {
			loadGeneration++;
			base.load(items, orgId);
		},
		add: (data) => trackMutation(base.orgId, base.add(data)),
		update: (id, data) => trackMutation(base.orgId, base.update(id, data)),
		remove: (id) => trackMutation(base.orgId, base.removeBool(id)),

		async resetFederalHolidays(): Promise<'saved' | 'failed' | 'stale' | 'refresh-failed'> {
			const orgId = base.orgId;
			const mutationVersion = mutationState(orgId).version;
			const requestLoadGeneration = loadGeneration;
			const requestReset = ++resetSequence;
			latestResetByOrg[orgId] = requestReset;
			try {
				const res = await fetch(`/org/${orgId}/api/special-days`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'resetFederalHolidays' })
				});
				if (!currentReset(orgId, requestReset)) return 'stale';
				if (!res.ok) return 'failed';
				const allDays = (await res.json()) as SpecialDay[];
				if (!currentReset(orgId, requestReset)) return 'stale';
				if (mutationState(orgId).version !== mutationVersion || loadGeneration !== requestLoadGeneration) {
					return refreshAfterOverlappingMutation(orgId, requestReset);
				}
				// Reset changes federal rows only; preserve closures saved while the response was in flight.
				base.removeLocalWhere((day) => day.type === 'federal-holiday');
				base.appendLocal(allDays.filter((day) => day.type === 'federal-holiday'));
				return 'saved';
			} catch (error) {
				if (!currentReset(orgId, requestReset)) return 'stale';
				throw error;
			}
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
