import { browser } from '$app/environment';
import { changelog } from '$lib/data/changelog';
import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
import { createRosterReadModel, type RosterReadModelView } from '$lib/domain/rosterReadModel';
import { rosterStore } from '$lib/stores/roster.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import { getRatingDueStatus } from '$features/rating-scheme/utils/ratingScheme';
import { deriveBadgeColor, deriveShortName } from '$features/calendar/utils/dutyEventBadges';
import { getBrowserLocalStorage } from '$lib/utils/browserStorage';
import { formatDate, parseDate } from '$lib/utils/dates';
import { formatDashboardDisplayDate } from '$lib/utils/dashboardDate';
import { evaluateUpcomingLosses, type UpcomingLossRecord } from '$lib/domain/readinessSignals';
import { SvelteDate, SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, StatusType } from '$lib/types';
import type { DashboardPageData, TrainingIssue } from '$features/dashboard/dashboard.types';

export type GroupedEntries<T> = Array<[string, T[]]>;
export type UpcomingGroupBy = 'date' | 'group';

export interface DashboardStoragePort {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export interface DashboardCollectionSource<T> {
	items: T[];
	loading?: boolean;
}

export interface DashboardAssignmentSource {
	assignments: DailyAssignment[];
	types: AssignmentType[];
	loading?: boolean;
}

export interface DashboardPinnedGroupSource {
	list: string[];
	loading?: boolean;
}

export interface DashboardStoreSources {
	personnel: DashboardCollectionSource<Personnel>;
	statusTypes: DashboardCollectionSource<StatusType>;
	availability: DashboardCollectionSource<AvailabilityEntry>;
	dailyAssignments: DashboardAssignmentSource;
	groups: DashboardCollectionSource<Group>;
	pinnedGroups: DashboardPinnedGroupSource;
}

export interface DashboardScreenModelOptions {
	today?: string;
	storage?: DashboardStoragePort;
	sources?: DashboardStoreSources;
}

export interface DashboardSupportData {
	onboardingTemplateStepCount: number;
	ratingSchemeEntryCount: number;
	orgMemberCount: number;
	dutyRosterTemplateCount: number;
	dutyRosterRunCount: number;
	dutyRosterHistoryCount: number;
	gettingStartedDismissed: boolean;
}

export interface DashboardGettingStartedItem {
	id: string;
	label: string;
	description: string;
	href: string;
	complete: boolean;
}

export interface DashboardStatusBreakdown {
	name: string;
	color: string;
	textColor: string;
	count: number;
}

export interface DashboardDutyAssignmentRow {
	id: string;
	typeName: string;
	shortName: string;
	color: string;
	textColor: string;
	assigneeName: string;
}

export interface DashboardAdvancedDutyRow {
	id: string;
	templateName: string;
	shortName: string;
	color: string;
	textColor: string;
	slots: Array<{ key: string; roleLabel: string; assigneeName: string }>;
}

export interface DashboardUpcomingChangeRow {
	key: string;
	date: string;
	personName: string;
	statusName: string;
	statusColor: string;
	direction: 'departing' | 'returning';
	groupId: string | null;
	groupName: string;
}

export interface DashboardOnboardingProgressRow {
	id: string;
	personnelId: string;
	personName: string;
	totalSteps: number;
	completedSteps: number;
	pct: number;
}

export interface DashboardGroupBreakdownRow {
	id: string;
	name: string;
	total: number;
	available: number;
	pct: number;
	statusCounts: Map<string, number>;
	isPinned: boolean;
}

export interface DashboardOutTodayRow {
	id: string;
	personnelId: string;
	personName: string;
	rank: string;
	statusName: string;
	statusColor: string;
	statusTextColor: string;
	startDate: string;
	endDate: string;
	statusTypeId: string;
	groupId: string | null;
	groupName: string;
}

export interface DashboardDutyDayView {
	date: string;
	isToday: boolean;
	assignments: DashboardDutyAssignmentRow[];
}

export interface DashboardGroupedPreferenceView<Mode extends string, Row> {
	mode: Mode;
	setMode(mode: Mode): void;
	byStatus: GroupedEntries<Row>;
	byGroup: GroupedEntries<Row>;
	byDate: GroupedEntries<Row>;
}

export interface DashboardUnitReadinessView {
	availabilityColor(pct: number): string;
	availPct: number;
	availColor: string;
	trainingColor: string;
	statusEntries: Array<[string, DashboardStatusBreakdown]>;
	upcomingChanges: Pick<
		DashboardGroupedPreferenceView<UpcomingGroupBy, DashboardUpcomingChangeRow>,
		'mode' | 'setMode' | 'byGroup'
	>;
}

const UPCOMING_KEY = 'dashboard-upcoming-group-by';

export function createDashboardScreenModel(
	data: DashboardPageData,
	options: DashboardScreenModelOptions = {}
): DashboardScreenModel {
	return new DashboardScreenModel(data, options);
}

export class DashboardScreenModel {
	readonly data: DashboardPageData;
	readonly today: string;
	private readonly sources: DashboardStoreSources;
	private readonly storage: DashboardStoragePort | null;

	private upcomingGroupBy = $state<UpcomingGroupBy>('date');
	private rosterView = $derived.by<RosterReadModelView>(() => {
		const groupOrder = [...this.sources.groups.items]
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
			.map((group) => group.name);

		return createRosterReadModel({
			personnel: this.sources.personnel.items,
			pinnedGroups: this.sources.pinnedGroups.list,
			groupOrder,
			fallbackGroupName: this.data.orgName
		}).full({ status: 'active' });
	});

	// ---------------------------------------------------------------------------
	// Banner / getting-started support state
	// ---------------------------------------------------------------------------
	gettingStartedDismissed = $state(false);
	private supportData = $state<DashboardSupportData | null>(null);

	constructor(data: DashboardPageData, options: DashboardScreenModelOptions = {}) {
		this.data = data;
		// Date is intentional here so callers using fake timers can snapshot today deterministically.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		this.today = options.today ?? formatToday(new Date());
		this.sources = options.sources ?? createDefaultDashboardStoreSources();
		this.storage = options.storage ?? createBrowserStoragePort();
		this.upcomingGroupBy = readPreference(this.storage, UPCOMING_KEY, ['date', 'group'], 'date');

		if (
			typeof data.onboardingTemplateStepCount === 'number' &&
			typeof data.ratingSchemeEntryCount === 'number' &&
			typeof data.orgMemberCount === 'number' &&
			typeof data.dutyRosterTemplateCount === 'number' &&
			typeof data.dutyRosterRunCount === 'number' &&
			typeof data.dutyRosterHistoryCount === 'number' &&
			typeof data.gettingStartedDismissed === 'boolean'
		) {
			this.applySupportData({
				onboardingTemplateStepCount: data.onboardingTemplateStepCount,
				ratingSchemeEntryCount: data.ratingSchemeEntryCount,
				orgMemberCount: data.orgMemberCount,
				dutyRosterTemplateCount: data.dutyRosterTemplateCount,
				dutyRosterRunCount: data.dutyRosterRunCount,
				dutyRosterHistoryCount: data.dutyRosterHistoryCount,
				gettingStartedDismissed: data.gettingStartedDismissed
			});
		}
	}

	// ---------------------------------------------------------------------------
	// Display helper for the current date
	// ---------------------------------------------------------------------------
	get todayDisplay(): string {
		return formatDashboardDisplayDate(this.today);
	}

	// ---------------------------------------------------------------------------
	// Typed counts that flow through the page-data index signature
	// (bootstrap counts — distinct from the live store-backed totals)
	// ---------------------------------------------------------------------------
	get personnelCount(): number {
		return this.data.dashboard.data.personnel.length;
	}

	get statusTypeCount(): number {
		return this.data.dashboard.data.statusTypes.length;
	}

	get trainingTypeCount(): number {
		return this.data.dashboard.data.trainingTypes.length;
	}

	get assignmentTypeCount(): number {
		return this.data.dashboard.data.assignmentTypes.length;
	}

	get userRole(): string | undefined {
		return this.data.userRole as string | undefined;
	}

	// ---------------------------------------------------------------------------
	// Getting-started checklist support data
	// ---------------------------------------------------------------------------
	get hasSupportData(): boolean {
		return this.supportData !== null;
	}

	get onboardingTemplateStepCount(): number {
		return this.supportData?.onboardingTemplateStepCount ?? 0;
	}

	get ratingSchemeEntryCount(): number {
		return this.supportData?.ratingSchemeEntryCount ?? 0;
	}

	get orgMemberCount(): number {
		return this.supportData?.orgMemberCount ?? 0;
	}

	get dutyRosterTemplateCount(): number {
		return this.supportData?.dutyRosterTemplateCount ?? 0;
	}

	get dutyRosterRunCount(): number {
		return this.supportData?.dutyRosterRunCount ?? 0;
	}

	get dutyRosterHistoryCount(): number {
		return this.supportData?.dutyRosterHistoryCount ?? 0;
	}

	get gettingStartedItems(): DashboardGettingStartedItem[] {
		const orgPath = `/org/${this.data.orgId}`;

		return [
			{
				id: 'personnel',
				label: 'Import or add the roster',
				description: 'Import an Excel/CSV roster or add service members so the dashboard can track strength.',
				href: `${orgPath}/personnel`,
				complete: this.personnelCount > 0
			},
			{
				id: 'statuses',
				label: 'Review availability statuses',
				description: 'Review the seeded availability statuses and adjust them for your unit.',
				href: `${orgPath}/calendar/settings`,
				complete: false
			},
			{
				id: 'training',
				label: 'Add training types',
				description: 'Define the training requirements you want to monitor.',
				href: `${orgPath}/training/types`,
				complete: this.trainingTypeCount > 0
			},
			{
				id: 'assignments',
				label: 'Review duty assignments',
				description: 'Review the seeded Staff Duty assignment and add other duty types as needed.',
				href: `${orgPath}/calendar/settings`,
				complete: false
			},
			{
				id: 'duty-roster',
				label: 'Set up Duty Roster',
				description: 'Create a Duty Roster template or accept a first run when the roster is ready.',
				href: `${orgPath}/duty-rosters/new`,
				complete: this.dutyRosterTemplateCount > 0 || this.dutyRosterRunCount > 0 || this.dutyRosterHistoryCount > 0
			},
			{
				id: 'members',
				label: 'Invite another Organization Member',
				description: 'Add at least one more member for shared access.',
				href: `${orgPath}/settings/members`,
				complete: this.orgMemberCount > 1
			},
			{
				id: 'onboarding',
				label: 'Set up onboarding',
				description: 'Configure template steps for new arrivals.',
				href: `${orgPath}/onboarding/templates`,
				complete: this.onboardingTemplateStepCount > 0
			},
			{
				id: 'ratings',
				label: 'Configure evals',
				description: 'Add rating scheme entries for evaluation tracking.',
				href: `${orgPath}/evals`,
				complete: this.ratingSchemeEntryCount > 0
			}
		];
	}

	get shouldShowGettingStarted(): boolean {
		if (!this.hasSupportData || this.gettingStartedDismissed) return false;
		if (this.userRole !== 'owner' && this.userRole !== 'admin') return false;

		return this.gettingStartedItems.some((item) => !item.complete);
	}

	applySupportData(data: DashboardSupportData) {
		this.supportData = data;
		this.gettingStartedDismissed = data.gettingStartedDismissed;
	}

	async dismissGettingStarted() {
		this.gettingStartedDismissed = true;
		try {
			const response = await fetch(`/org/${this.data.orgId}/api/getting-started`, { method: 'POST' });
			if (!response.ok) {
				this.gettingStartedDismissed = false;
			}
		} catch {
			this.gettingStartedDismissed = false;
		}
	}

	// ---------------------------------------------------------------------------
	// localStorage side-effect — call once inside $effect (browser only)
	// ---------------------------------------------------------------------------
	autoShowWhatsNew(hasShown: { value: boolean }) {
		if (browser && !hasShown.value && changelog.length > 0 && this.data.userId) {
			const storage = getBrowserLocalStorage();
			if (!storage) return;

			let lastSeen: string | null = null;
			try {
				lastSeen = storage.getItem(`changelog-last-seen-${this.data.userId}`);
			} catch {
				return;
			}

			if (lastSeen !== changelog[0].id) {
				hasShown.value = true;
				whatsNewStore.show();
			}
		}
	}

	get isHydrating(): boolean {
		return (
			this.sources.personnel.loading === true ||
			this.sources.statusTypes.loading === true ||
			this.sources.availability.loading === true ||
			this.sources.dailyAssignments.loading === true ||
			this.sources.groups.loading === true
		);
	}

	get personnelIds(): Set<string> {
		return new SvelteSet(this.rosterPersonnel.map((p) => p.id));
	}

	get todayEntries(): AvailabilityEntry[] {
		const personnelIds = this.personnelIds;
		return this.sources.availability.items.filter(
			(e) => e.startDate <= this.today && e.endDate >= this.today && personnelIds.has(e.personnelId)
		);
	}

	get unavailablePersonnelIds(): Set<string> {
		return new SvelteSet(this.todayEntries.map((e) => e.personnelId));
	}

	get totalPersonnel(): number {
		return this.rosterPersonnel.length;
	}

	get availableCount(): number {
		return this.totalPersonnel - this.unavailablePersonnelIds.size;
	}

	get statusBreakdown(): Map<string, DashboardStatusBreakdown> {
		const map = new SvelteMap<string, DashboardStatusBreakdown>();
		for (const entry of this.todayEntries) {
			const st = this.sources.statusTypes.items.find((s) => s.id === entry.statusTypeId);
			if (!st) continue;
			const existing = map.get(st.id);
			if (existing) {
				existing.count++;
			} else {
				map.set(st.id, { name: st.name, color: st.color, textColor: st.textColor, count: 1 });
			}
		}
		return map;
	}

	get dutyAssignments(): DashboardDutyAssignmentRow[] {
		return this.sources.dailyAssignments.assignments
			.filter((a) => a.date === this.today)
			.map((a) => this.toDutyAssignmentRow(a));
	}

	get todayAdvancedDuty(): DashboardAdvancedDutyRow[] {
		return (this.data.dashboard.data.todayDutyEvents ?? [])
			.filter((event) => event.eventDate === this.today)
			.map((event) => ({
				id: event.id,
				templateName: event.templateName,
				shortName: deriveShortName(event.templateName),
				...deriveBadgeColor(event.templateId),
				slots: [...event.slotInstances]
					.sort((a, b) => a.sortOrder - b.sortOrder)
					.map((slot) => {
						let assigneeName = 'Unfilled';
						if (slot.assigneeId) {
							const person = this.findRosterPerson(slot.assigneeId);
							if (person) {
								assigneeName = `${person.rank} ${person.lastName}`;
								if (person.firstName) assigneeName += `, ${person.firstName[0]}`;
							}
						}
						return { key: `${slot.roleLabel}-${slot.slotIndex}`, roleLabel: slot.roleLabel, assigneeName };
					})
			}));
	}

	get trainingStats() {
		return this.data.trainingSummary?.stats ?? null;
	}

	get topTrainingIssues(): TrainingIssue[] {
		return this.data.trainingSummary?.issues ?? [];
	}

	get upcomingChanges(): DashboardUpcomingChangeRow[] {
		const sevenDaysOut = dateAfter(this.today, 7);
		const changes: DashboardUpcomingChangeRow[] = [];

		for (const entry of this.sources.availability.items) {
			const person = this.findRosterPerson(entry.personnelId);
			const st = this.sources.statusTypes.items.find((s) => s.id === entry.statusTypeId);
			if (!person || !st) continue;

			const groupId = person.groupId ?? null;
			const group = groupId ? this.sources.groups.items.find((g) => g.id === groupId) : null;
			const groupName = group?.name ?? 'Unassigned';

			if (entry.startDate > this.today && entry.startDate <= sevenDaysOut) {
				changes.push({
					key: `${entry.id}-departing-${entry.startDate}`,
					date: entry.startDate,
					personName: `${person.rank} ${person.lastName}`,
					statusName: st.name,
					statusColor: st.color,
					direction: 'departing',
					groupId,
					groupName
				});
			}

			if (entry.endDate >= this.today && entry.endDate <= sevenDaysOut) {
				changes.push({
					key: `${entry.id}-returning-${entry.endDate}`,
					date: entry.endDate,
					personName: `${person.rank} ${person.lastName}`,
					statusName: st.name,
					statusColor: st.color,
					direction: 'returning',
					groupId,
					groupName
				});
			}
		}

		return changes.sort((a, b) => a.date.localeCompare(b.date));
	}

	get upcomingByDate(): Map<string, DashboardUpcomingChangeRow[]> {
		return new SvelteMap(
			groupEntries(
				this.upcomingChanges,
				(change) => change.date,
				(a, b) => a.localeCompare(b)
			)
		);
	}

	get activeOnboardings(): DashboardOnboardingProgressRow[] {
		const personnelIds = this.personnelIds;
		const onboardings = this.data.dashboard.data.activeOnboardings.filter((o) => personnelIds.has(o.personnelId));
		const completionSet = new SvelteSet(this.data.onboardingTrainingCompletions ?? []);

		return onboardings.map((o) => {
			const person = this.findRosterPerson(o.personnelId);
			const personName = person ? `${person.rank} ${person.lastName}, ${person.firstName}` : 'Unknown';
			const steps = ((o.steps ?? []) as { stepType: string; trainingTypeId?: string; completed: boolean }[]).map(
				(step) => {
					if (step.stepType === 'training' && step.trainingTypeId && !step.completed) {
						const hasTraining = completionSet.has(`${o.personnelId}-${step.trainingTypeId}`);
						return { ...step, completed: hasTraining };
					}
					return step;
				}
			);
			const totalSteps = steps.length;
			const completedSteps = steps.filter((s) => s.completed).length;

			return {
				id: o.id,
				personnelId: o.personnelId,
				personName,
				totalSteps,
				completedSteps,
				pct: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
			};
		});
	}

	get groupBreakdown(): DashboardGroupBreakdownRow[] {
		const pinnedSet = new SvelteSet(this.sources.pinnedGroups.list);
		const sorted = [...this.sources.groups.items].sort((a, b) => {
			const aPinned = pinnedSet.has(a.name);
			const bPinned = pinnedSet.has(b.name);
			if (aPinned && !bPinned) return -1;
			if (!aPinned && bPinned) return 1;
			return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
		});

		return sorted.map((group) => {
			const groupPersonnel = this.rosterPersonnel.filter((p) => p.groupId === group.id);
			const total = groupPersonnel.length;
			const unavailable = groupPersonnel.filter((p) => this.unavailablePersonnelIds.has(p.id)).length;
			const available = total - unavailable;
			const pct = total > 0 ? Math.round((available / total) * 100) : 100;
			const statusCounts = new SvelteMap<string, number>();

			for (const person of groupPersonnel) {
				const entry = this.todayEntries.find((e) => e.personnelId === person.id);
				if (entry) {
					statusCounts.set(entry.statusTypeId, (statusCounts.get(entry.statusTypeId) ?? 0) + 1);
				}
			}

			return {
				id: group.id,
				name: group.name,
				total,
				available,
				pct,
				statusCounts,
				isPinned: pinnedSet.has(group.name)
			};
		});
	}

	get dutyStrengthPct(): number {
		return this.totalPersonnel > 0 ? Math.round((this.availableCount / this.totalPersonnel) * 100) : 100;
	}

	get ratingStats(): { overdue: number; 'due-30': number; 'due-60': number; current: number } {
		const counts = { overdue: 0, 'due-30': 0, 'due-60': 0, current: 0 };
		for (const entry of this.data.dashboard.data.ratingSchemeEntries) {
			const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
			if (status !== 'completed') {
				counts[status as keyof typeof counts]++;
			}
		}
		return counts;
	}

	get ratingTotal(): number {
		return (
			this.ratingStats.overdue + this.ratingStats['due-30'] + this.ratingStats['due-60'] + this.ratingStats.current
		);
	}

	get nonAvailablePersonnel(): DashboardOutTodayRow[] {
		return this.todayEntries
			.map((e) => {
				const person = this.findRosterPerson(e.personnelId);
				const st = this.sources.statusTypes.items.find((s) => s.id === e.statusTypeId);
				if (!person || !st) return null;
				const groupId = person.groupId ?? null;
				const group = groupId ? this.sources.groups.items.find((g) => g.id === groupId) : null;
				return {
					id: e.id,
					personnelId: e.personnelId,
					personName: `${person.rank} ${person.lastName}, ${person.firstName}`,
					rank: person.rank ?? '',
					statusName: st.name,
					statusColor: st.color,
					statusTextColor: st.textColor,
					startDate: e.startDate,
					endDate: e.endDate,
					statusTypeId: e.statusTypeId,
					groupId,
					groupName: group?.name ?? 'Unassigned'
				};
			})
			.filter((x): x is DashboardOutTodayRow => x !== null)
			.sort((a, b) => a.personName.localeCompare(b.personName));
	}

	dutyForDays(count: number): DashboardDutyDayView[] {
		const days: DashboardDutyDayView[] = [];
		for (let i = 0; i < count; i++) {
			const dateStr = dateAfter(this.today, i);
			const assignments = this.sources.dailyAssignments.assignments
				.filter((a) => a.date === dateStr)
				.map((a) => this.toDutyAssignmentRow(a));
			days.push({ date: dateStr, isToday: i === 0, assignments });
		}
		return days;
	}

	get trainingCurrencyPct(): number {
		const stats = this.trainingStats;
		if (!stats || this.totalPersonnel === 0) return 100;

		const withIssues = new SvelteSet<string>();
		for (const issue of this.topTrainingIssues) {
			if (issue.personName) withIssues.add(issue.personName);
		}

		const totalRecordIssues = stats.expired + stats.warningOrange + stats.warningYellow;
		if (totalRecordIssues === 0) return 100;
		if (withIssues.size === 0) return 0;

		return Math.max(0, Math.round(((this.totalPersonnel - withIssues.size) / this.totalPersonnel) * 100));
	}

	get onLeaveCount(): number {
		return this.todayEntries.filter((e) => {
			const st = this.sources.statusTypes.items.find((s) => s.id === e.statusTypeId);
			return st?.name?.toLowerCase().includes('leave') ?? false;
		}).length;
	}

	quickStatValue(metricId: string): number {
		switch (metricId) {
			case 'present-strength':
				return this.availableCount;
			case 'total-strength':
				return this.totalPersonnel;
			case 'non-available-today':
				return this.unavailablePersonnelIds.size;
			case 'on-leave':
				return this.onLeaveCount;
			case 'training-currency':
				return this.trainingCurrencyPct;
			case 'expired-training':
				return this.trainingStats?.expired ?? 0;
			case 'onboardings-in-progress':
				return this.activeOnboardings.length;
			case 'evaluations-overdue':
				return this.ratingStats.overdue;
			case 'evaluations-due-30':
				return this.ratingStats['due-30'];
			default:
				return 0;
		}
	}

	quickStatUnit(metricId: string): string {
		return metricId === 'training-currency' ? '%' : '';
	}

	get trainingGroupDelinquencies(): { groupName: string; count: number; pct: number }[] {
		const stats = this.trainingStats;
		if (!stats) return [];

		return this.groupBreakdown
			.map((g) => {
				const total = g.total;
				const overallTotal = this.totalPersonnel;
				const estimated =
					overallTotal > 0 ? Math.round(((stats.expired + stats.warningOrange) * total) / overallTotal) : 0;
				return {
					groupName: g.name,
					count: estimated,
					pct: total > 0 ? Math.round((estimated / total) * 100) : 0
				};
			})
			.filter((g) => g.count > 0)
			.sort((a, b) => b.count - a.count);
	}

	formatShortDate(dateStr: string): string {
		const d = parseDate(dateStr);
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${months[d.getMonth()]} ${d.getDate()}`;
	}

	get upcomingLosses(): UpcomingLossRecord[] {
		const warningWindowDays = this.data.dashboard.data.lossWarningWindowDays ?? 180;
		return evaluateUpcomingLosses(this.rosterPersonnel, warningWindowDays, this.today, {
			awardTrackingAcknowledgedPersonnelIds: this.data.dashboard.data.awardTrackingAcknowledgedPersonnelIds ?? []
		});
	}

	get unitReadiness(): DashboardUnitReadinessView {
		const availPct = this.dutyStrengthPct;
		return {
			availabilityColor,
			availPct,
			availColor: availabilityColor(availPct),
			trainingColor: availabilityColor(this.trainingCurrencyPct),
			statusEntries: [...this.statusBreakdown.entries()],
			upcomingChanges: {
				mode: this.upcomingGroupBy,
				setMode: (mode) => this.setUpcomingGroupBy(mode),
				byGroup: this.upcomingChangesByGroup
			}
		};
	}

	get upcomingChangesByGroup(): GroupedEntries<DashboardUpcomingChangeRow> {
		return groupEntries(this.upcomingChanges, (change) => change.groupName, sortGroupName);
	}

	get upcomingChangesByDate(): GroupedEntries<DashboardUpcomingChangeRow> {
		return groupEntries(
			this.upcomingChanges,
			(change) => change.date,
			(a, b) => a.localeCompare(b)
		);
	}

	private setUpcomingGroupBy(mode: UpcomingGroupBy) {
		this.upcomingGroupBy = mode;
		writePreference(this.storage, UPCOMING_KEY, mode);
	}

	private toDutyAssignmentRow(assignment: DailyAssignment): DashboardDutyAssignmentRow {
		const type = this.sources.dailyAssignments.types.find((t) => t.id === assignment.assignmentTypeId);
		let assigneeName = '';
		if (type?.assignTo === 'personnel') {
			const person = this.findRosterPerson(assignment.assigneeId);
			if (person) assigneeName = `${person.rank} ${person.lastName}`;
		} else {
			assigneeName = assignment.assigneeId;
		}
		const color = type?.color ?? '#9e9e9e';
		return {
			id: assignment.id,
			typeName: type?.name ?? 'Unknown',
			shortName: type?.shortName ?? '',
			color,
			textColor: hexToTextColor(color),
			assigneeName
		};
	}

	private get rosterPersonnel(): Personnel[] {
		return this.rosterView.flatPersonnel;
	}

	private findRosterPerson(personnelId: string | null | undefined): Personnel | undefined {
		return personnelId ? this.rosterView.getById(personnelId) : undefined;
	}
}

function createDefaultDashboardStoreSources(): DashboardStoreSources {
	return {
		personnel: rosterStore,
		statusTypes: statusTypesStore,
		availability: availabilityStore,
		dailyAssignments: dailyAssignmentsStore,
		groups: groupsStore,
		pinnedGroups: pinnedGroupsStore
	};
}

function createBrowserStoragePort(): DashboardStoragePort | null {
	const storage = getBrowserLocalStorage();
	if (!browser || !storage) return null;

	return {
		getItem(key) {
			return storage.getItem(key);
		},
		setItem(key, value) {
			storage.setItem(key, value);
		}
	};
}

function readPreference<T extends string>(
	storage: DashboardStoragePort | null,
	key: string,
	allowed: readonly T[],
	fallback: T
): T {
	if (!storage) return fallback;
	try {
		const saved = storage.getItem(key);
		return allowed.includes(saved as T) ? (saved as T) : fallback;
	} catch {
		return fallback;
	}
}

function writePreference(storage: DashboardStoragePort | null, key: string, value: string) {
	if (!storage) return;
	try {
		storage.setItem(key, value);
	} catch {
		// Preference persistence is best-effort; the UI state has already updated.
	}
}

function groupEntries<T>(
	items: T[],
	getKey: (item: T) => string,
	sort: (a: string, b: string) => number
): GroupedEntries<T> {
	const grouped: Record<string, T[]> = {};
	for (const item of items) {
		const key = getKey(item);
		(grouped[key] ??= []).push(item);
	}
	return Object.entries(grouped).sort(([a], [b]) => sort(a, b));
}

function sortGroupName(a: string, b: string): number {
	if (a === 'Unassigned') return 1;
	if (b === 'Unassigned') return -1;
	return a.localeCompare(b);
}

function availabilityColor(pct: number): string {
	if (pct >= 90) return 'var(--chart-2)';
	if (pct >= 75) return 'var(--accent)';
	return 'var(--destructive)';
}

function hexToTextColor(hex: string): string {
	const clean = hex.replace('#', '');
	const r = parseInt(clean.slice(0, 2), 16) / 255;
	const g = parseInt(clean.slice(2, 4), 16) / 255;
	const b = parseInt(clean.slice(4, 6), 16) / 255;
	const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
	const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
	return L > 0.179 ? '#1a1a1a' : '#ffffff';
}

function formatToday(date: Date | SvelteDate): string {
	return formatDate(date);
}

function dateAfter(dateStr: string, days: number): string {
	const d = new SvelteDate(`${dateStr}T00:00:00`);
	d.setDate(d.getDate() + days);
	return formatToday(d);
}
