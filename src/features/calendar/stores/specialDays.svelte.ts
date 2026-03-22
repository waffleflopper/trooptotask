import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import { formatDate } from '$lib/utils/dates';
import type { SpecialDay } from '$lib/types';

interface SpecialDayExtensions extends Record<string, unknown> {
	remove: (id: string) => Promise<boolean>;
	resetFederalHolidays: () => Promise<boolean>;
	getByDate: (date: Date) => SpecialDay | undefined;
	isSpecialDay: (date: Date) => boolean;
	getByYear: (year: number) => SpecialDay[];
}

function enhance(base: Store<SpecialDay>): SpecialDayExtensions {
	return {
		remove: base.removeBool,

		async resetFederalHolidays(): Promise<boolean> {
			const res = await fetch(`/org/${base.orgId}/api/special-days`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'resetFederalHolidays' })
			});
			if (!res.ok) return false;
			const allDays = await res.json();
			base.removeLocalWhere(() => true);
			base.appendLocal(allDays);
			return true;
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
