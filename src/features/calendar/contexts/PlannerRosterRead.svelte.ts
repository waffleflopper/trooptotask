import { plannerRostersSchema, rosterFillPreviewSchema, type RosterFillPreview } from '$features/calendar/contracts';
import { decodePlannerRosters, type RosterView } from '$features/calendar/utils/plannerRosters';
import { buildRequestError, withinOrganizationLifetime } from '$lib/stores/core';

export type PlannerRosterStatus = 'idle' | 'loading' | 'ready' | 'error';

type Request = { readonly orgId: string; readonly month: string; readonly today: string };

/**
 * Roster counts for one Organization month. A refresh keeps the shown counts until the new ones arrive,
 * and a reply for an Organization, month or request the planner has left is dropped.
 */
export class PlannerRosterRead {
	status = $state<PlannerRosterStatus>('idle');
	rosters = $state.raw<ReadonlyMap<string, RosterView>>(new Map());
	/** A refresh failed, so the shown counts may miss the latest write. */
	stale = $state(false);

	#request: Request | null = null;
	#serial = 0;

	/** Starts the read for `month` unless that month is already loaded or loading. */
	load(request: Request): void {
		const current = this.#request;
		if (
			current?.orgId === request.orgId &&
			current.month === request.month &&
			current.today === request.today &&
			this.status !== 'error'
		)
			return;
		const sameMonth = current?.orgId === request.orgId && current.month === request.month;
		this.#request = request;
		if (!sameMonth || this.status === 'error') {
			this.rosters = new Map();
			this.status = 'loading';
			this.stale = false;
		}
		void this.#read(request);
	}

	/** Reads the current month again after a write moved the counts. */
	refresh(): void {
		if (this.#request) void this.#read(this.#request);
	}

	retry(): void {
		if (!this.#request) return;
		if (this.status === 'error') this.status = 'loading';
		void this.#read(this.#request);
	}

	reset(): void {
		this.#serial += 1;
		this.#request = null;
		this.rosters = new Map();
		this.status = 'idle';
		this.stale = false;
	}

	async #read(request: Request): Promise<void> {
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
