import type { Personnel, AvailabilityEntry } from '$lib/types';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { pinnedGroupsStore } from '$features/personnel';
import { groupsStore } from '$features/personnel';
import { createRosterReadModel } from '$features/personnel/contracts';
import { getBrowserLocalStorage } from '$lib/utils/browserStorage';
import { POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
import { queueUserPreferencesPatch } from '$lib/preferences/userPreferences.client';
import {
	getDefaultUserOrgPreferences,
	type UserOrgPreferences,
	type UserOrgPreferencesPatch
} from '$lib/preferences/userPreferences';
import { toastStore } from '$lib/stores/toast.svelte';
import { browser } from '$app/environment';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';
import { SvelteDate, SvelteMap } from 'svelte/reactivity';
import { evaluateUpcomingLosses, type UpcomingLossRecord } from '$lib/domain/readinessSignals';

const CALENDAR_WORKSPACE_RESOURCE: PolicyResource = { kind: 'unscoped' };

export interface CalendarRosterFilterOption {
	value: string;
	label: string;
	count?: number;
}

type MatchMediaFn = (query: string) => { matches: boolean };

function getDefaultMatchMedia(): MatchMediaFn | null {
	if (!browser || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return null;
	}

	return window.matchMedia.bind(window);
}

// ---------------------------------------------------------------------------
// Page data shape (subset of layout + page server data)
// ---------------------------------------------------------------------------

export interface CalendarPageData {
	orgId: string;
	orgName?: string;
	userId?: string | null;
	userPreferences?: UserOrgPreferences;
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
	readonly #org: OrgContext;

	// ---- selection state ---------------------------------------------------
	selectedPerson = $state<Personnel | null>(null);
	selectedDate = $state<Date | null>(null);
	assignmentDate = $state<Date | null>(null);

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
	get #calendarRoster() {
		return createRosterReadModel({
			personnel: this.calendarPersonnel,
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: this.#data.orgName ?? ''
		});
	}

	get personnelByGroup() {
		return this.#calendarRoster.full({ status: 'active' }).personnelByGroup;
	}

	get scopedPBG() {
		return this.#calendarRoster.scoped(this.#org.scopeSet, { status: 'active' }).personnelByGroup;
	}

	get allPersonnelFlat(): Personnel[] {
		return this.#calendarRoster.scoped(this.#org.scopeSet, { status: 'active' }).flatPersonnel;
	}

	get groupFilterOptions(): CalendarRosterFilterOption[] {
		return this.#calendarRoster.scoped(this.#org.scopeSet, { status: 'active' }).groupFilterOptions;
	}

	get groupFilteredPBG() {
		return this.#calendarRoster.scoped(this.#org.scopeSet, {
			status: 'active',
			groupFilter: this.calendarGroupFilter
		}).personnelByGroup;
	}

	get filteredPBG() {
		return this.#calendarRoster.scoped(this.#org.scopeSet, {
			status: 'active',
			groupFilter: this.calendarGroupFilter,
			search: this.calendarPersonnelSearch
		}).personnelByGroup;
	}

	// ---- reference date (for upcoming-loss evaluation) --------------------
	/**
	 * Calendar date used as "today" when evaluating upcoming losses.
	 * Injectable via the third constructor argument so tests can pin the date
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
	get upcomingLossMap(): SvelteMap<string, UpcomingLossRecord> {
		const warningWindowDays = this.#workspaceData?.lossWarningWindowDays ?? 180;
		const losses = evaluateUpcomingLosses(this.calendarPersonnel, warningWindowDays, this.#today);
		const map = new SvelteMap<string, UpcomingLossRecord>();
		for (const record of losses) {
			map.set(record.personId, record);
		}
		return map;
	}

	// ---- constructor -------------------------------------------------------
	constructor(getData: CalendarPageData | (() => CalendarPageData), org: OrgContext, today?: string) {
		this.#getData = typeof getData === 'function' ? getData : () => getData;
		this.#org = org;

		// Pin to the provided date or fall back to the local calendar date
		const now = new SvelteDate();
		this.#today =
			today ??
			`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	}

	// ---- lifecycle methods (called from route $effect) ---------------------

	syncUserPreferences(
		preferences: UserOrgPreferences | undefined,
		_matchMediaFn: MatchMediaFn | null = getDefaultMatchMedia()
	): void {
		const current = preferences ?? getDefaultUserOrgPreferences();
		this.showStatusText = current.calendar.showStatusText;
		this.showPersonnelRoles = current.calendar.showPersonnelRoles;
		this.highlightOnboarding = current.calendar.highlightOnboarding;
	}

	/** Mark calendar as explored for Getting Started checklist. */
	markCalendarVisited(): void {
		const storage = getBrowserLocalStorage();
		if (!browser || !storage) return;

		try {
			storage.setItem(`gettingStarted_calendarVisited_${this.#data.orgId}`, 'true');
		} catch {
			// Non-critical getting-started persistence should not block the calendar.
		}
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
		void this.persistPreferences({
			calendar: {
				highlightOnboarding: this.highlightOnboarding
			}
		});
	}

	toggleShowStatusText(): void {
		this.showStatusText = !this.showStatusText;
		void this.persistPreferences({
			calendar: {
				showStatusText: this.showStatusText
			}
		});
	}

	toggleShowPersonnelRoles(): void {
		this.showPersonnelRoles = !this.showPersonnelRoles;
		void this.persistPreferences({
			calendar: {
				showPersonnelRoles: this.showPersonnelRoles
			}
		});
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
		if (!this.canManageAvailabilityForPerson(person)) return;
		this.selectedPerson = person;
		this.selectedDate = date;
	}

	handlePersonClick(person: Personnel): void {
		if (!this.canManageAvailabilityForPerson(person)) return;
		this.selectedPerson = person;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- selectedDate stores a replacement Date instance and is not mutated in place.
		this.selectedDate = new Date();
	}

	async handleAddAvailability(entry: Omit<AvailabilityEntry, 'id'>): Promise<void> {
		await availabilityStore.add(entry);
	}

	async handleRemoveAvailability(id: string): Promise<void> {
		await availabilityStore.remove(id);
	}

	closeAvailabilityModal(): void {
		this.selectedPerson = null;
		this.selectedDate = null;
	}

	handleDateClick(date: Date): void {
		this.assignmentDate = date;
	}

	closeAssignmentModal(): void {
		this.assignmentDate = null;
	}

	private async persistPreferences(preferences: UserOrgPreferencesPatch): Promise<void> {
		try {
			await queueUserPreferencesPatch(this.#data.orgId, preferences);
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to save your calendar preferences');
		}
	}

	private canManageAvailabilityForPerson(person: Personnel): boolean {
		const resource = policyResourceForPersonnel(person);
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, resource).allowed;
	}
}

function policyResourceForPersonnel(person: Personnel): PolicyResource {
	return person.groupId ? { kind: 'group', groupId: person.groupId } : { kind: 'organization' };
}
