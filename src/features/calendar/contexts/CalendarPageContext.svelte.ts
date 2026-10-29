import type { Group, Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry } from '$features/calendar/contracts';
import { buildAvailabilityTracks } from '$features/calendar/utils/availabilityTracks';
import type { AvailabilityChange } from '$features/calendar/utils/availabilityMutation';
import { saveAvailabilityChange, type AvailabilityOutcome } from '$features/calendar/availabilitySave';
import { toastStore } from '$lib/stores/toast.svelte';
import { formatDate, formatToday, parseDate } from '$lib/utils/dates';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { groupsStore, pinnedGroupsStore } from '$features/personnel';
import {
	buildGroupTree,
	createRosterReadModel,
	nestRosterBands,
	soleLeafGroup,
	type GroupTree,
	type NestedRosterBand
} from '$features/personnel/contracts';
import { showSubGroups } from '$lib/stores/showSubGroups.svelte';
import { POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
import { groupsInScope } from '$lib/access/scopeSetAccess';
import { rangeCoversDate, type CalendarViewMode } from '$features/calendar/utils/calendarRange';
import { dayWindow } from '$lib/utils/dayNumber';
import { indexByPersonId } from '$features/calendar/utils/calendarIndexes';
import type { CapabilityLevel, AdvisoryGroupScope } from '$lib/access/memberAccessShape';
import type { FeatureLanePolicyAction, PolicyDecision } from '$lib/access/policyEvaluator';
import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';
import { evaluateUpcomingLosses, type UpcomingLossRecord } from '$features/personnel/contracts';
import type { FeatureKey } from '$lib/access/featureSwitches';
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
	readonly scopeSet: AdvisoryGroupScope;
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
	disabledFeatures?: readonly FeatureKey[];
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

	get canConfigureAssignmentTypes(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes).allowed;
	}

	get showEvents(): boolean {
		return !this.#getData().disabledFeatures?.includes('eventsAndTaskings');
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

	/** Adding a Tasking from the Calendar lands on an Event, which any Tasking manager may add to. */
	get canAddTaskings(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'unscoped' })
			.allowed;
	}

	canManageTasking(responsibility: { kind: 'group'; groupId: string } | { kind: 'organization' }): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, responsibility).allowed;
	}

	/** Roster counts span the whole Organization, so the picker shows them only to an Organization-wide operator. */
	get seesRosterCounts(): boolean {
		return this.canManageAssignments && this.#org.scopeSet.kind === 'organization';
	}

	readonly #calendarRoster = $derived(
		createRosterReadModel({
			personnel: this.calendarPersonnel,
			groups: groupsStore.items,
			pinnedGroupIds: pinnedGroupsStore.list,
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

	readonly groupTree: GroupTree = $derived.by(() =>
		buildGroupTree(groupsStore.items, { pinnedIds: this.canPinGroups ? pinnedGroupsStore.list : [] })
	);

	/** One Group with nothing under it is the reader's whole Calendar, so the matrix draws no band header. */
	get showGroupHeaders(): boolean {
		return soleLeafGroup(this.groupTree, this.canPinGroups) === null;
	}

	readonly #filteredSections = $derived.by(
		() =>
			this.#calendarRoster.scoped(this.#org.scopeSet, {
				status: 'active',
				groupFilter: this.calendarGroupFilter,
				search: this.calendarPersonnelSearch
			}).personnelByGroup
	);

	readonly filteredPBG: NestedRosterBand[] = $derived(
		nestRosterBands(this.groupTree, this.#filteredSections, showSubGroups.current)
	);

	/** Exports always write each Group's own people under its path, whatever the screen shows. */
	get exportPBG(): NestedRosterBand[] {
		return nestRosterBands(this.groupTree, this.#filteredSections);
	}

	readonly availabilityTracks = $derived(buildAvailabilityTracks(availabilityStore.items, statusTypesStore.items));

	readonly #today: string;

	readonly upcomingLossMap: ReadonlyMap<string, UpcomingLossRecord> = $derived.by(() => {
		const windowDays = this.#workspaceData?.lossWarningWindowDays;
		const losses =
			windowDays === null || this.#getData().disabledFeatures?.includes('lossesAndAwards')
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

	/** Pins belong to Organization-wide readers; a Group-scoped reader's saved pins are ignored. */
	get canPinGroups(): boolean {
		return this.#org.scopeSet.kind === 'organization';
	}

	handlePinToggle(groupId: string): void {
		pinnedGroupsStore.toggle(groupId);
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
		try {
			return await saveAvailabilityChange(change, {
				orgId,
				isCurrent: () => this.#data.orgId === orgId && this.#calendarAccessKey() === accessKey
			});
		} finally {
			this.savingAvailability = false;
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

function policyResourceForPersonnel(person: Personnel): PolicyResource {
	return person.groupId ? { kind: 'group', groupId: person.groupId } : { kind: 'organization' };
}
