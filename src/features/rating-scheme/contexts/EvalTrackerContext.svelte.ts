import type { PersonnelLookup } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { RatingSchemeAffordance, RatingSchemePageAccess } from '../contracts';
import type { Evaluation, RatingScheme, RatingSchemeEntry, ReportType, WorkflowStatus } from '../rating-scheme.types';
import { evaluationStore, ratingSchemeEntries, ratingSchemeStore } from '../stores/ratingScheme.svelte';
import {
	byUrgency,
	isTrackerListed,
	readyToStart,
	type ReadyToStart,
	type TrackerStatusFilter
} from '../utils/evalTracker';
import { isEvaluationCompleted } from '../utils/evaluationWorkflow';
import { ratingDueCounts } from '../utils/ratingScheme';
import { createChainSearch } from '../utils/ratingSchemeSearch';

export interface EvalTrackerData {
	orgId: string;
	orgName: string;
	personnelLookup: PersonnelLookup[];
}

export interface EvalTrackerSources {
	readonly entries: { readonly items: readonly RatingSchemeEntry[] };
	readonly schemes: { readonly items: readonly RatingScheme[] };
	readonly evaluations: { readonly items: readonly Evaluation[] };
}

export const EVALUATION_SHEET_MODAL = 'evaluation-sheet';
export const START_EVALUATION_MODAL = 'start-evaluation';

/** `fromUrl` marks a sheet the address names, so Back closes it. */
export interface EvaluationSheetPayload {
	evaluationId: string;
	fromUrl: boolean;
}

export interface StartEvaluationPayload {
	ratingSchemeId: string | null;
	fromUrl: boolean;
}

/** `?entry=<evaluation id>` opens that Evaluation; `?start=<scheme id>` opens Start evaluation on that scheme. */
export const ENTRY_PARAM = 'entry';
export const START_PARAM = 'start';

export type TrackerStepFilter = 'all' | 'not-tracked' | WorkflowStatus;

const defaultSources: EvalTrackerSources = {
	entries: ratingSchemeEntries,
	schemes: ratingSchemeStore,
	evaluations: evaluationStore
};

/** What the Eval Tracker shows and controls: the Evaluations in work by urgency, the schemes ready to start, and the sheets. */
export class EvalTrackerContext {
	searchQuery = $state('');
	status = $state<TrackerStatusFilter>('open');
	reportFilter = $state<'all' | ReportType>('all');
	stepFilter = $state<TrackerStepFilter>('all');

	readonly #data: EvalTrackerData;
	readonly #modals: ModalRegistry;
	readonly #org: RatingSchemePageAccess;
	readonly #sources: EvalTrackerSources;

	constructor(
		data: EvalTrackerData,
		modals: ModalRegistry,
		org: RatingSchemePageAccess,
		sources: EvalTrackerSources = defaultSources
	) {
		this.#data = data;
		this.#modals = modals;
		this.#org = org;
		this.#sources = sources;
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

	#search(): (chain: Parameters<ReturnType<typeof createChainSearch>>[0]) => boolean {
		return createChainSearch(this.searchQuery, this.#data.personnelLookup);
	}

	/** Every Evaluation the status filter lists, before search, report and step narrow it. */
	get listed(): RatingSchemeEntry[] {
		return this.#sources.entries.items.filter((entry) => isTrackerListed(entry, this.status));
	}

	get rows(): RatingSchemeEntry[] {
		const matches = this.#search();
		const rows = this.listed.filter(
			(entry) =>
				(this.reportFilter === 'all' || entry.reportType === this.reportFilter) &&
				(this.stepFilter === 'all' ||
					(this.stepFilter === 'not-tracked'
						? entry.workflowStatus === null
						: entry.workflowStatus === this.stepFilter)) &&
				matches(entry)
		);
		return byUrgency(rows);
	}

	/** Shown beside open work; a report or step filter is about Evaluations, so it hides them. */
	get ready(): ReadyToStart[] {
		if (this.status === 'completed' || this.reportFilter !== 'all' || this.stepFilter !== 'all') return [];
		const matches = this.#search();
		return readyToStart(this.#sources.schemes.items, this.#sources.evaluations.items).filter(({ scheme }) =>
			matches(scheme)
		);
	}

	/** Every scheme ready to start, for the Start sheet's picker, whatever the filters. */
	get startable(): ReadyToStart[] {
		return readyToStart(this.#sources.schemes.items, this.#sources.evaluations.items);
	}

	get completedCount(): number {
		return this.#sources.entries.items.filter((entry) => isEvaluationCompleted(entry.workflowStatus)).length;
	}

	/** The header: Evaluations in work, and how many of them are past thru or near it. Matches the tab's past-thru count. */
	get summary(): { open: number; overdue: number; 'due-30': number; 'due-60': number } {
		const items = this.#sources.entries.items;
		return {
			open: items.filter((entry) => isTrackerListed(entry, 'open')).length,
			...ratingDueCounts(items)
		};
	}

	get hasActiveSearchOrFilters(): boolean {
		return (
			!!this.searchQuery.trim() || this.status !== 'open' || this.reportFilter !== 'all' || this.stepFilter !== 'all'
		);
	}

	clearSearchAndFilters(): void {
		this.searchQuery = '';
		this.status = 'open';
		this.reportFilter = 'all';
		this.stepFilter = 'all';
	}

	get sheet(): EvaluationSheetPayload | undefined {
		return this.#modals.payload<EvaluationSheetPayload>(EVALUATION_SHEET_MODAL);
	}

	get start(): StartEvaluationPayload | undefined {
		return this.#modals.payload<StartEvaluationPayload>(START_EVALUATION_MODAL);
	}

	openEvaluation(evaluationId: string, fromUrl = false): void {
		this.#modals.open(EVALUATION_SHEET_MODAL, { evaluationId, fromUrl } satisfies EvaluationSheetPayload);
	}

	openStart(ratingSchemeId: string | null, fromUrl = false): void {
		this.#modals.open(START_EVALUATION_MODAL, { ratingSchemeId, fromUrl } satisfies StartEvaluationPayload);
	}

	/**
	 * Follows the address after every navigation: a sheet it names opens, and one it opened closes once Back or another
	 * link leaves it. A viewer who may not edit is not offered either sheet.
	 */
	followAddress(url: { readonly searchParams: Pick<URLSearchParams, 'get'> }): void {
		const entry = url.searchParams.get(ENTRY_PARAM);
		const start = url.searchParams.get(START_PARAM);
		const allowed = this.writeAffordance.allowed;
		if (entry && allowed) this.openEvaluation(entry, true);
		else if (this.sheet?.fromUrl) this.#modals.close(EVALUATION_SHEET_MODAL);
		if (start && allowed) this.openStart(start, true);
		else if (this.start?.fromUrl) this.#modals.close(START_EVALUATION_MODAL);
	}
}
