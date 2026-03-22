import type { Personnel, AvailabilityEntry } from '$lib/types';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { dutyRosterHistoryStore } from '$features/duty-roster/stores/dutyRosterHistory.svelte';
import type { RosterHistoryItem } from '$features/duty-roster/stores/dutyRosterHistory.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { calendarPrefsStore } from '$features/calendar/stores/calendarPrefs.svelte';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
import { scopePersonnelByGroup } from '$lib/utils/scopePersonnel';
import { exportMonthToCSV, printMonthCalendar } from '$features/calendar/utils/calendarExport';
import { browser } from '$app/environment';
import { invalidateAll } from '$app/navigation';
import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';

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
	isOwner?: boolean;
	isAdmin?: boolean;
	isFullEditor?: boolean;
	permissions?: {
		canViewCalendar?: boolean;
		canEditCalendar?: boolean;
	} | null;
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

	// ---- modal visibility --------------------------------------------------
	showStatusManager = $state(false);
	showSpecialDayManager = $state(false);
	showTodayBreakdown = $state(false);
	showBulkStatusModal = $state(false);
	showBulkStatusImportModal = $state(false);
	showBulkRemoveModal = $state(false);
	showAssignmentPlanner = $state(false);
	showLongRangeView = $state(false);
	showAssignmentTypeManager = $state(false);
	showDutyRosterGenerator = $state(false);

	// ---- selection state ---------------------------------------------------
	selectedPerson = $state<Personnel | null>(null);
	selectedDate = $state<Date | null>(null);
	assignmentDate = $state<Date | null>(null);

	// ---- display prefs -----------------------------------------------------
	highlightOnboarding = $state(true);

	// ---- derived: personnel ------------------------------------------------
	get calendarPersonnel(): Personnel[] {
		return (
			(this.#data.allPersonnel as Personnel[] | undefined) ?? (this.#data.personnel as Personnel[] | undefined) ?? []
		);
	}

	get scopedPersonnelIds(): Set<string> {
		return new Set(((this.#data.personnel as Personnel[] | undefined) ?? []).map((p) => p.id));
	}

	// ---- derived: permission flags -----------------------------------------
	get readOnly(): boolean {
		return subscriptionStore.billingEnabled && subscriptionStore.isReadOnly;
	}

	get canManageConfig(): boolean {
		return !!(this.#data.isOwner || this.#data.isAdmin || this.#data.isFullEditor);
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

	// ---- derived: overflow menu items --------------------------------------
	get calendarOverflowItems(): OverflowItem[] {
		const items: OverflowItem[] = [];

		// Visible actions duplicated for mobile access
		items.push({ label: "Today's Breakdown", onclick: () => (this.showTodayBreakdown = true) });
		if (this.#data.permissions?.canEditCalendar) {
			if (this.canManageConfig) {
				items.push({
					label: 'Assignments',
					onclick: () => (this.showAssignmentPlanner = true),
					disabled: this.readOnly
				});
			}
		}
		items.push({ label: '3-Month View', onclick: () => (this.showLongRangeView = true) });

		// Additional tools
		if (this.#data.permissions?.canEditCalendar) {
			if (this.canManageConfig) {
				items.push({
					label: 'Bulk Status',
					onclick: () => (this.showBulkStatusModal = true),
					divider: true,
					disabled: this.readOnly
				});
				items.push({
					label: 'Bulk Remove',
					onclick: () => (this.showBulkRemoveModal = true),
					disabled: this.readOnly
				});
				items.push({
					label: 'Duty Roster',
					onclick: () => (this.showDutyRosterGenerator = true),
					disabled: this.readOnly
				});
			}
		}

		// Reports (owner/admin only)
		if (this.#data.isOwner || this.#data.isAdmin) {
			items.push({
				label: 'Status Reports',
				href: `/org/${this.#data.orgId}/calendar/reports`,
				divider: true
			});
		}

		// Export
		items.push({ label: 'Export to Excel', onclick: () => this.handleExportCSV(), divider: true });
		items.push({ label: 'Print / PDF', onclick: () => this.handleExportPDF() });

		// Display toggle
		items.push({
			label: 'Show Status Text',
			toggle: true,
			active: calendarPrefsStore.showStatusText,
			onclick: () => calendarPrefsStore.toggleShowStatusText(),
			divider: true
		});

		// Configure group
		if (this.canManageConfig) {
			items.push({
				label: 'Status Types',
				onclick: () => (this.showStatusManager = true),
				divider: true,
				group: 'Configure',
				disabled: this.readOnly
			});
			items.push({
				label: 'Assignment Types',
				onclick: () => (this.showAssignmentTypeManager = true),
				disabled: this.readOnly
			});
			items.push({
				label: 'Holidays',
				onclick: () => (this.showSpecialDayManager = true),
				disabled: this.readOnly
			});
		}

		return items;
	}

	// ---- highlight key -----------------------------------------------------
	get highlightKey(): string {
		return `calendar-highlight-onboarding-${this.#data.userId ?? ''}`;
	}

	// ---- constructor -------------------------------------------------------
	constructor(getData: CalendarPageData | (() => CalendarPageData)) {
		this.#getData = typeof getData === 'function' ? getData : () => getData;

		// Restore persisted highlight preference from localStorage
		$effect(() => {
			if (browser) {
				const stored = localStorage.getItem(this.highlightKey);
				if (stored !== null) {
					this.highlightOnboarding = stored !== 'false';
				}
			}
		});

		// Mark calendar as explored for Getting Started checklist
		$effect(() => {
			if (browser) {
				localStorage.setItem(`gettingStarted_calendarVisited_${this.#data.orgId}`, 'true');
			}
		});
	}

	// ---- handlers ----------------------------------------------------------

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

	async handleBulkStatusApply(
		personnelIds: string[],
		statusTypeId: string,
		startDate: string,
		endDate: string,
		note: string | null
	): Promise<void> {
		await availabilityStore.addBatch(
			personnelIds.map((personnelId) => ({ personnelId, statusTypeId, startDate, endDate, note }))
		);
	}

	async handleBulkStatusRemove(ids: string[]): Promise<boolean> {
		return await availabilityStore.removeBatch(ids);
	}

	handleExportCSV(): void {
		exportMonthToCSV(calendarStore.year, calendarStore.month, {
			personnelByGroup: this.scopedPBG,
			availabilityEntries: availabilityStore.list,
			statusTypes: statusTypesStore.list,
			specialDays: specialDaysStore.list,
			assignmentTypes: dailyAssignmentsStore.types,
			assignments: dailyAssignmentsStore.assignments
		});
	}

	handleExportPDF(): void {
		printMonthCalendar(calendarStore.year, calendarStore.month, {
			personnelByGroup: this.scopedPBG,
			availabilityEntries: availabilityStore.list,
			statusTypes: statusTypesStore.list,
			specialDays: specialDaysStore.list,
			assignmentTypes: dailyAssignmentsStore.types,
			assignments: dailyAssignmentsStore.assignments
		});
	}

	async handleApplyRoster(
		assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]
	): Promise<void> {
		await dailyAssignmentsStore.setAssignmentBatch(assignments);
	}

	async handleSaveRoster(payload: Omit<RosterHistoryItem, 'id' | 'createdAt'>): Promise<RosterHistoryItem | null> {
		try {
			const res = await fetch(`/org/${this.#data.orgId}/api/duty-roster-history`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) return null;
			const item: RosterHistoryItem = await res.json();
			dutyRosterHistoryStore.add(item);
			return item;
		} catch {
			return null;
		}
	}

	async handleDeleteRoster(id: string): Promise<void> {
		dutyRosterHistoryStore.remove(id); // optimistic
		try {
			await fetch(`/org/${this.#data.orgId}/api/duty-roster-history/${id}`, { method: 'DELETE' });
		} catch {
			// Silently fail — history will re-sync on next page load
		}
	}

	async handleUpdateExemptions(assignmentTypeId: string, personnelIds: string[]): Promise<void> {
		await dailyAssignmentsStore.updateType(assignmentTypeId, { exemptPersonnelIds: personnelIds });
	}
}
