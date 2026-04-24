import { browser } from '$app/environment';
import { changelog } from '$lib/data/changelog';
import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
import { formatDate, parseDate } from '$lib/utils/dates';
import type { TrainingStats } from '$features/training/utils/trainingStatus';
import type { OrganizationMemberPermissions } from '$lib/types';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import type { HydrationPlan } from '$lib/server/core/orgShell';
import {
	createDashboardScreenModel,
	type DashboardScreenModel
} from '$features/dashboard/read-model/dashboardScreenModel.svelte';

export interface TrainingIssue {
	personName: string;
	typeName: string;
	status: string;
	label: string;
}

export interface DashboardSupportData {
	onboardingTemplateStepCount: number;
	ratingSchemeEntryCount: number;
	orgMemberCount: number;
	gettingStartedDismissed: boolean;
}

// Shape of page data from (dashboard)/+layout.server.ts + +page.server.ts
export interface DashboardPageData {
	orgId: string;
	orgName: string;
	userId: string | null;
	permissions: OrganizationMemberPermissions | null;
	dashboard: { data: DashboardBootstrap; hydration?: HydrationPlan; workspace: string };
	trainingSummary: { stats: TrainingStats; issues: TrainingIssue[] } | null;
	onboardingTrainingCompletions: string[];
	onboardingTemplateStepCount?: number;
	ratingSchemeEntryCount?: number;
	orgMemberCount?: number;
	gettingStartedDismissed?: boolean;
	[key: string]: unknown;
}

export class DashboardContext {
	// ---------------------------------------------------------------------------
	// Raw page data (injected from route)
	// ---------------------------------------------------------------------------
	readonly data: DashboardPageData;
	readonly screen: DashboardScreenModel;

	// ---------------------------------------------------------------------------
	// Banner state
	// ---------------------------------------------------------------------------
	gettingStartedDismissed = $state(false);
	private supportData = $state<DashboardSupportData | null>(null);

	// ---------------------------------------------------------------------------
	// "Today" (client local timezone)
	// ---------------------------------------------------------------------------
	readonly today: string;

	constructor(data: DashboardPageData) {
		this.data = data;
		// Date is intentional here so Vitest fake timers preserve dashboard compatibility tests.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		this.today = formatDate(new Date());
		this.screen = createDashboardScreenModel(data, { today: this.today });

		if (
			typeof data.onboardingTemplateStepCount === 'number' &&
			typeof data.ratingSchemeEntryCount === 'number' &&
			typeof data.orgMemberCount === 'number' &&
			typeof data.gettingStartedDismissed === 'boolean'
		) {
			this.applySupportData({
				onboardingTemplateStepCount: data.onboardingTemplateStepCount,
				ratingSchemeEntryCount: data.ratingSchemeEntryCount,
				orgMemberCount: data.orgMemberCount,
				gettingStartedDismissed: data.gettingStartedDismissed
			});
		}
	}

	// ---------------------------------------------------------------------------
	// localStorage side-effects — call once inside $effect (browser only)
	// ---------------------------------------------------------------------------
	autoShowWhatsNew(hasShown: { value: boolean }) {
		if (browser && !hasShown.value && changelog.length > 0 && this.data.userId) {
			if (typeof globalThis.localStorage?.getItem !== 'function') {
				return;
			}

			let lastSeen: string | null = null;
			try {
				lastSeen = globalThis.localStorage.getItem(`changelog-last-seen-${this.data.userId}`);
			} catch {
				return;
			}

			if (lastSeen !== changelog[0].id) {
				hasShown.value = true;
				whatsNewStore.show();
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Typed getters for fields that flow through the index signature
	// (avoids 'unknown' errors when accessing these in templates)
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

	get userRole(): string | undefined {
		return this.data.userRole as string | undefined;
	}

	get isDemoSandbox(): boolean {
		return !!(this.data.isDemoSandbox as boolean | undefined);
	}

	get isDemoReadOnly(): boolean {
		return !!(this.data.isDemoReadOnly as boolean | undefined);
	}

	get isHydrating(): boolean {
		return this.screen.isHydrating;
	}

	get unitReadiness() {
		return this.screen.unitReadiness;
	}

	get peopleDuty() {
		return this.screen.peopleDuty;
	}

	get trainingEvals() {
		return this.screen.trainingEvals;
	}

	// ---------------------------------------------------------------------------
	// Banner handlers
	// ---------------------------------------------------------------------------
	async dismissGettingStarted() {
		this.gettingStartedDismissed = true;
		await fetch(`/org/${this.data.orgId}/api/getting-started`, { method: 'POST' });
	}

	applySupportData(data: DashboardSupportData) {
		this.supportData = data;
		this.gettingStartedDismissed = data.gettingStartedDismissed;
	}

	// ---------------------------------------------------------------------------
	// Derived: todayDisplay
	// ---------------------------------------------------------------------------
	get todayDisplay(): string {
		const d = parseDate(this.today);
		const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
	}

	// ---------------------------------------------------------------------------
	// Derived: personnelIds (scoped)
	// ---------------------------------------------------------------------------
	get personnelIds(): Set<string> {
		return this.screen.personnelIds;
	}

	// ---------------------------------------------------------------------------
	// Derived: todayEntries (availability covering today, scoped)
	// ---------------------------------------------------------------------------
	get todayEntries() {
		return this.screen.todayEntries;
	}

	// ---------------------------------------------------------------------------
	// Derived: unavailablePersonnelIds
	// ---------------------------------------------------------------------------
	get unavailablePersonnelIds(): Set<string> {
		return this.screen.unavailablePersonnelIds;
	}

	// ---------------------------------------------------------------------------
	// Derived: totalPersonnel / availableCount
	// ---------------------------------------------------------------------------
	get totalPersonnel(): number {
		return this.screen.totalPersonnel;
	}

	get availableCount(): number {
		return this.screen.availableCount;
	}

	// ---------------------------------------------------------------------------
	// Derived: statusBreakdown
	// ---------------------------------------------------------------------------
	get statusBreakdown(): Map<string, { name: string; color: string; textColor: string; count: number }> {
		return this.screen.statusBreakdown;
	}

	// ---------------------------------------------------------------------------
	// Derived: dutyAssignments
	// ---------------------------------------------------------------------------
	get dutyAssignments(): {
		id: string;
		typeName: string;
		shortName: string;
		color: string;
		textColor: string;
		assigneeName: string;
	}[] {
		return this.screen.dutyAssignments;
	}

	// ---------------------------------------------------------------------------
	// Derived: todayAdvancedDuty
	// ---------------------------------------------------------------------------
	get todayAdvancedDuty(): Array<{
		id: string;
		templateName: string;
		shortName: string;
		color: string;
		textColor: string;
		slots: Array<{ key: string; roleLabel: string; assigneeName: string }>;
	}> {
		return this.screen.todayAdvancedDuty;
	}

	// ---------------------------------------------------------------------------
	// Derived: trainingStats / topTrainingIssues (server-provided)
	// ---------------------------------------------------------------------------
	get trainingStats(): TrainingStats | null {
		return this.screen.trainingStats;
	}

	get topTrainingIssues(): TrainingIssue[] {
		return this.screen.topTrainingIssues;
	}

	// ---------------------------------------------------------------------------
	// Derived: upcomingChanges (entries starting or ending within 7 days)
	// ---------------------------------------------------------------------------
	get upcomingChanges(): {
		key: string;
		date: string;
		personName: string;
		statusName: string;
		statusColor: string;
		direction: 'departing' | 'returning';
		groupId: string | null;
		groupName: string;
	}[] {
		return this.screen.upcomingChanges;
	}

	// ---------------------------------------------------------------------------
	// Derived: upcomingByDate (grouped)
	// ---------------------------------------------------------------------------
	get upcomingByDate(): Map<string, typeof this.upcomingChanges> {
		return this.screen.upcomingByDate as Map<string, typeof this.upcomingChanges>;
	}

	// ---------------------------------------------------------------------------
	// Derived: activeOnboardings with progress (scoped)
	// ---------------------------------------------------------------------------
	get activeOnboardings(): {
		id: string;
		personnelId: string;
		personName: string;
		totalSteps: number;
		completedSteps: number;
		pct: number;
	}[] {
		return this.screen.activeOnboardings;
	}

	// ---------------------------------------------------------------------------
	// Derived: groupBreakdown (per-group strength)
	// ---------------------------------------------------------------------------
	get groupBreakdown(): {
		id: string;
		name: string;
		total: number;
		available: number;
		pct: number;
		statusCounts: Map<string, number>;
		isPinned: boolean;
	}[] {
		return this.screen.groupBreakdown;
	}

	// ---------------------------------------------------------------------------
	// Derived: dutyStrengthPct
	// ---------------------------------------------------------------------------
	get dutyStrengthPct(): number {
		return this.screen.dutyStrengthPct;
	}

	// ---------------------------------------------------------------------------
	// Derived: ratingStats / ratingTotal
	// ---------------------------------------------------------------------------
	get ratingStats(): { overdue: number; 'due-30': number; 'due-60': number; current: number } {
		return this.screen.ratingStats;
	}

	get ratingTotal(): number {
		return this.screen.ratingTotal;
	}

	// ---------------------------------------------------------------------------
	// Derived: nonAvailablePersonnel — enriched list of who's out today
	// ---------------------------------------------------------------------------
	get nonAvailablePersonnel(): {
		id: string;
		personnelId: string;
		personName: string;
		rank: string;
		statusName: string;
		statusColor: string;
		startDate: string;
		endDate: string;
		statusTypeId: string;
		groupId: string | null;
		groupName: string;
	}[] {
		return this.screen.nonAvailablePersonnel;
	}

	// ---------------------------------------------------------------------------
	// Derived: dutyForDays — duty assignments for today + N upcoming days
	// ---------------------------------------------------------------------------
	dutyForDays(count: number): {
		date: string;
		isToday: boolean;
		assignments: {
			id: string;
			typeName: string;
			shortName: string;
			color: string;
			textColor: string;
			assigneeName: string;
		}[];
	}[] {
		return this.screen.dutyForDays(count);
	}

	// ---------------------------------------------------------------------------
	// Derived: trainingCurrencyPct — % of personnel with all training current
	// ---------------------------------------------------------------------------
	get trainingCurrencyPct(): number {
		return this.screen.trainingCurrencyPct;
	}

	// ---------------------------------------------------------------------------
	// Derived: onLeaveCount — personnel specifically on leave today
	// ---------------------------------------------------------------------------
	get onLeaveCount(): number {
		return this.screen.onLeaveCount;
	}

	// ---------------------------------------------------------------------------
	// Derived: quickStatValue — resolve a metric to its numeric value
	// ---------------------------------------------------------------------------
	quickStatValue(metricId: string): number {
		return this.screen.quickStatValue(metricId);
	}

	// ---------------------------------------------------------------------------
	// Derived: quickStatUnit — optional unit suffix for a metric
	// ---------------------------------------------------------------------------
	quickStatUnit(metricId: string): string {
		return this.screen.quickStatUnit(metricId);
	}

	// ---------------------------------------------------------------------------
	// Derived: trainingGroupDelinquencies — groups sorted by issue count desc
	// ---------------------------------------------------------------------------
	get trainingGroupDelinquencies(): { groupName: string; count: number; pct: number }[] {
		return this.screen.trainingGroupDelinquencies;
	}

	// ---------------------------------------------------------------------------
	// Derived: ratingsDueSoon — entries due within N days, sorted soonest first
	// ---------------------------------------------------------------------------
	ratingsDueSoon(lookaheadDays: number): {
		id: string;
		personName: string;
		ratingPeriodEnd: string;
		status: 'overdue' | 'due-30' | 'due-60' | 'current';
		daysUntil: number;
		evalType: string;
	}[] {
		return this.screen.ratingsDueSoon(lookaheadDays);
	}

	// ---------------------------------------------------------------------------
	// Helper: formatShortDate (used in template)
	// ---------------------------------------------------------------------------
	formatShortDate(dateStr: string): string {
		return this.screen.formatShortDate(dateStr);
	}

	// ---------------------------------------------------------------------------
	// Derived: upcomingLosses — personnel approaching ETS or PCS / DEROS
	// ---------------------------------------------------------------------------
	/**
	 * Ordered list of personnel whose ETS or DEROS falls within the configured
	 * warning window. Nearest departure appears first.
	 *
	 * Backed by the shared `evaluateUpcomingLosses` calculation so the dashboard,
	 * personnel, and calendar surfaces all use the same evaluation logic.
	 * Automatically respects group scoping because `personnelStore.items` only
	 * contains personnel visible to the current user.
	 */
	get upcomingLosses() {
		return this.screen.upcomingLosses;
	}
}
