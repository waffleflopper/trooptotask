/**
 * Status types store. The named availability statuses (e.g., "Leave", "TDY") for the org,
 * in the saved legend and picker order.
 *
 * `setOrder(ids)` saves a new order through one compare-and-replace command. Moves made while
 * it is in flight fold into one follow-up save. Create, update and delete are refused until it settles.
 * Loaded by the calendar and dashboard page load functions.
 */
import { defineStore, stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import { statusTypesSchema, type StatusType } from '$features/calendar/contracts';
import { confirmedNotSaved } from './calendarCommandResponse';

/** The fields an operator edits. Order changes only through `setOrder`. */
export type StatusTypeDraft = Pick<StatusType, 'name' | 'color' | 'textColor' | 'shortLabel'>;

export type StatusOrderChange =
	| { status: 'saved' | 'stale' | 'busy' }
	| { status: 'not-saved'; message: string; showsSaved: boolean }
	| { status: 'unconfirmed'; showsSaved: boolean };

type OrderFlight = {
	readonly orgId: string;
	readonly inLifetime: () => boolean;
	readonly done: Promise<StatusOrderChange>;
};

interface StatusTypeExtensions extends Record<string, unknown> {
	readonly orderBusy: boolean;
	/** The order being saved, or null when no order save is in flight. */
	readonly pendingOrder: readonly string[] | null;
	add: (data: StatusTypeDraft) => Promise<StatusType | null>;
	update: (id: string, data: Partial<StatusTypeDraft>) => Promise<boolean>;
	remove: (id: string) => Promise<boolean>;
	setOrder: (ids: readonly string[]) => Promise<StatusOrderChange>;
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((id, index) => id === b[index]);

async function responseMessage(res: Response): Promise<string> {
	const fallback = 'The status order was not saved.';
	const raw = await res.text().catch(() => '');
	try {
		const parsed = JSON.parse(raw) as { message?: string };
		return parsed.message ?? fallback;
	} catch {
		return raw || fallback;
	}
}

function failureMessage(result: Extract<StatusOrderChange, { status: 'not-saved' | 'unconfirmed' }>): string {
	if (result.status === 'not-saved') {
		return result.showsSaved ? result.message : `${result.message} Reload to see the saved order.`;
	}
	return result.showsSaved
		? "We couldn't confirm the status order change. The list shows the saved order."
		: "We couldn't confirm the status order change. Reload to see the saved order.";
}

function enhance(base: Store<StatusType>): StatusTypeExtensions {
	let flight = $state.raw<OrderFlight | null>(null);
	let desired = $state.raw<readonly string[]>([]);

	function currentFlight(): OrderFlight | null {
		return flight && flight.inLifetime() && flight.orgId === base.orgId ? flight : null;
	}

	async function adoptSavedIfUnchanged(orgId: string, owns: () => boolean): Promise<boolean> {
		const loadVersion = base.loadVersion;
		try {
			const res = await withinOrganizationLifetime(fetch(`/org/${orgId}/api/status-types`));
			if (!res.ok || !owns()) return false;
			const saved = statusTypesSchema.safeParse(await withinOrganizationLifetime(res.json()));
			if (!saved.success || !owns() || base.loadVersion !== loadVersion) return false;
			base.load(saved.data, orgId);
			return true;
		} catch {
			return false;
		}
	}

	function report(owner: OrderFlight, result: StatusOrderChange): StatusOrderChange {
		if (currentFlight() !== owner) return { status: 'stale' };
		if (result.status === 'not-saved' || result.status === 'unconfirmed') toastStore.error(failureMessage(result));
		return result;
	}

	function applySavedOrder(sent: readonly string[]) {
		base.updateLocalWhere(
			(type) => type.sortOrder !== sent.indexOf(type.id),
			(type) => ({ ...type, sortOrder: sent.indexOf(type.id) })
		);
	}

	// Moves made while a save is in flight fold into one follow-up save of the
	// latest order, sent with the order the previous save confirmed.
	async function run(owner: OrderFlight): Promise<StatusOrderChange> {
		const owns = () => currentFlight() === owner;
		let expected: readonly string[] = base.items.map((type) => type.id);
		try {
			for (;;) {
				const sent = desired;
				const loadVersion = base.loadVersion;
				let res: Response;
				try {
					res = await withinOrganizationLifetime(
						fetch(`/org/${owner.orgId}/api/status-types/order`, {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ statusTypeIds: sent, expectedStatusTypeIds: expected })
						})
					);
				} catch {
					return report(owner, { status: 'unconfirmed', showsSaved: await adoptSavedIfUnchanged(owner.orgId, owns) });
				}
				if (!owns()) return { status: 'stale' };
				if (res.ok && base.loadVersion === loadVersion) {
					applySavedOrder(sent);
				} else if (res.ok) {
					const showsSaved = await adoptSavedIfUnchanged(owner.orgId, owns);
					if (
						!showsSaved ||
						!sameIds(
							base.items.map((type) => type.id),
							sent
						)
					) {
						return report(owner, { status: 'unconfirmed', showsSaved });
					}
				} else {
					const message = confirmedNotSaved(res) ? await withinOrganizationLifetime(responseMessage(res)) : null;
					const showsSaved = await adoptSavedIfUnchanged(owner.orgId, owns);
					return report(
						owner,
						message === null ? { status: 'unconfirmed', showsSaved } : { status: 'not-saved', message, showsSaved }
					);
				}
				if (sameIds(desired, sent)) return report(owner, { status: 'saved' });
				expected = sent;
			}
		} finally {
			if (flight === owner) flight = null;
		}
	}

	return {
		get orderBusy() {
			return currentFlight() !== null;
		},

		get pendingOrder() {
			return currentFlight() ? desired : null;
		},

		async add(data: StatusTypeDraft) {
			if (currentFlight()) return null;
			// The server appends the new type; until it replies, the row without a position sorts last.
			return base.add(data as Omit<StatusType, 'id'>);
		},

		async update(id: string, data: Partial<StatusTypeDraft>) {
			if (currentFlight()) return false;
			return base.update(id, data);
		},

		async remove(id: string) {
			if (currentFlight()) return false;
			return base.removeBool(id);
		},

		setOrder(ids: readonly string[]): Promise<StatusOrderChange> {
			if (base.busy) return Promise.resolve({ status: 'busy' });
			const current = currentFlight();
			desired = [...ids];
			if (current) return current.done;
			const done = Promise.withResolvers<StatusOrderChange>();
			const owner: OrderFlight = { orgId: base.orgId, inLifetime: stillInOrganizationLifetime(), done: done.promise };
			flight = owner;
			done.resolve(run(owner));
			return owner.done;
		}
	};
}

export const statusTypesStore = defineStore<StatusType, StatusTypeExtensions>(
	{ table: 'status_types', orderBy: [{ field: 'sortOrder' }, { field: 'id' }] },
	enhance
);
