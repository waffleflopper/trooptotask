import { SvelteSet } from 'svelte/reactivity';
import type { PersonnelLookup } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { RatingSchemeAffordance, RatingSchemePageAccess } from '../contracts';
import type { EvalType } from '../rating-scheme.types';
import { ratingSchemeEntries, ratingSchemeLines } from '../stores/ratingScheme.svelte';
import { ratingDueCounts } from '../utils/ratingScheme';
import { countChainRoles, type SchemeSort } from '../utils/ratingSchemeLineGroups';
import type { RatingSchemeLine } from '../utils/ratingSchemeLines';
import { createChainSearch } from '../utils/ratingSchemeSearch';

export interface RatingSchemeLinesData {
	orgId: string;
	orgName: string;
	personnelLookup: PersonnelLookup[];
}

interface LinesAccessor {
	readonly items: readonly RatingSchemeLine[];
}

interface PastThruAccessor {
	readonly items: Parameters<typeof ratingDueCounts>[0];
}

export const LINE_SHEET_MODAL = 'rating-scheme-line';
/** `?line=<scheme id>` opens that line's sheet, as the links on an Evaluation do. */
export const LINE_PARAM = 'line';

/** `fromUrl` marks a sheet the address names, so Back closes it. */
export interface LineSheetPayload {
	lineId: string | null;
	fromUrl?: boolean;
}
export const CHANGE_RATER_MODAL = 'rating-scheme-change-rater';

/** Which lines the Rating Scheme lists: those on it, those archived, or both. */
export type RatingSchemeListingFilter = 'on-scheme' | 'archived' | 'all';

/** How the Rating Scheme page is viewed, sorted, searched and filtered. The page keeps one per Organization, so a reload of its data leaves these choices alone. */
export class RatingSchemeLinesViewState {
	viewMode = $state<'grouped' | 'table'>('grouped');
	sort = $state<SchemeSort>('seniorRaterAZ');
	searchQuery = $state('');
	listing = $state<RatingSchemeListingFilter>('on-scheme');
	evalTypeFilter = $state<'all' | EvalType>('all');

	constructor(readonly orgId: string) {}
}

/** What the Rating Scheme page shows and controls: the chain lines, how they are filtered and grouped, and who may edit them. */
export class RatingSchemeLinesContext {
	readonly view: RatingSchemeLinesViewState;
	readonly #data: RatingSchemeLinesData;
	readonly #modals: ModalRegistry;
	readonly #org: RatingSchemePageAccess;
	readonly #lines: LinesAccessor;
	readonly #tracker: PastThruAccessor;

	constructor(
		data: RatingSchemeLinesData,
		modals: ModalRegistry,
		org: RatingSchemePageAccess,
		view: RatingSchemeLinesViewState = new RatingSchemeLinesViewState(data.orgId),
		lines: LinesAccessor = ratingSchemeLines,
		tracker: PastThruAccessor = ratingSchemeEntries
	) {
		this.view = view;
		this.#data = data;
		this.#modals = modals;
		this.#org = org;
		this.#lines = lines;
		this.#tracker = tracker;
	}

	get orgId(): string {
		return this.#data.orgId;
	}

	get orgName(): string {
		return this.#data.orgName;
	}

	get personnelLookup(): PersonnelLookup[] {
		return this.#data.personnelLookup;
	}

	get canViewRatingScheme(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.ratingScheme.viewEntries, { kind: 'unscoped' })
			.visible;
	}

	get writeAffordance(): RatingSchemeAffordance {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.ratingScheme.updateEntries, { kind: 'unscoped' });
	}

	get lines(): readonly RatingSchemeLine[] {
		return this.#lines.items;
	}

	get filteredLines(): RatingSchemeLine[] {
		let lines = [...this.#lines.items];
		if (this.view.listing !== 'all') {
			const onScheme = this.view.listing === 'on-scheme';
			lines = lines.filter((line) => (line.archivedAt === null) === onScheme);
		}
		if (this.view.evalTypeFilter !== 'all') lines = lines.filter((line) => line.evalType === this.view.evalTypeFilter);
		if (this.view.searchQuery.trim())
			lines = lines.filter(createChainSearch(this.view.searchQuery, this.#data.personnelLookup));
		return lines;
	}

	get hasActiveSearchOrFilters(): boolean {
		return !!this.view.searchQuery.trim() || this.view.listing !== 'on-scheme' || this.view.evalTypeFilter !== 'all';
	}

	clearSearchAndFilters(): void {
		this.view.searchQuery = '';
		this.view.listing = 'on-scheme';
		this.view.evalTypeFilter = 'all';
	}

	/** The header facts: lines on the scheme, their distinct senior raters and raters, and how many have an eval open. */
	get summary(): { onScheme: number; seniorRaters: number; raters: number; inProgress: number } {
		const onScheme = this.#lines.items.filter((line) => line.archivedAt === null);
		return {
			onScheme: onScheme.length,
			...countChainRoles(onScheme),
			inProgress: onScheme.filter((line) => line.open).length
		};
	}

	/** Open Evaluations past thru, which the Eval Tracker tab flags. */
	get pastThru(): number {
		return ratingDueCounts(this.#tracker.items).overdue;
	}

	/** People who already have a listed scheme; a person has at most one. */
	get listedPersonIds(): ReadonlySet<string> {
		return new SvelteSet(
			this.#lines.items.filter((line) => line.archivedAt === null).map((line) => line.ratedPersonId)
		);
	}

	get editingLineId(): string | null {
		return this.#modals.payload<LineSheetPayload>(LINE_SHEET_MODAL)?.lineId ?? null;
	}

	get sheetOpen(): boolean {
		return this.#modals.isOpen(LINE_SHEET_MODAL);
	}

	openNewLine(): void {
		this.#modals.open(LINE_SHEET_MODAL, { lineId: null });
	}

	openLine(line: RatingSchemeLine): void {
		this.#modals.open(LINE_SHEET_MODAL, { lineId: line.id } satisfies LineSheetPayload);
	}

	/** Opens the line an address names for a viewer who may edit it, and closes it once Back leaves that address. */
	followAddress(url: { readonly searchParams: Pick<URLSearchParams, 'get'> }): void {
		const lineId = url.searchParams.get(LINE_PARAM);
		if (lineId && this.writeAffordance.allowed && this.#lines.items.some((line) => line.id === lineId)) {
			this.#modals.open(LINE_SHEET_MODAL, { lineId, fromUrl: true } satisfies LineSheetPayload);
		} else if (this.#modals.payload<LineSheetPayload>(LINE_SHEET_MODAL)?.fromUrl) {
			this.#modals.close(LINE_SHEET_MODAL);
		}
	}
}
