import { createRosterReadModel, type RosterReadModelView } from '$features/personnel/contracts';
import { rosterStore } from '$features/personnel';
import { calendarStatusSource, calendarAvailabilitySource, calendarAssignmentsSource } from '$features/calendar';
import { pinnedGroupsStore } from '$features/personnel';
import { groupsStore } from '$features/personnel';
import type { Group } from '$features/personnel/contracts';
import { getRatingDueStatus } from '$features/rating-scheme/contracts';
import { formatDate, parseDate } from '$lib/utils/dates';
import { evaluateUpcomingLosses, type UpcomingLossRecord } from '$features/personnel/contracts';
import { SvelteDate, SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, StatusType, DailyAssignment } from '$features/calendar/contracts';
import type { DashboardPageData } from '$features/dashboard/contracts';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { getProgress } from '$features/onboarding/contracts';
import { groupPersonnelByGroupId, indexById, indexTodayAvailability } from './dashboardIndexes';
import { availabilityPercent, isBelowStrengthFloor } from '$features/organization/contracts';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import {
	activeDashboardSections,
	type DashboardBlock,
	type DashboardInputs,
	type DashboardSection,
	type QuickAddEntry
} from '../sections/dashboardSections';
import { buildNeedsYouQueue, type NeedsYouQueue } from '../sections/needsYou';
import { placeForecastLaneMarks, type PlacedLaneMark } from '../sections/forecastLanes';
import type {
	StarterConfigurationPackApplyResult,
	StarterConfigurationPackId,
	StarterConfigurationPackSupport
} from '$features/dashboard/contracts';

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
	sources?: DashboardStoreSources;
	/** Every section the page can show; the model keeps the ones whose feature is on. */
	sections?: readonly DashboardSection[];
}

export interface DashboardForecastLaneView {
	id: string;
	label: string;
	marks: readonly PlacedLaneMark[];
}

const FORECAST_DAYS = 14;

export interface DashboardSupportData {
	trainingTypeCount?: number;
	onboardingTemplateStepCount: number;
	ratingSchemeEntryCount: number;
	orgMemberCount: number;
	gettingStartedDismissed: boolean;
	starterConfigurationPacks?: StarterConfigurationPackSupport[];
}

export interface DashboardStarterPackApplyState {
	status: 'idle' | 'pending' | 'success' | 'error';
	message: string | null;
	result: StarterConfigurationPackApplyResult | null;
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

export interface DashboardUnitReadinessView {
	availabilityColor(pct: number): string;
	trainingCurrencyColor(pct: number): string;
	availPct: number;
	availColor: string;
	trainingColor: string;
	statusEntries: Array<[string, DashboardStatusBreakdown]>;
}

export function createDashboardScreenModel(
	data: DashboardPageData,
	options: DashboardScreenModelOptions = {}
): DashboardScreenModel {
	return new DashboardScreenModel(data, options);
}

export class DashboardScreenModel {
	readonly data: DashboardPageData;
	readonly today: string;
	readonly forecastDays: readonly string[];
	readonly sections: readonly DashboardSection[];
	private readonly sources: DashboardStoreSources;

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

	private todayAvailability = $derived.by(() =>
		indexTodayAvailability(this.sources.availability.items, this.today, this.rosterView.personnelById)
	);
	private statusTypeById = $derived.by(() => indexById(this.sources.statusTypes.items));
	private groupById = $derived.by(() => indexById(this.sources.groups.items));

	private inputs = $derived.by<DashboardInputs>(() => ({
		today: this.today,
		timeZone: this.data.viewerDay.timeZone,
		forecastDays: this.forecastDays,
		personnel: this.rosterView.flatPersonnel,
		availability: this.sources.availability.items,
		statusTypes: this.sources.statusTypes.items,
		groups: this.sources.groups.items,
		assignmentTypes: this.sources.dailyAssignments.types,
		assignments: this.sources.dailyAssignments.assignments,
		page: this.data
	}));

	needsYou = $derived.by<NeedsYouQueue>(() =>
		buildNeedsYouQueue(this.sections.flatMap((entry) => entry.needsYou.map((source) => source(this.inputs))))
	);

	forecastLanes = $derived.by<DashboardForecastLaneView[]>(() =>
		this.sections.flatMap((entry) =>
			entry.forecastLanes.map((lane) => ({
				id: lane.id,
				label: lane.label,
				marks: placeForecastLaneMarks(this.forecastDays, lane.marks(this.inputs))
			}))
		)
	);

	get quickAdd(): readonly QuickAddEntry[] {
		return this.sections.flatMap((entry) => entry.quickAdd);
	}

	get readinessColumns(): readonly DashboardBlock[] {
		return this.sections.flatMap((entry) => (entry.readiness ? [entry.readiness] : []));
	}

	get onDutyBlocks(): readonly DashboardBlock[] {
		return this.sections.flatMap((entry) => entry.onDuty);
	}

	gettingStartedDismissed = $state(false);
	starterPackApplyState = $state<DashboardStarterPackApplyState>({
		status: 'idle',
		message: null,
		result: null
	});
	private supportData = $state<DashboardSupportData | null>(null);

	constructor(data: DashboardPageData, options: DashboardScreenModelOptions = {}) {
		this.data = data;
		this.today = data.viewerDay.date;
		const todayNumber = toDayNumber(this.today);
		this.forecastDays = Array.from({ length: FORECAST_DAYS }, (_, offset) => fromDayNumber(todayNumber + offset));
		this.sources = options.sources ?? createDefaultDashboardStoreSources();
		this.sections = activeDashboardSections(options.sections ?? [], data.disabledFeatures);

		if (
			typeof data.onboardingTemplateStepCount === 'number' &&
			typeof data.ratingSchemeEntryCount === 'number' &&
			typeof data.orgMemberCount === 'number' &&
			typeof data.gettingStartedDismissed === 'boolean'
		) {
			this.applySupportData({
				trainingTypeCount: data.trainingTypeCount,
				onboardingTemplateStepCount: data.onboardingTemplateStepCount,
				ratingSchemeEntryCount: data.ratingSchemeEntryCount,
				orgMemberCount: data.orgMemberCount,
				gettingStartedDismissed: data.gettingStartedDismissed,
				starterConfigurationPacks: data.starterConfigurationPacks
			});
		}
	}

	get personnelCount(): number {
		return this.data.dashboard.data.personnel.length;
	}

	get trainingTypeCount(): number {
		return this.supportData?.trainingTypeCount ?? dashboardTrainingTypeCount(this.data);
	}

	get userRole(): string | undefined {
		return this.data.userRole as string | undefined;
	}

	isFeatureOn(feature: FeatureKey): boolean {
		return !this.data.disabledFeatures.includes(feature);
	}

	get hasSupportData(): boolean {
		return this.supportData !== null;
	}

	get starterConfigurationPacks(): StarterConfigurationPackSupport[] {
		return this.supportData?.starterConfigurationPacks ?? [];
	}

	get firstStarterConfigurationPack(): StarterConfigurationPackSupport | null {
		return this.starterConfigurationPacks[0] ?? null;
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
		this.supportData = {
			...data,
			trainingTypeCount: data.trainingTypeCount ?? dashboardTrainingTypeCount(this.data),
			starterConfigurationPacks: data.starterConfigurationPacks ?? []
		};
		this.gettingStartedDismissed = data.gettingStartedDismissed;
	}

	async applyStarterConfigurationPack(
		packId: StarterConfigurationPackId
	): Promise<StarterConfigurationPackApplyResult | null> {
		this.starterPackApplyState = {
			status: 'pending',
			message: null,
			result: null
		};

		try {
			const response = await fetch(`/org/${this.data.orgId}/api/starter-configuration-packs/${packId}/apply`, {
				method: 'POST'
			});
			if (!response.ok) {
				throw new Error(await responseMessage(response, 'Starter pack could not be applied.'));
			}

			const result = (await response.json()) as StarterConfigurationPackApplyResult;
			const hasFailedArtifacts = result.failed.length > 0;
			let refreshWarning: string | null = null;

			try {
				const supportResponse = await fetch(`/org/${this.data.orgId}/api/getting-started`);
				if (!supportResponse.ok) {
					refreshWarning = await responseMessage(supportResponse, 'Checklist could not refresh.');
				} else {
					this.applySupportData((await supportResponse.json()) as DashboardSupportData);
				}
			} catch (error) {
				refreshWarning = errorMessage(error, 'Checklist could not refresh.');
			}

			if (hasFailedArtifacts) {
				this.starterPackApplyState = {
					status: 'error',
					message: 'Some starter artifacts could not be created.',
					result
				};
				return null;
			}

			if (refreshWarning) {
				this.starterPackApplyState = {
					status: 'success',
					message: checklistRefreshWarning(result.packName, refreshWarning),
					result
				};
				return result;
			}

			this.starterPackApplyState = {
				status: 'success',
				message: `${result.packName} applied. You can edit the created setup from each workflow.`,
				result
			};
			return result;
		} catch (error) {
			this.starterPackApplyState = {
				status: 'error',
				message: errorMessage(error, 'Starter pack could not be applied.'),
				result: null
			};
			return null;
		}
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

	get isHydrating(): boolean {
		return (
			this.sources.personnel.loading === true ||
			this.sources.statusTypes.loading === true ||
			this.sources.availability.loading === true ||
			this.sources.dailyAssignments.loading === true ||
			this.sources.groups.loading === true
		);
	}

	get todayEntries(): AvailabilityEntry[] {
		return this.todayAvailability.entries;
	}

	get totalPersonnel(): number {
		return this.rosterPersonnel.length;
	}

	get availableCount(): number {
		return this.totalPersonnel - this.todayAvailability.byPersonnelId.size;
	}

	get statusBreakdown(): Map<string, DashboardStatusBreakdown> {
		const map = new SvelteMap<string, DashboardStatusBreakdown>();
		for (const entry of this.todayEntries) {
			const st = this.statusTypeById.get(entry.statusTypeId);
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

	get trainingStats() {
		return this.data.trainingSummary?.stats ?? null;
	}

	upcomingChanges = $derived.by<DashboardUpcomingChangeRow[]>(() => {
		const sevenDaysOut = dateAfter(this.today, 7);
		const changes: DashboardUpcomingChangeRow[] = [];

		for (const entry of this.sources.availability.items) {
			const person = this.findRosterPerson(entry.personnelId);
			const st = this.statusTypeById.get(entry.statusTypeId);
			if (!person || !st) continue;

			const groupId = person.groupId ?? null;
			const group = groupId ? this.groupById.get(groupId) : null;
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
	});

	get activeOnboardings(): DashboardOnboardingProgressRow[] {
		const onboardings = this.data.dashboard.data.activeOnboardings.filter((o) => this.findRosterPerson(o.personnelId));
		const completionSet = new SvelteSet(this.data.onboardingTrainingCompletions ?? []);

		return onboardings.map((o) => {
			const person = this.findRosterPerson(o.personnelId);
			const personName = person ? `${person.rank} ${person.lastName}, ${person.firstName}` : 'Unknown';
			const steps = o.steps.map((step) => {
				if (this.data.trainingSummary && step.active && step.stepType === 'training' && step.trainingTypeId) {
					const hasTraining = completionSet.has(`${o.personnelId}-${step.trainingTypeId}`);
					return { ...step, completed: hasTraining };
				}
				return step;
			});
			const { total: totalSteps, completed: completedSteps } = getProgress({ ...o, steps });

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

	groupBreakdown = $derived.by<DashboardGroupBreakdownRow[]>(() => {
		const pinnedSet = new SvelteSet(this.sources.pinnedGroups.list);
		const sorted = [...this.sources.groups.items].sort((a, b) => {
			const aPinned = pinnedSet.has(a.name);
			const bPinned = pinnedSet.has(b.name);
			if (aPinned && !bPinned) return -1;
			if (!aPinned && bPinned) return 1;
			return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
		});
		const todayByPersonnelId = this.todayAvailability.byPersonnelId;
		const personnelByGroupId = groupPersonnelByGroupId(this.rosterPersonnel);

		return sorted.map((group) => {
			const groupPersonnel = personnelByGroupId.get(group.id) ?? [];
			const total = groupPersonnel.length;
			const statusCounts = new SvelteMap<string, number>();
			let unavailable = 0;

			for (const person of groupPersonnel) {
				const entry = todayByPersonnelId.get(person.id);
				if (entry) {
					unavailable++;
					statusCounts.set(entry.statusTypeId, (statusCounts.get(entry.statusTypeId) ?? 0) + 1);
				}
			}

			const available = total - unavailable;
			return {
				id: group.id,
				name: group.name,
				total,
				available,
				pct: availabilityPercent(available, total),
				statusCounts,
				isPinned: pinnedSet.has(group.name)
			};
		});
	});

	get dutyStrengthPct(): number {
		return availabilityPercent(this.availableCount, this.totalPersonnel);
	}

	get ratingStats(): { overdue: number; 'due-30': number; 'due-60': number; current: number } {
		const counts = { overdue: 0, 'due-30': 0, 'due-60': 0, current: 0 };
		const today = parseDate(this.today);
		for (const entry of this.data.dashboard.data.ratingSchemeEntries) {
			const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status, today);
			if (status !== 'completed') {
				counts[status as keyof typeof counts]++;
			}
		}
		return counts;
	}

	nonAvailablePersonnel = $derived.by<DashboardOutTodayRow[]>(() =>
		this.todayEntries
			.map((e) => {
				const person = this.findRosterPerson(e.personnelId);
				const st = this.statusTypeById.get(e.statusTypeId);
				if (!person || !st) return null;
				const groupId = person.groupId ?? null;
				const group = groupId ? this.groupById.get(groupId) : null;
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
			.sort((a, b) => a.personName.localeCompare(b.personName))
	);

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
		const summary = this.data.trainingSummary;
		if (!summary || this.totalPersonnel === 0) return 100;

		const delinquentPersonnel = summary.groupDelinquencies.reduce(
			(total, group) => total + group.delinquentPersonnelCount,
			0
		);
		return Math.max(0, Math.round(((this.totalPersonnel - delinquentPersonnel) / this.totalPersonnel) * 100));
	}

	get expiredTrainingPersonnelCount(): number {
		return this.data.trainingSummary?.expiredPersonnelCount ?? 0;
	}

	get trainingGroupDelinquencies(): {
		groupId: string | null;
		groupName: string;
		count: number;
		expiredPersonnelCount: number;
		pct: number;
	}[] {
		const groups = new SvelteMap(this.sources.groups.items.map((group) => [group.id, group]));
		const groupTotals = new SvelteMap<string | null, number>();
		for (const person of this.rosterPersonnel) {
			const groupId = person.groupId ?? null;
			groupTotals.set(groupId, (groupTotals.get(groupId) ?? 0) + 1);
		}
		return (this.data.trainingSummary?.groupDelinquencies ?? [])
			.map((group) => {
				const total = groupTotals.get(group.groupId) ?? 0;
				return {
					groupId: group.groupId,
					groupName: group.groupId === null ? 'Unassigned' : (groups.get(group.groupId)?.name ?? 'Unknown group'),
					count: group.delinquentPersonnelCount,
					expiredPersonnelCount: group.expiredPersonnelCount,
					pct: total > 0 ? Math.round((group.delinquentPersonnelCount / total) * 100) : 0
				};
			})
			.filter((group) => group.count > 0)
			.sort((a, b) => b.count - a.count);
	}

	formatShortDate(dateStr: string): string {
		const d = parseDate(dateStr);
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${months[d.getMonth()]} ${d.getDate()}`;
	}

	get upcomingLosses(): UpcomingLossRecord[] {
		if (!this.isFeatureOn('lossesAndAwards')) return [];
		const warningWindowDays = this.data.dashboard.data.lossWarningWindowDays ?? 180;
		return evaluateUpcomingLosses(this.rosterPersonnel, warningWindowDays, this.today, {
			awardTrackingAcknowledgedPersonnelIds: this.data.dashboard.data.awardTrackingAcknowledgedPersonnelIds ?? []
		});
	}

	get unitReadiness(): DashboardUnitReadinessView {
		const availPct = this.dutyStrengthPct;
		const floor = this.data.dashboard.data.strengthFloorPercent;
		const availabilityColor = (pct: number) => strengthColor(pct, floor);
		return {
			availabilityColor,
			trainingCurrencyColor,
			availPct,
			availColor: availabilityColor(availPct),
			trainingColor: trainingCurrencyColor(this.trainingCurrencyPct),
			statusEntries: [...this.statusBreakdown.entries()]
		};
	}

	private toDutyAssignmentRow(assignment: DailyAssignment): DashboardDutyAssignmentRow {
		const type = this.sources.dailyAssignments.types.find((t) => t.id === assignment.assignmentTypeId);
		let assigneeName = '';
		if (type?.assignTo === 'personnel') {
			const person = this.findRosterPerson(assignment.assigneeId);
			if (person) assigneeName = `${person.rank} ${person.lastName}`;
		} else {
			assigneeName =
				this.sources.groups.items.find((group) => group.id === assignment.assigneeId)?.name ?? 'Unknown Group';
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
		statusTypes: calendarStatusSource,
		availability: calendarAvailabilitySource,
		dailyAssignments: calendarAssignmentsSource,
		groups: groupsStore,
		pinnedGroups: pinnedGroupsStore
	};
}

function dashboardTrainingTypeCount(data: DashboardPageData): number {
	return data.dashboard?.data?.trainingTypes?.length ?? 0;
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
	const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
	return payload?.message ?? payload?.error ?? fallback;
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

function checklistRefreshWarning(packName: string, detail: string): string {
	const base = `${packName} applied, but the setup checklist could not refresh. Reload the page to see the latest setup state.`;
	return detail && detail !== 'Checklist could not refresh.' ? `${base} ${detail}` : base;
}

function strengthColor(pct: number, floorPercent: number): string {
	return isBelowStrengthFloor(pct, floorPercent) ? 'var(--warning-foreground)' : 'var(--success-foreground)';
}

function trainingCurrencyColor(pct: number): string {
	if (pct >= 90) return 'var(--success-foreground)';
	if (pct >= 75) return 'var(--warning-foreground)';
	return 'var(--danger-foreground)';
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

function dateAfter(dateStr: string, days: number): string {
	const d = new SvelteDate(`${dateStr}T00:00:00`);
	d.setDate(d.getDate() + days);
	return formatDate(d);
}
