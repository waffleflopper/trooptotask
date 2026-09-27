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
	remove: (id: string) => Promise<boolean>;
	resetFederalHolidays: () => Promise<'saved' | 'failed' | 'stale'>;
	getByDate: (date: Date) => SpecialDay | undefined;
	isSpecialDay: (date: Date) => boolean;
	getByYear: (year: number) => SpecialDay[];
}

function enhance(base: Store<SpecialDay>): SpecialDayExtensions {
	let generation = 0;
	let resetSequence = 0;
	const latestResetByOrg: Record<string, number> = {};
	return {
		load(items, orgId) {
			generation++;
			base.load(items, orgId);
		},
		remove: base.removeBool,

		async resetFederalHolidays(): Promise<'saved' | 'failed' | 'stale'> {
			const orgId = base.orgId;
			const requestGeneration = ++generation;
			const requestReset = ++resetSequence;
			latestResetByOrg[orgId] = requestReset;
			try {
				const res = await fetch(`/org/${orgId}/api/special-days`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'resetFederalHolidays' })
				});
				if (base.orgId !== orgId || latestResetByOrg[orgId] !== requestReset) return 'stale';
				if (!res.ok) return 'failed';
				const allDays = (await res.json()) as SpecialDay[];
				if (base.orgId !== orgId || latestResetByOrg[orgId] !== requestReset) return 'stale';
				if (generation !== requestGeneration) {
					// A newer load may contain closures outside the reset response's date range.
					base.removeLocalWhere((day) => day.type === 'federal-holiday');
					base.appendLocal(allDays.filter((day) => day.type === 'federal-holiday'));
				} else {
					base.removeLocalWhere(() => true);
					base.appendLocal(allDays);
				}
				return 'saved';
			} catch (error) {
				if (base.orgId !== orgId || latestResetByOrg[orgId] !== requestReset) return 'stale';
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
