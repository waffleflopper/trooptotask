import {
	buildRequestError,
	defineStore,
	organizationLifetime,
	rejectedRequestMessage,
	withinOrganizationLifetime
} from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import { z } from 'zod';
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

export type ClosureDaysResult =
	/** `skipped` counts requested dates the server found already taken. */
	| { status: 'saved'; created: SpecialDay[]; skipped: number }
	| { status: 'not-saved'; message: string }
	| { status: 'unconfirmed' | 'unconfirmed-unrefreshed' | 'stale' };

const CLOSURE_NOT_SAVED = 'This closure was not saved. Try again.';
const closureDaysReply = z.object({ created: specialDaysSchema });

interface SpecialDayExtensions extends Record<string, unknown> {
	load: Store<SpecialDay>['load'];
	addClosureDays: (draft: { name: string; dates: readonly string[] }) => Promise<ClosureDaysResult>;
	update: Store<SpecialDay>['update'];
	updateOrThrow: Store<SpecialDay>['updateOrThrow'];
	remove: (id: string) => Promise<boolean>;
	resetFederalHolidays: () => Promise<FederalHolidayResetResult>;
	getByDate: (date: Date) => SpecialDay | undefined;
	isSpecialDay: (date: Date) => boolean;
	getByYear: (year: number) => SpecialDay[];
}

function enhance(base: Store<SpecialDay>): SpecialDayExtensions {
	let resetSequence = 0;
	let loadGeneration = 0;
	// Bumped when another Organization loads, so a request from a visit the user left stays stale on return.
	let organizationVisit = 0;
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
	/** Rereads every day once no mutation overlaps the read; `isCurrent` says the caller still wants the answer. */
	async function refreshAfterOverlappingMutation(
		orgId: string,
		isCurrent: () => boolean
	): Promise<'saved' | 'stale' | 'refresh-failed'> {
		const state = mutationState(orgId);
		for (let attempt = 0; attempt < 3; attempt++) {
			await Promise.allSettled(state.pending);
			if (!isCurrent()) return 'stale';
			const version = state.version;
			const requestLoadGeneration = loadGeneration;
			const read = base.beginAdoption();
			try {
				const response = await withinOrganizationLifetime(fetch(`/org/${orgId}/api/special-days`));
				if (!response.ok) return 'refresh-failed';
				const savedDays = specialDaysSchema.safeParse(await withinOrganizationLifetime(response.json()));
				if (!isCurrent()) return 'stale';
				if (!savedDays.success) return 'refresh-failed';
				if (state.version !== version || state.pending.length > 0 || loadGeneration !== requestLoadGeneration) {
					continue;
				}
				// A read of every day, not a confirmed change, so it supersedes older snapshots.
				base.load(read.adopt(savedDays.data), orgId);
				return 'saved';
			} catch {
				return isCurrent() ? 'refresh-failed' : 'stale';
			} finally {
				read.close();
			}
		}
		return 'refresh-failed';
	}
	async function unconfirmed(orgId: string, isCurrent: () => boolean) {
		const refreshed = await refreshAfterOverlappingMutation(orgId, isCurrent);
		return refreshed === 'saved' ? 'unconfirmed' : refreshed === 'stale' ? 'stale' : 'unconfirmed-unrefreshed';
	}
	async function submitClosureDays(
		orgId: string,
		name: string,
		dates: readonly string[],
		isCurrent: () => boolean
	): Promise<ClosureDaysResult | 'unconfirmed'> {
		let res: Response;
		try {
			res = await withinOrganizationLifetime(
				fetch(`/org/${orgId}/api/special-days`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'addClosureDays', name, dates })
				})
			);
		} catch {
			return isCurrent() ? 'unconfirmed' : { status: 'stale' };
		}
		if (!isCurrent()) return { status: 'stale' };
		if (!res.ok) {
			if (!confirmedNotSaved(res)) return 'unconfirmed';
			const rejection = await withinOrganizationLifetime(buildRequestError(res, 'POST', 'special-days'));
			return { status: 'not-saved', message: rejectedRequestMessage(rejection, CLOSURE_NOT_SAVED) };
		}
		const reply = closureDaysReply.safeParse(await withinOrganizationLifetime(res.json()).catch(() => null));
		if (!isCurrent()) return { status: 'stale' };
		if (!reply.success) return 'unconfirmed';
		base.appendLocal(reply.data.created);
		return { status: 'saved', created: reply.data.created, skipped: dates.length - reply.data.created.length };
	}
	return {
		load(items, orgId) {
			loadGeneration++;
			// Mutations from an Organization the user left never settle, so a later reset must not wait on them.
			if (orgId !== base.orgId) {
				mutationsByOrg = {};
				organizationVisit++;
			}
			base.load(items, orgId);
		},
		async addClosureDays({ name, dates }) {
			const orgId = base.orgId;
			const visit = organizationVisit;
			const isCurrent = () => base.orgId === orgId && organizationVisit === visit;
			const outcome = await trackMutation(orgId, submitClosureDays(orgId, name, dates, isCurrent));
			if (outcome !== 'unconfirmed') return outcome;
			// Settled outside the tracked request so the reread does not wait on itself.
			return { status: await unconfirmed(orgId, isCurrent) };
		},
		update: (id, data) => trackMutation(base.orgId, base.update(id, data)),
		updateOrThrow: (id, data) => trackMutation(base.orgId, base.updateOrThrow(id, data)),
		remove: (id) => trackMutation(base.orgId, base.removeBool(id)),

		async resetFederalHolidays(): Promise<FederalHolidayResetResult> {
			const orgId = base.orgId;
			const mutationVersion = mutationState(orgId).version;
			const requestLoadGeneration = loadGeneration;
			const requestReset = ++resetSequence;
			latestResetByOrg[orgId] = requestReset;
			const isCurrent = () => base.orgId === orgId && latestResetByOrg[orgId] === requestReset;
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
				return isCurrent() ? unconfirmed(orgId, isCurrent) : 'stale';
			}
			if (!isCurrent()) return 'stale';
			if (!res.ok) return confirmedNotSaved(res) ? 'not-saved' : unconfirmed(orgId, isCurrent);
			const savedHolidays = specialDaysSchema.safeParse(await withinOrganizationLifetime(res.json()).catch(() => null));
			if (!isCurrent()) return 'stale';
			if (!savedHolidays.success) return unconfirmed(orgId, isCurrent);
			const mutations = mutationState(orgId);
			if (
				mutations.version !== mutationVersion ||
				mutations.pending.length > 0 ||
				loadGeneration !== requestLoadGeneration
			) {
				const refreshed = await refreshAfterOverlappingMutation(orgId, isCurrent);
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

// The generic create methods would post the retired single-row body; closures are added through addClosureDays.
export const specialDaysStore: Omit<Store<SpecialDay>, 'add' | 'addBatch'> & SpecialDayExtensions = defineStore<
	SpecialDay,
	SpecialDayExtensions
>({ table: 'special_days' }, enhance);
