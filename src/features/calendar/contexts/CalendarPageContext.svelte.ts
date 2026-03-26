import type { Personnel, AvailabilityEntry } from '$lib/types';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
import { scopePersonnelByGroup } from '$lib/utils/scopePersonnel';
import { browser } from '$app/environment';
import type { OrgContext } from '$lib/stores/orgContext.svelte';

// ---------------------------------------------------------------------------
// Page data shape (subset of layout + page server data)
// ---------------------------------------------------------------------------

export interface CalendarPageData {
	orgId: string;
	orgName?: string;
	userId?: string | null;
	personnel?: Personnel[];
	allPersonnel?: Personnel[];
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
	highlightOnboarding = $state(true);
	breakdownExpanded = $state(true);

	// ---- derived: personnel ------------------------------------------------
	get calendarPersonnel(): Personnel[] {
		return (
			(this.#data.allPersonnel as Personnel[] | undefined) ?? (this.#data.personnel as Personnel[] | undefined) ?? []
		);
	}

	get scopedPersonnelIds(): Set<string> {
		return new Set(((this.#data.personnel as Personnel[] | undefined) ?? []).map((p) => p.id));
	}

	// ---- derived: onboarding data ------------------------------------------
	get activeOnboardingPersonnelIds(): string[] {
		return this.#data.activeOnboardingPersonnelIds ?? [];
	}

	// ---- derived: permission flags -----------------------------------------
	get readOnly(): boolean {
		return subscriptionStore.billingEnabled && subscriptionStore.isReadOnly;
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

	// ---- highlight key -----------------------------------------------------
	get highlightKey(): string {
		return `calendar-highlight-onboarding-${this.#data.userId ?? ''}`;
	}

	// ---- constructor -------------------------------------------------------
	constructor(getData: CalendarPageData | (() => CalendarPageData), org: OrgContext) {
		this.#getData = typeof getData === 'function' ? getData : () => getData;
		this.#org = org;
	}

	// ---- lifecycle methods (called from route $effect) ---------------------

	/** Restore persisted highlight preference from localStorage. */
	initFromStorage(): void {
		if (browser) {
			const stored = localStorage.getItem(this.highlightKey);
			if (stored !== null) {
				this.highlightOnboarding = stored !== 'false';
			}
		}
	}

	initBreakdownPreference(matchMediaFn: ((query: string) => { matches: boolean }) | null = browser
		? window.matchMedia.bind(window)
		: null): void {
		if (!matchMediaFn) return;
		this.breakdownExpanded = !matchMediaFn('(max-width: 640px)').matches;
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
	}

	toggleHighlightOnboarding(): void {
		this.highlightOnboarding = !this.highlightOnboarding;
		if (browser) {
			localStorage.setItem(this.highlightKey, String(this.highlightOnboarding));
		}
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

}
