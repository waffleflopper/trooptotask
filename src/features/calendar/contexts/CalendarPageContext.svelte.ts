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
	showPersonnelRoles = $state(true);
	highlightOnboarding = $state(true);
	breakdownExpanded = $state(true);
	dutyStartDayOnly = $state(true);

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

	// ---- constructor -------------------------------------------------------
	constructor(getData: CalendarPageData | (() => CalendarPageData), org: OrgContext) {
		this.#getData = typeof getData === 'function' ? getData : () => getData;
		this.#org = org;
	}

	// ---- lifecycle methods (called from route $effect) ---------------------

	syncUserPreferences(
		preferences: UserOrgPreferences | undefined,
		matchMediaFn: ((query: string) => { matches: boolean }) | null = browser ? window.matchMedia.bind(window) : null
	): void {
		const current = preferences ?? getDefaultUserOrgPreferences();
		this.showStatusText = current.calendar.showStatusText;
		this.showPersonnelRoles = current.calendar.showPersonnelRoles;
		this.highlightOnboarding = current.calendar.highlightOnboarding;
		this.dutyStartDayOnly = current.calendar.dutyStartDayOnly ?? true;
		this.breakdownExpanded =
			current.calendar.todaySummaryExpanded ?? (matchMediaFn ? !matchMediaFn('(max-width: 640px)').matches : true);
	}

	/** Mark calendar as explored for Getting Started checklist. */
	markCalendarVisited(): void {
		if (browser) {
			localStorage.setItem(`gettingStarted_calendarVisited_${this.#data.orgId}`, 'true');
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
}
