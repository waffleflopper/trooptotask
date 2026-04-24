import type { Personnel, AvailabilityEntry } from '$lib/types';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
import { scopePersonnelByGroup } from '$lib/utils/scopePersonnel';
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
import { evaluateUpcomingLosses, type UpcomingLossRecord } from '$features/dashboard/utils/evaluateUpcomingLosses';

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
	scopedGroupId?: string | null;
	permissions?: {
		canViewCalendar?: boolean;
		canEditCalendar?: boolean;
	} | null;
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
	breakdownExpanded = $state(false);
	dutyStartDayOnly = $state(true);
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

	// ---- derived: advanced duty events -------------------------------------
	get advancedDutyEvents() {
		return this.#workspaceData?.advancedDutyEvents ?? [];
	}

	// ---- derived: permission flags -----------------------------------------
	get readOnly(): boolean {
		return subscriptionStore.billingEnabled && subscriptionStore.isReadOnly;
	}

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
		return !!(this.#org.isOwner || this.#org.isAdmin || this.#org.isFullEditor);
	}

	// ---- derived: personnel groupings --------------------------------------
	get personnelByGroup() {
		return groupAndSortPersonnel(this.calendarPersonnel, {
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: this.#data.orgName ?? ''
		});
	}

	get scopedPBG() {
		return scopePersonnelByGroup(this.personnelByGroup, this.#data.scopedGroupId ?? null);
	}

	get allPersonnelFlat(): Personnel[] {
		return this.scopedPBG.flatMap((g) => g.personnel);
	}

	get groupFilterOptions(): CalendarRosterFilterOption[] {
		const scopedGroups = this.scopedPBG;
		const total = scopedGroups.reduce((sum, group) => sum + group.personnel.length, 0);

		return [
			{ value: '', label: 'All groups', count: total },
			...scopedGroups.map((group) => ({
				value: this.groupFilterValue(group),
				label: group.group,
				count: group.personnel.length
			}))
		];
	}

	get groupFilteredPBG() {
		if (!this.calendarGroupFilter) return this.scopedPBG;
		return this.scopedPBG.filter((group) => this.groupFilterValue(group) === this.calendarGroupFilter);
	}

	get filteredPBG() {
		const query = this.calendarPersonnelSearch.trim().toLowerCase();
		if (!query) return this.groupFilteredPBG;

		return this.groupFilteredPBG
			.map((group) => ({
				...group,
				personnel: group.personnel.filter((person) => this.matchesPersonnelSearch(person, group.group, query))
			}))
			.filter((group) => group.personnel.length > 0);
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
		this.dutyStartDayOnly = current.calendar.dutyStartDayOnly ?? true;
		this.breakdownExpanded = current.calendar.todaySummaryExpanded ?? false;
	}

	/** Mark calendar as explored for Getting Started checklist. */
	markCalendarVisited(): void {
		if (browser && typeof globalThis.localStorage?.setItem === 'function') {
			try {
				globalThis.localStorage.setItem(`gettingStarted_calendarVisited_${this.#data.orgId}`, 'true');
			} catch {
				// Non-critical getting-started persistence should not block the calendar.
			}
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

	toggleBreakdown(): void {
		this.breakdownExpanded = !this.breakdownExpanded;
		void this.persistPreferences({
			calendar: {
				todaySummaryExpanded: this.breakdownExpanded
			}
		});
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

	toggleDutyStartDayOnly(): void {
		this.dutyStartDayOnly = !this.dutyStartDayOnly;
		void this.persistPreferences({
			calendar: {
				dutyStartDayOnly: this.dutyStartDayOnly
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
		if (!this.#data.permissions?.canEditCalendar) return;
		if (this.#data.scopedGroupId && !this.scopedPersonnelIds.has(person.id)) return;
		this.selectedPerson = person;
		this.selectedDate = date;
	}

	handlePersonClick(person: Personnel): void {
		if (!this.#data.permissions?.canEditCalendar) return;
		if (this.#data.scopedGroupId && !this.scopedPersonnelIds.has(person.id)) return;
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

	private groupFilterValue(group: { group: string; personnel: Personnel[] }): string {
		return group.personnel.find((person) => person.groupId)?.groupId ?? `name:${group.group}`;
	}

	private matchesPersonnelSearch(person: Personnel, groupName: string, query: string): boolean {
		const searchableValues = [
			person.rank,
			person.mos,
			person.clinicRole,
			person.groupName,
			groupName,
			person.firstName,
			person.lastName,
			`${person.firstName} ${person.lastName}`,
			`${person.lastName}, ${person.firstName}`
		];

		return searchableValues.some((value) => value?.toLowerCase().includes(query));
	}
}
