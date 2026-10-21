import type { Group, Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry } from '$features/calendar/contracts';
import { buildAvailabilityTracks } from '$features/calendar/utils/availabilityTracks';
import {
	rereadDatesFor,
	classifyAvailabilityWrite,
	type AvailabilityChange
} from '$features/calendar/utils/availabilityMutation';
import { toastStore } from '$lib/stores/toast.svelte';
import { formatDate, formatToday, parseDate } from '$lib/utils/dates';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { pinnedGroupsStore } from '$features/personnel';
import { groupsStore } from '$features/personnel';
import { createRosterReadModel } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
import { groupsInScope } from '$lib/access/scopeSetAccess';
import { loadCalendarRange } from '$features/calendar/utils/calendarRangeLoader';
import { rangeCoversDate, rangeCoversSpan, type CalendarViewMode } from '$features/calendar/utils/calendarRange';
import { dayWindow } from '$lib/utils/dayNumber';
import { indexByPersonId } from '$features/calendar/utils/calendarIndexes';
import { rejectedRequestMessage, StoreRequestError, withinOrganizationLifetime } from '$lib/stores/core';
import type { CapabilityLevel, ScopeSet } from '$lib/access/memberAccessShape';
import type { FeatureLanePolicyAction, PolicyDecision } from '$lib/access/policyEvaluator';
import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';
import { evaluateUpcomingLosses, type UpcomingLossRecord } from '$features/personnel/contracts';
import { DEFAULT_LOSS_WARNING_WINDOW_DAYS } from '$features/organization/contracts';

const CALENDAR_WORKSPACE_RESOURCE: PolicyResource = { kind: 'unscoped' };

export interface CalendarRosterFilterOption {
	value: string;
	label: string;
	count?: number;
}

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
	| { readonly kind: 'create'; readonly person: Personnel; readonly startDate: string; readonly endDate: string }
	| { readonly kind: 'edit'; readonly person: Personnel; readonly entry: AvailabilityEntry };

/** `busy` means another change was still settling, so this one was not sent. `stale` means the Organization or access changed. */
export type AvailabilityOutcome = 'saved' | 'not-saved' | 'unconfirmed' | 'stale' | 'busy';

export interface TodayAvailability {
	readonly date: Date;
	readonly available: number;
	readonly total: number;
}

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
	[key: string]: unknown;
}

export class CalendarPageContext {
	readonly #getData: () => CalendarPageData;
	get #data(): CalendarPageData {
		return this.#getData();
	}

	readonly #org: CalendarPageAccess;
	readonly #savePreferences: (patch: Partial<CalendarDisplayPreferences>) => void;

	#calendarAccessKey(): string {
		return JSON.stringify([this.#org.userId, this.#org.role, this.#org.capabilityMap.calendar, this.#org.scopeSet]);
	}

	popover = $state.raw<CalendarPopover | null>(null);
	editor = $state.raw<AvailabilityEditorRequest | null>(null);
	assignmentDate = $state<Date | null>(null);
	savingAvailability = $state(false);

	viewMode = $state<CalendarViewMode>('month');

	showStatusText = $state(false);
	showPersonnelRoles = $state(false);
	highlightOnboarding = $state(true);
	calendarGroupFilter = $state('');
	calendarPersonnelSearch = $state('');

	get #workspaceData() {
		return this.#data.calendar?.data;
	}

	get calendarPersonnel(): Personnel[] {
		return (
			this.#workspaceData?.allPersonnel ??
			this.#workspaceData?.personnel ??
			(this.#data.allPersonnel as Personnel[] | undefined) ??
			(this.#data.personnel as Personnel[] | undefined) ??
			[]
		);
	}

	get activeOnboardingPersonnelIds(): string[] {
		return this.#workspaceData?.activeOnboardingPersonnelIds ?? this.#data.activeOnboardingPersonnelIds ?? [];
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

	get scopedGroups(): Group[] {
		return groupsInScope(groupsStore.items, this.#org.scopeSet);
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

	readonly availabilityTracks = $derived(buildAvailabilityTracks(availabilityStore.items, statusTypesStore.items));

	readonly #today: string;

	readonly upcomingLossMap: ReadonlyMap<string, UpcomingLossRecord> = $derived.by(() => {
		const windowDays = this.#workspaceData?.lossWarningWindowDays;
		const losses =
			windowDays === null
				? []
				: evaluateUpcomingLosses(this.calendarPersonnel, windowDays ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS, this.#today);
		return indexByPersonId(losses);
	});

	readonly todayAvailability: TodayAvailability | null = $derived.by(() => {
		const availabilityRange = this.#workspaceData?.availabilityRange;
		if (!availabilityRange || !rangeCoversDate(availabilityRange)({ date: this.#today })) return null;
		const people = this.allPersonnelFlat;
		const [out = 0] = this.availabilityTracks.outCounts(
			people.map((person) => person.id),
			dayWindow(this.#today, 1)
		);
		return { date: parseDate(this.#today), available: people.length - out, total: people.length };
	});

	/** The loss warning window could not be read, so the Calendar shows no loss flags. */
	get lossWarningsUnavailable(): boolean {
		return this.#workspaceData?.lossWarningWindowDays === null;
	}

	constructor(
		getData: CalendarPageData | (() => CalendarPageData),
		org: CalendarPageAccess,
		savePreferences: (patch: Partial<CalendarDisplayPreferences>) => void,
		today?: string
	) {
		this.#getData = typeof getData === 'function' ? getData : () => getData;
		this.#org = org;
		this.#savePreferences = savePreferences;

		this.#today = today ?? formatToday();
	}

	syncUserPreferences(preferences: CalendarDisplayPreferences): void {
		this.showStatusText = preferences.showStatusText;
		this.showPersonnelRoles = preferences.showPersonnelRoles;
		this.highlightOnboarding = preferences.highlightOnboarding;
	}

	setViewMode(view: CalendarViewMode): void {
		this.viewMode = view;
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
		const open = this.popover;
		if (open?.kind === 'entry' && open.entryId === entryId && open.anchor === anchor) return;
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

	async saveAvailability(change: AvailabilityChange): Promise<AvailabilityOutcome> {
		if (this.savingAvailability) {
			toastStore.error('Another change is still saving. Try again in a moment.');
			return 'busy';
		}
		this.savingAvailability = true;
		const orgId = this.#data.orgId;
		const accessKey = this.#calendarAccessKey();
		const current = () => this.#data.orgId === orgId && this.#calendarAccessKey() === accessKey;
		const entriesBeforeWrite = [...availabilityStore.items];
		try {
			let confirmed = false;
			let refusal: StoreRequestError | null = null;
			try {
				confirmed = await writeAvailability(change);
			} catch (error) {
				if (error instanceof StoreRequestError && error.status >= 400 && error.status < 500) refusal = error;
			}
			if (!current()) return 'stale';
			if (confirmed) {
				announceSaved(change);
				return 'saved';
			}
			// A 4xx means the server refused the write and saved nothing, so there is nothing to reconcile.
			if (refusal) {
				toastStore.error(rejectedRequestMessage(refusal, 'Could not save status. Try again.'));
				return 'not-saved';
			}
			let reread: AvailabilityEntry[] | null;
			try {
				reread = await this.reconcileAvailability(rereadDatesFor(change), orgId);
			} catch {
				toastStore.error('Could not confirm the saved status. Reload the calendar before trying again.');
				return 'unconfirmed';
			}
			if (reread === null) return 'stale';
			const outcome = classifyAvailabilityWrite(change, entriesBeforeWrite, reread);
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
						[...new Set(dates)].map((date) =>
							loadCalendarRange(expectedOrgId, { rangeStart: date, rangeEnd: date, collections: ['availability'] })
						)
					)
				);
			} catch (error) {
				if (this.#data.orgId !== expectedOrgId || this.#calendarAccessKey() !== accessKey) return null;
				throw error;
			}
			if (this.#data.orgId !== expectedOrgId || this.#calendarAccessKey() !== accessKey) return null;
			const entriesByRange = ranges.map((range) => ({ range, entries: range.availabilityEntries ?? [] }));
			for (const { range, entries } of entriesByRange) {
				availabilityStore.load(
					availabilityStore.orgId === expectedOrgId ? read.reconcile(entries, rangeCoversSpan(range)) : entries,
					expectedOrgId
				);
			}
			return [...new Map(entriesByRange.flatMap(({ entries }) => entries.map((entry) => [entry.id, entry]))).values()];
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
			return availabilityStore.updateOrThrow(change.entry.id, change.changes);
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
