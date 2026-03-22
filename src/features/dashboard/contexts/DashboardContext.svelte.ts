import { browser } from '$app/environment';
import { changelog } from '$lib/data/changelog';
import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { dashboardPrefsStore, type CardId } from '$lib/stores/dashboardPrefs.svelte';
import { getRatingDueStatus } from '$features/rating-scheme/utils/ratingScheme';
import { getVisibleDashboardCards } from '$lib/utils/dashboardCards';
import { formatDate, parseDate } from '$lib/utils/dates';
import type { TrainingStats } from '$features/training/utils/trainingStatus';
import type { OrganizationMemberPermissions } from '$lib/types';

export const HALF_SIZE_CARDS: CardId[] = ['strength', 'duty', 'training', 'upcoming', 'ratings'];

export interface TrainingIssue {
	personName: string;
	typeName: string;
	status: string;
	label: string;
}

// Shape of page data from +page.server.ts
export interface DashboardPageData {
	orgId: string;
	orgName: string;
	userId: string | null;
	permissions: OrganizationMemberPermissions | null;
	availabilityEntries: unknown[];
	assignmentTypes: unknown[];
	todayAssignments: unknown[];
	pinnedGroups: unknown[];
	trainingSummary: { stats: TrainingStats; issues: TrainingIssue[] } | null;
	onboardingTrainingCompletions: string[];
	activeOnboardings: { personnelId: string; steps?: unknown[]; id: string }[];
	ratingSchemeEntries: { ratingPeriodEnd: string; status: string }[];
	onboardingTemplateStepCount: number;
	ratingSchemeEntryCount: number;
	orgMemberCount: number;
	gettingStartedDismissed: boolean;
	[key: string]: unknown;
}

export class DashboardContext {
	// ---------------------------------------------------------------------------
	// Raw page data (injected from route)
	// ---------------------------------------------------------------------------
	readonly data: DashboardPageData;

	// ---------------------------------------------------------------------------
	// Modal state
	// ---------------------------------------------------------------------------
	showCustomizeModal = $state(false);

	// ---------------------------------------------------------------------------
	// Banner state
	// ---------------------------------------------------------------------------
	bannerDismissed = $state(true); // default true to avoid flash
	gettingStartedDismissed = $state(false);

	// ---------------------------------------------------------------------------
	// "Today" (client local timezone)
	// ---------------------------------------------------------------------------
	readonly today: string;

	constructor(data: DashboardPageData) {
		this.data = data;
		this.today = formatDate(new Date());
		this.gettingStartedDismissed = data.gettingStartedDismissed;
	}

	// ---------------------------------------------------------------------------
	// Store hydration — call once inside $effect in the route
	// ---------------------------------------------------------------------------
	hydrateStores() {
		availabilityStore.load(
			this.data.availabilityEntries as Parameters<typeof availabilityStore.load>[0],
			this.data.orgId
		);
		dailyAssignmentsStore.load(
			this.data.assignmentTypes as Parameters<typeof dailyAssignmentsStore.load>[0],
			this.data.todayAssignments as Parameters<typeof dailyAssignmentsStore.load>[1],
			this.data.orgId
		);
		pinnedGroupsStore.load(this.data.pinnedGroups as Parameters<typeof pinnedGroupsStore.load>[0], this.data.orgId);
	}

	// ---------------------------------------------------------------------------
	// localStorage side-effects — call once inside $effect (browser only)
	// ---------------------------------------------------------------------------
	initBannerFromStorage() {
		if (browser) {
			const key = `guide-dismissed-${this.data.userId}-${this.data.orgId}`;
			this.bannerDismissed = localStorage.getItem(key) === 'true';
		}
	}

	autoShowWhatsNew(hasShown: { value: boolean }) {
		if (browser && !hasShown.value && changelog.length > 0 && this.data.userId) {
			const lastSeen = localStorage.getItem(`changelog-last-seen-${this.data.userId}`);
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
		return (this.data.personnel as unknown[] | undefined)?.length ?? 0;
	}

	get statusTypeCount(): number {
		return (this.data.statusTypes as unknown[] | undefined)?.length ?? 0;
	}

	get trainingTypeCount(): number {
		return (this.data.trainingTypes as unknown[] | undefined)?.length ?? 0;
	}

	get assignmentTypeCount(): number {
		return (this.data.assignmentTypes as unknown[])?.length ?? 0;
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

	// ---------------------------------------------------------------------------
	// Modal helpers
	// ---------------------------------------------------------------------------
	openCustomizeModal() {
		this.showCustomizeModal = true;
	}

	closeCustomizeModal() {
		this.showCustomizeModal = false;
	}

	// ---------------------------------------------------------------------------
	// Banner handlers
	// ---------------------------------------------------------------------------
	dismissBanner() {
		this.bannerDismissed = true;
		if (browser) {
			const key = `guide-dismissed-${this.data.userId}-${this.data.orgId}`;
			localStorage.setItem(key, 'true');
		}
	}

	async dismissGettingStarted() {
		this.gettingStartedDismissed = true;
		await fetch(`/org/${this.data.orgId}/api/getting-started`, { method: 'POST' });
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
		return new Set(personnelStore.items.map((p) => p.id));
	}

	// ---------------------------------------------------------------------------
	// Derived: todayEntries (availability covering today, scoped)
	// ---------------------------------------------------------------------------
	get todayEntries() {
		return availabilityStore.items.filter(
			(e) => e.startDate <= this.today && e.endDate >= this.today && this.personnelIds.has(e.personnelId)
		);
	}

	// ---------------------------------------------------------------------------
	// Derived: unavailablePersonnelIds
	// ---------------------------------------------------------------------------
	get unavailablePersonnelIds(): Set<string> {
		return new Set(this.todayEntries.map((e) => e.personnelId));
	}

	// ---------------------------------------------------------------------------
	// Derived: totalPersonnel / availableCount
	// ---------------------------------------------------------------------------
	get totalPersonnel(): number {
		return personnelStore.items.length;
	}

	get availableCount(): number {
		return this.totalPersonnel - this.unavailablePersonnelIds.size;
	}

	// ---------------------------------------------------------------------------
	// Derived: statusBreakdown
	// ---------------------------------------------------------------------------
	get statusBreakdown(): Map<string, { name: string; color: string; textColor: string; count: number }> {
		const map = new Map<string, { name: string; color: string; textColor: string; count: number }>();
		for (const entry of this.todayEntries) {
			const st = statusTypesStore.items.find((s) => s.id === entry.statusTypeId);
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

	// ---------------------------------------------------------------------------
	// Derived: dutyAssignments
	// ---------------------------------------------------------------------------
	get dutyAssignments(): { id: string; typeName: string; shortName: string; color: string; assigneeName: string }[] {
		return dailyAssignmentsStore.assignments
			.filter((a) => a.date === this.today)
			.map((a) => {
				const type = dailyAssignmentsStore.types.find((t) => t.id === a.assignmentTypeId);
				let assigneeName = '';
				if (type?.assignTo === 'personnel') {
					const person = personnelStore.items.find((p) => p.id === a.assigneeId);
					if (person) assigneeName = `${person.rank} ${person.lastName}`;
				} else {
					assigneeName = a.assigneeId;
				}
				return {
					id: a.id,
					typeName: type?.name ?? 'Unknown',
					shortName: type?.shortName ?? '',
					color: type?.color ?? '#9e9e9e',
					assigneeName
				};
			});
	}

	// ---------------------------------------------------------------------------
	// Derived: trainingStats / topTrainingIssues (server-provided)
	// ---------------------------------------------------------------------------
	get trainingStats(): TrainingStats | null {
		return this.data.trainingSummary?.stats ?? null;
	}

	get topTrainingIssues(): TrainingIssue[] {
		return this.data.trainingSummary?.issues ?? [];
	}

	// ---------------------------------------------------------------------------
	// Derived: upcomingChanges (entries starting or ending within 7 days)
	// ---------------------------------------------------------------------------
	get upcomingChanges(): {
		date: string;
		personName: string;
		statusName: string;
		statusColor: string;
		direction: 'departing' | 'returning';
	}[] {
		const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const twoWeeksStr = `${sevenDaysOut.getFullYear()}-${String(sevenDaysOut.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysOut.getDate()).padStart(2, '0')}`;

		const changes: {
			date: string;
			personName: string;
			statusName: string;
			statusColor: string;
			direction: 'departing' | 'returning';
		}[] = [];

		for (const entry of availabilityStore.items) {
			const person = personnelStore.items.find((p) => p.id === entry.personnelId);
			const st = statusTypesStore.items.find((s) => s.id === entry.statusTypeId);
			if (!person || !st) continue;

			// Starting soon (departing)
			if (entry.startDate > this.today && entry.startDate <= twoWeeksStr) {
				changes.push({
					date: entry.startDate,
					personName: `${person.rank} ${person.lastName}`,
					statusName: st.name,
					statusColor: st.color,
					direction: 'departing'
				});
			}

			// Ending soon (returning)
			if (entry.endDate >= this.today && entry.endDate <= twoWeeksStr) {
				changes.push({
					date: entry.endDate,
					personName: `${person.rank} ${person.lastName}`,
					statusName: st.name,
					statusColor: st.color,
					direction: 'returning'
				});
			}
		}

		return changes.sort((a, b) => a.date.localeCompare(b.date));
	}

	// ---------------------------------------------------------------------------
	// Derived: upcomingByDate (grouped)
	// ---------------------------------------------------------------------------
	get upcomingByDate(): Map<string, typeof this.upcomingChanges> {
		const map = new Map<string, typeof this.upcomingChanges>();
		for (const change of this.upcomingChanges) {
			const existing = map.get(change.date);
			if (existing) existing.push(change);
			else map.set(change.date, [change]);
		}
		return map;
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
		const onboardings = (this.data.activeOnboardings ?? []).filter((o) => this.personnelIds.has(o.personnelId));
		const completionSet = new Set(this.data.onboardingTrainingCompletions ?? []);

		return onboardings.map((o) => {
			const person = personnelStore.items.find((p) => p.id === o.personnelId);
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
		const pinnedSet = new Set(pinnedGroupsStore.list);
		const sorted = [...groupsStore.items].sort((a, b) => {
			const aPinned = pinnedSet.has(a.name);
			const bPinned = pinnedSet.has(b.name);
			if (aPinned && !bPinned) return -1;
			if (!aPinned && bPinned) return 1;
			return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
		});

		return sorted.map((group) => {
			const groupPersonnel = personnelStore.items.filter((p) => p.groupId === group.id);
			const total = groupPersonnel.length;
			const unavailable = groupPersonnel.filter((p) => this.unavailablePersonnelIds.has(p.id)).length;
			const available = total - unavailable;
			const pct = total > 0 ? Math.round((available / total) * 100) : 100;

			const statusCounts = new Map<string, number>();
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

	// ---------------------------------------------------------------------------
	// Derived: dutyStrengthPct
	// ---------------------------------------------------------------------------
	get dutyStrengthPct(): number {
		return this.totalPersonnel > 0 ? Math.round((this.availableCount / this.totalPersonnel) * 100) : 100;
	}

	// ---------------------------------------------------------------------------
	// Derived: ratingStats / ratingTotal
	// ---------------------------------------------------------------------------
	get ratingStats(): { overdue: number; 'due-30': number; 'due-60': number; current: number } {
		const counts = { overdue: 0, 'due-30': 0, 'due-60': 0, current: 0 };
		for (const entry of this.data.ratingSchemeEntries ?? []) {
			const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
			if (status !== 'completed') {
				counts[status]++;
			}
		}
		return counts;
	}

	get ratingTotal(): number {
		return (
			this.ratingStats.overdue + this.ratingStats['due-30'] + this.ratingStats['due-60'] + this.ratingStats.current
		);
	}

	// ---------------------------------------------------------------------------
	// Derived: allowedCards (permission-gated)
	// ---------------------------------------------------------------------------
	get allowedCards(): CardId[] {
		return this.data.permissions ? (getVisibleDashboardCards(this.data.permissions) as CardId[]) : [];
	}

	// ---------------------------------------------------------------------------
	// Derived: cardRows (layout algorithm)
	// ---------------------------------------------------------------------------
	get cardRows(): CardId[][] {
		const visible = dashboardPrefsStore.visibleCards.filter((id) => this.allowedCards.includes(id));
		const rows: CardId[][] = [];
		let pending: CardId | null = null;

		for (const id of visible) {
			if (HALF_SIZE_CARDS.includes(id)) {
				if (pending) {
					rows.push([pending, id]);
					pending = null;
				} else {
					pending = id;
				}
			} else {
				if (pending) {
					rows.push([pending]);
					pending = null;
				}
				rows.push([id]);
			}
		}
		if (pending) rows.push([pending]);
		return rows;
	}

	// ---------------------------------------------------------------------------
	// Helper: formatShortDate (used in template)
	// ---------------------------------------------------------------------------
	formatShortDate(dateStr: string): string {
		const d = parseDate(dateStr);
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${months[d.getMonth()]} ${d.getDate()}`;
	}
}
