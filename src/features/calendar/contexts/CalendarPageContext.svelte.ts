import type { Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry } from '$features/calendar/contracts';
import { buildAvailabilityTracks } from '$features/calendar/utils/availabilityTracks';
import {
	availabilityChangeDates,
	classifyAvailabilityWrite,
	type AvailabilityChange
} from '$features/calendar/utils/availabilityMutation';
import { toastStore } from '$lib/stores/toast.svelte';
import { formatDate } from '$lib/utils/dates';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { pinnedGroupsStore } from '$features/personnel';
import { groupsStore } from '$features/personnel';
import { createRosterReadModel } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
import { loadCalendarRange } from '$features/calendar/utils/calendarRangeLoader';
import { rangeCoversSpan } from '$features/calendar/utils/calendarRange';
import { withinOrganizationLifetime } from '$lib/stores/core';
import type { CapabilityLevel, ScopeSet } from '$lib/access/memberAccessShape';
import type { FeatureLanePolicyAction, PolicyDecision } from '$lib/access/policyEvaluator';
import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';
import { SvelteDate } from 'svelte/reactivity';
import { evaluateUpcomingLosses, type UpcomingLossRecord } from '$features/personnel/contracts';

const CALENDAR_WORKSPACE_RESOURCE: PolicyResource = { kind: 'unscoped' };

export interface CalendarRosterFilterOption {
	value: string;
	label: string;
	count?: number;
}

/** The page's one floating surface. Opening any of them closes the others. */
export type CalendarPopover =
	| {
			readonly kind: 'quick-add';
			readonly person: Personnel;
			readonly startDate: string;
			readonly endDate: string;
			readonly anchor: HTMLElement;
	  }
	| { readonly kind: 'entry'; readonly person: Personnel; readonly entryId: string; readonly anchor: HTMLElement }
	| {
			readonly kind: 'overflow';
			readonly person: Personnel;
			readonly entryIds: readonly string[];
			readonly anchor: HTMLElement;
	  }
	| { readonly kind: 'duty'; readonly typeId: string; readonly date: Date; readonly anchor: HTMLElement };

export type AvailabilityEditorRequest =
	| {
			readonly kind: 'create';
			readonly person: Personnel;
			readonly startDate: string;
			readonly endDate: string;
			readonly statusTypeId?: string;
	  }
	| { readonly kind: 'edit'; readonly person: Personnel; readonly entry: AvailabilityEntry };

/**
 * `unconfirmed` means neither the reply nor a re-read could say whether the write landed.
 * `stale` means there is nothing to report, because the page moved to other access or another
 * write was still settling.
 */
export type AvailabilityOutcome = 'saved' | 'not-saved' | 'unconfirmed' | 'stale';

export interface CalendarDisplayPreferences {
	showStatusText: boolean;
	showPersonnelRoles: boolean;
	highlightOnboarding: boolean;
}

export interface CalendarPageAccess {
	readonly userId: string | null;
	readonly role: 'owner' | 'admin' | 'member';
	readonly capabilityMap: { readonly calendar: CapabilityLevel };
	readonly scopeSet: ScopeSet;
	readonly affordanceForFeatureAction: (
		action: FeatureLanePolicyAction,
		resource?: PolicyResource
	) => { readonly allowed: boolean; readonly reason: PolicyDecision['reasonCode'] };
}

// ---------------------------------------------------------------------------
// Page data shape (subset of layout + page server data)
// ---------------------------------------------------------------------------

export interface CalendarPageData {
	orgId: string;
	orgName?: string;
	userId?: string | null;
	personnel?: Personnel[];
	allPersonnel?: Personnel[];
	calendar?: {
		data?: CalendarWorkspaceData;
	};
	activeOnboardingPersonnelIds?: string[];
	// Allow additional layout fields to pass through without type errors
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Context class
// ---------------------------------------------------------------------------

export class CalendarPageContext {
	// ---- page data (reactive getter — always reads current $props value) ---
	readonly #getData: () => CalendarPageData;
	get #data(): CalendarPageData {
		return this.#getData();
	}

	// ---- injected deps -----------------------------------------------------
	readonly #org: CalendarPageAccess;
	readonly #savePreferences: (patch: Partial<CalendarDisplayPreferences>) => void;

	#calendarAccessKey(): string {
		return JSON.stringify([this.#org.userId, this.#org.role, this.#org.capabilityMap.calendar, this.#org.scopeSet]);
	}

	// ---- selection state ---------------------------------------------------
	popover = $state.raw<CalendarPopover | null>(null);
	editor = $state.raw<AvailabilityEditorRequest | null>(null);
	assignmentDate = $state<Date | null>(null);
	savingAvailability = $state(false);

	// ---- view mode ---------------------------------------------------------
	viewMode = $state<'month' | '3-month'>('month');

	// ---- display prefs -----------------------------------------------------
	showStatusText = $state(false);
	showPersonnelRoles = $state(false);
	highlightOnboarding = $state(true);
	calendarGroupFilter = $state('');
	calendarPersonnelSearch = $state('');

	get #workspaceData() {
		return this.#data.calendar?.data;
	}

	// ---- derived: personnel ------------------------------------------------
	get calendarPersonnel(): Personnel[] {
		return (
			this.#workspaceData?.allPersonnel ??
			this.#workspaceData?.personnel ??
			(this.#data.allPersonnel as Personnel[] | undefined) ??
			(this.#data.personnel as Personnel[] | undefined) ??
			[]
		);
	}

	get scopedPersonnelIds(): Set<string> {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- This getter returns a plain Set as public context data; it is not mutated as component state.
		return new Set(
			(this.#workspaceData?.personnel ?? (this.#data.personnel as Personnel[] | undefined) ?? []).map((p) => p.id)
		);
	}

	// ---- derived: onboarding data ------------------------------------------
	get activeOnboardingPersonnelIds(): string[] {
		return this.#workspaceData?.activeOnboardingPersonnelIds ?? this.#data.activeOnboardingPersonnelIds ?? [];
	}

	// ---- derived: permission flags -----------------------------------------

	get isHydrating(): boolean {
		return (
			availabilityStore.loading ||
			statusTypesStore.loading ||
			specialDaysStore.loading ||
			dailyAssignmentsStore.loading ||
			groupsStore.loading
		);
	}

	get canManageConfig(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.configureStatusTypes).allowed;
	}

	get canViewCalendar(): boolean {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.calendar.viewAvailability,
			CALENDAR_WORKSPACE_RESOURCE
		).allowed;
	}

	get canManageAvailability(): boolean {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.calendar.manageAvailability,
			CALENDAR_WORKSPACE_RESOURCE
		).allowed;
	}

	get canManageAssignments(): boolean {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.calendar.manageAssignments,
			CALENDAR_WORKSPACE_RESOURCE
		).allowed;
	}

	// ---- derived: personnel groupings --------------------------------------
	// Computed once per input change, so a search keystroke rebuilds only the roster (#1570).
	readonly #calendarRoster = $derived(
		createRosterReadModel({
			personnel: this.calendarPersonnel,
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: this.#data.orgName ?? ''
		})
	);
	readonly #scopedRoster = $derived.by(() => this.#calendarRoster.scoped(this.#org.scopeSet, { status: 'active' }));

	readonly personnelByGroup = $derived(this.#calendarRoster.full({ status: 'active' }).personnelByGroup);

	get scopedPBG() {
		return this.#scopedRoster.personnelByGroup;
	}

	get allPersonnelFlat(): Personnel[] {
		return this.#scopedRoster.flatPersonnel;
	}

	get groupFilterOptions(): CalendarRosterFilterOption[] {
		return this.#scopedRoster.groupFilterOptions;
	}

	readonly filteredPBG = $derived.by(
		() =>
			this.#calendarRoster.scoped(this.#org.scopeSet, {
				status: 'active',
				groupFilter: this.calendarGroupFilter,
				search: this.calendarPersonnelSearch
			}).personnelByGroup
	);

	/** Rebuilt only by entry and status type changes, never by the roster, search or filters. */
	readonly availabilityTracks = $derived(buildAvailabilityTracks(availabilityStore.items, statusTypesStore.items));

	// ---- reference date (for upcoming-loss evaluation) --------------------
	/**
	 * Calendar date used as "today" when evaluating upcoming losses.
	 * Injectable via the fourth constructor argument so tests can pin the date
	 * without real-time dependencies.
	 */
	readonly #today: string;

	// ---- derived: upcoming losses ------------------------------------------

	/**
	 * Map of personId → UpcomingLossRecord for personnel inside the org's
	 * configured loss warning window.  Consumed by CalendarRow to render
	 * per-row indicators without duplicating date-threshold arithmetic.
	 *
	 * Reuses the same evaluation path as the dashboard widget so the calendar
	 * and dashboard always agree on who is approaching a loss event.
	 */
	readonly upcomingLossMap: ReadonlyMap<string, UpcomingLossRecord> = $derived.by(() => {
		const windowDays = this.#workspaceData?.lossWarningWindowDays ?? 180;
		const losses = evaluateUpcomingLosses(this.calendarPersonnel, windowDays, this.#today);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- A fresh read-only map per derivation; never mutated.
		return new Map(losses.map((record) => [record.personId, record]));
	});

	// ---- constructor -------------------------------------------------------
	constructor(
		getData: CalendarPageData | (() => CalendarPageData),
		org: CalendarPageAccess,
		savePreferences: (patch: Partial<CalendarDisplayPreferences>) => void,
		today?: string
	) {
		this.#getData = typeof getData === 'function' ? getData : () => getData;
		this.#org = org;
		this.#savePreferences = savePreferences;

		// Pin to the provided date or fall back to the local calendar date
		const now = new SvelteDate();
		this.#today =
			today ??
			`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	}

	// ---- lifecycle methods (called from route $effect) ---------------------

	syncUserPreferences(preferences: CalendarDisplayPreferences): void {
		this.showStatusText = preferences.showStatusText;
		this.showPersonnelRoles = preferences.showPersonnelRoles;
		this.highlightOnboarding = preferences.highlightOnboarding;
	}

	// ---- handlers ----------------------------------------------------------

	toggleViewMode(): void {
		this.viewMode = this.viewMode === 'month' ? '3-month' : 'month';
	}

	navigateToMonth(date: Date): void {
		this.viewMode = 'month';
		calendarStore.goToMonth(date.getFullYear(), date.getMonth());
	}

	toggleHighlightOnboarding(): void {
		this.highlightOnboarding = !this.highlightOnboarding;
		this.#savePreferences({ highlightOnboarding: this.highlightOnboarding });
	}

	toggleShowStatusText(): void {
		this.showStatusText = !this.showStatusText;
		this.#savePreferences({ showStatusText: this.showStatusText });
	}

	toggleShowPersonnelRoles(): void {
		this.showPersonnelRoles = !this.showPersonnelRoles;
		this.#savePreferences({ showPersonnelRoles: this.showPersonnelRoles });
	}

	setCalendarGroupFilter(value: string): void {
		this.calendarGroupFilter = value;
	}

	setCalendarPersonnelSearch(value: string): void {
		this.calendarPersonnelSearch = value;
	}

	handlePinToggle(group: string): void {
		pinnedGroupsStore.toggle(group);
	}

	handleCellClick(person: Personnel, date: Date): void {
		const dateKey = formatDate(date);
		this.openEditor({ kind: 'create', person, startDate: dateKey, endDate: dateKey });
	}

	handlePersonClick(person: Personnel): void {
		this.openEditor({ kind: 'create', person, startDate: this.#today, endDate: this.#today });
	}

	openEditor(request: AvailabilityEditorRequest): void {
		if (!this.canManageAvailabilityFor(request.person)) return;
		this.popover = null;
		this.editor = request;
	}

	closeEditor(): void {
		this.editor = null;
	}

	openQuickAdd(person: Personnel, startDate: string, endDate: string, anchor: HTMLElement): void {
		if (!this.canManageAvailabilityFor(person)) return;
		this.popover = { kind: 'quick-add', person, startDate, endDate, anchor };
	}

	openEntry(person: Personnel, entryId: string, anchor: HTMLElement): void {
		this.popover = { kind: 'entry', person, entryId, anchor };
	}

	openOverflow(person: Personnel, entryIds: readonly string[], anchor: HTMLElement): void {
		this.popover = { kind: 'overflow', person, entryIds, anchor };
	}

	openDutyPicker(typeId: string, date: Date, anchor: HTMLElement): void {
		if (!this.canManageAssignments) return;
		this.popover = { kind: 'duty', typeId, date, anchor };
	}

	closePopover(): void {
		this.popover = null;
	}

	/**
	 * One request for the change. When its reply is refused or lost, one re-read of the affected
	 * dates decides the outcome, so a retry never duplicates a write that landed. Never retries.
	 */
	async saveAvailability(change: AvailabilityChange): Promise<AvailabilityOutcome> {
		if (this.savingAvailability) return 'stale';
		this.savingAvailability = true;
		const orgId = this.#data.orgId;
		const accessKey = this.#calendarAccessKey();
		const current = () => this.#data.orgId === orgId && this.#calendarAccessKey() === accessKey;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- A snapshot of ids before the write; never mutated.
		const knownIds = new Set(availabilityStore.items.map((entry) => entry.id));
		try {
			const confirmed = await writeAvailability(change).catch(() => false);
			if (!current()) return 'stale';
			if (confirmed) {
				announceSaved(change);
				return 'saved';
			}
			let reread: AvailabilityEntry[] | null;
			try {
				reread = await this.reconcileAvailability(availabilityChangeDates(change), orgId);
			} catch {
				toastStore.error('Could not confirm the saved status. Reload the calendar before trying again.');
				return 'unconfirmed';
			}
			if (reread === null) return 'stale';
			const outcome = classifyAvailabilityWrite(change, knownIds, reread);
			if (outcome === 'saved') announceSaved(change);
			else toastStore.error(`Could not ${change.kind === 'remove' ? 'remove' : 'save'} status. Try again.`);
			return outcome;
		} finally {
			this.savingAvailability = false;
		}
	}

	async reconcileAvailability(dates: string[], expectedOrgId: string): Promise<AvailabilityEntry[] | null> {
		if (this.#data.orgId !== expectedOrgId) return null;
		const accessKey = this.#calendarAccessKey();
		const read = availabilityStore.beginRead();
		try {
			let ranges: Awaited<ReturnType<typeof loadCalendarRange>>[];
			try {
				ranges = await withinOrganizationLifetime(
					Promise.all(
						[...new Set(dates)].map((date) => loadCalendarRange(expectedOrgId, { rangeStart: date, rangeEnd: date }))
					)
				);
			} catch (error) {
				if (this.#data.orgId !== expectedOrgId || this.#calendarAccessKey() !== accessKey) return null;
				throw error;
			}
			if (this.#data.orgId !== expectedOrgId || this.#calendarAccessKey() !== accessKey) return null;
			for (const range of ranges) {
				availabilityStore.load(
					availabilityStore.orgId === expectedOrgId
						? read.reconcile(range.availabilityEntries, rangeCoversSpan(range))
						: range.availabilityEntries,
					expectedOrgId
				);
			}
			return [
				...new Map(ranges.flatMap((range) => range.availabilityEntries.map((entry) => [entry.id, entry]))).values()
			];
		} finally {
			read.close();
		}
	}

	handleDateClick(date: Date): void {
		this.assignmentDate = date;
	}

	closeAssignmentModal(): void {
		this.assignmentDate = null;
	}

	canManageAvailabilityFor(person: Personnel): boolean {
		const resource = policyResourceForPersonnel(person);
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, resource).allowed;
	}
}

async function writeAvailability(change: AvailabilityChange): Promise<boolean> {
	switch (change.kind) {
		case 'create':
			return (await availabilityStore.add(change.record)) !== null;
		case 'update':
			return availabilityStore.update(change.entry.id, change.changes);
		case 'remove':
			return availabilityStore.removeBool(change.entry.id);
	}
}

function shortDate(dateKey: string): string {
	return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function announceSaved(change: AvailabilityChange): void {
	if (change.kind === 'remove') {
		toastStore.success('Status removed');
		return;
	}
	const values = change.kind === 'create' ? change.record : change.changes;
	const name = statusTypesStore.items.find((status) => status.id === values.statusTypeId)?.name ?? 'Status';
	const dates =
		values.startDate === values.endDate
			? shortDate(values.startDate)
			: `${shortDate(values.startDate)}–${shortDate(values.endDate)}`;
	toastStore.success(`${name} ${change.kind === 'create' ? 'added' : 'updated'} — ${dates}`, 5000);
}

function policyResourceForPersonnel(person: Personnel): PolicyResource {
	return person.groupId ? { kind: 'group', groupId: person.groupId } : { kind: 'organization' };
}
