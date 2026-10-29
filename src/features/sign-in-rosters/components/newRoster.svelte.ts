import type { GroupTree, Personnel, RankCatalogEntry } from '$features/personnel/contracts';
import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
import { formatToday } from '$lib/utils/dates';
import { emptySignInRosterFilter, filterSignInRosterPersonnel, type SignInRosterFilter } from '../signInRosterFilter';
import type { SignInRoster } from '../sign-in-rosters.types';
import { sortSignInRosterRows } from '../signInRosterRankOrder';

const SAVE_FAILED = 'Unable to save the roster.';

type Dimension = keyof SignInRosterFilter;

interface SignInRosterSnapshotRow {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	group: string;
	groupId: string | null;
}

interface Inputs {
	orgId: string;
	personnel: () => readonly Personnel[];
	tree: () => GroupTree;
	rankCatalog: () => readonly RankCatalogEntry[] | undefined;
}

/** The new-roster form: its fields, who they select, and the order that selection prints and saves in. */
export class NewRoster {
	#inputs: Inputs;
	#openedOn = formatToday();
	#disposed = false;

	title = $state('');
	date = $state(this.#openedOn);
	blankDate = $state(false);
	sortBy = $state<'alphabetical' | 'rank'>('alphabetical');
	separateByGroup = $state(false);
	filter = $state<SignInRosterFilter>(emptySignInRosterFilter());
	saving = $state(false);
	error = $state('');

	readonly people: Personnel[];
	readonly snapshot: SignInRosterSnapshotRow[];
	readonly hasFilter: boolean;
	readonly canSave: boolean;
	readonly dirty: boolean;

	constructor(inputs: Inputs) {
		this.#inputs = inputs;
		this.people = $derived(filterSignInRosterPersonnel(inputs.personnel(), this.filter, inputs.tree()));
		this.snapshot = $derived(
			sortSignInRosterRows(
				this.people.map((person) => ({
					id: person.id,
					rank: person.rank,
					lastName: person.lastName,
					firstName: person.firstName,
					group: person.groupName,
					groupId: person.groupId
				})),
				this.sortBy,
				inputs.rankCatalog()
			)
		);
		this.hasFilter = $derived(Object.values(this.filter).some((values) => values.length > 0));
		this.canSave = $derived(this.title.trim().length > 0 && this.people.length > 0);
		this.dirty = $derived(
			this.title !== '' ||
				this.blankDate ||
				this.sortBy !== 'alphabetical' ||
				this.separateByGroup ||
				this.hasFilter ||
				this.date !== this.#openedOn
		);
	}

	dispose() {
		this.#disposed = true;
	}

	setFilter(dimension: Dimension, values: readonly string[]) {
		this.filter[dimension] = [...values];
	}

	clearFilters() {
		this.filter = emptySignInRosterFilter();
	}

	/** Selects every rank of a shortcut, or drops them all when they are already all selected. */
	toggleRanks(ranks: readonly string[]) {
		if (ranks.length === 0) return;
		const all = ranks.every((rank) => this.filter.ranks.includes(rank));
		this.filter.ranks = all
			? this.filter.ranks.filter((rank) => !ranks.includes(rank))
			: [...this.filter.ranks, ...ranks.filter((rank) => !this.filter.ranks.includes(rank))];
	}

	/** Saves the roster. Resolves the stored roster, or null when it was refused or the sheet is no longer open. */
	async save(): Promise<SignInRoster | null> {
		if (!this.canSave || this.saving) return null;
		this.saving = true;
		this.error = '';
		const inOrganization = stillInOrganizationLifetime();
		const alive = () => !this.#disposed && inOrganization();
		const snapshot = $state.snapshot(this.snapshot);
		const rosterDate = this.blankDate ? null : this.date;
		const config = {
			title: this.title.trim(),
			rosterDate,
			blankDate: this.blankDate,
			separateByGroup: this.separateByGroup,
			sortBy: this.sortBy
		};

		try {
			const res = await withinOrganizationLifetime(
				fetch(`/org/${this.#inputs.orgId}/api/sign-in-rosters`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						...config,
						personnelIds: snapshot.map((person) => person.id),
						filterConfig: $state.snapshot(this.filter)
					})
				})
			);
			const payload = (await withinOrganizationLifetime(res.json().catch(() => ({})))) as SignInRoster & {
				message?: unknown;
			};
			if (!alive()) return null;
			if (!res.ok) {
				this.error = typeof payload.message === 'string' && payload.message ? payload.message : SAVE_FAILED;
				return null;
			}
			return payload as SignInRoster;
		} catch (err) {
			if (alive()) this.error = err instanceof Error ? err.message : SAVE_FAILED;
			return null;
		} finally {
			this.saving = false;
		}
	}
}
