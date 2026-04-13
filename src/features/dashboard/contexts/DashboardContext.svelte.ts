import { browser } from '$app/environment';
import { changelog } from '$lib/data/changelog';
import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { getRatingDueStatus } from '$features/rating-scheme/utils/ratingScheme';
import { deriveShortName, deriveBadgeColor } from '$features/calendar/utils/dutyEventBadges';
import { formatDate, parseDate } from '$lib/utils/dates';
import { SvelteDate, SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { TrainingStats } from '$features/training/utils/trainingStatus';
import type { OrganizationMemberPermissions } from '$lib/types';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import type { HydrationPlan } from '$lib/server/core/orgShell';

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

/** Returns '#ffffff' or '#1a1a1a' based on WCAG relative luminance of a hex color. */
function hexToTextColor(hex: string): string {
	const clean = hex.replace('#', '');
	const r = parseInt(clean.slice(0, 2), 16) / 255;
	const g = parseInt(clean.slice(2, 4), 16) / 255;
	const b = parseInt(clean.slice(4, 6), 16) / 255;
	const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
	const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
	return L > 0.179 ? '#1a1a1a' : '#ffffff';
}

export class DashboardContext {
	// ---------------------------------------------------------------------------
	// Raw page data (injected from route)
	// ---------------------------------------------------------------------------
	readonly data: DashboardPageData;

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
		this.today = formatDate(new SvelteDate());

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
		return (
			personnelStore.loading ||
			statusTypesStore.loading ||
			availabilityStore.loading ||
			dailyAssignmentsStore.loading ||
			groupsStore.loading
		);
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
		return new SvelteSet(personnelStore.items.map((p) => p.id));
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
		return new SvelteSet(this.todayEntries.map((e) => e.personnelId));
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
		const map = new SvelteMap<string, { name: string; color: string; textColor: string; count: number }>();
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
	get dutyAssignments(): {
		id: string;
		typeName: string;
		shortName: string;
		color: string;
		textColor: string;
		assigneeName: string;
	}[] {
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
				const color = type?.color ?? '#9e9e9e';
				return {
					id: a.id,
					typeName: type?.name ?? 'Unknown',
					shortName: type?.shortName ?? '',
					color,
					textColor: hexToTextColor(color),
					assigneeName
				};
			});
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
							const person = personnelStore.items.find((p) => p.id === slot.assigneeId);
							if (person) {
								assigneeName = `${person.rank} ${person.lastName}`;
								if (person.firstName) assigneeName += `, ${person.firstName[0]}`;
							}
						}
						return { key: `${slot.roleLabel}-${slot.slotIndex}`, roleLabel: slot.roleLabel, assigneeName };
					})
			}));
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
		key: string;
		date: string;
		personName: string;
		statusName: string;
		statusColor: string;
		direction: 'departing' | 'returning';
	}[] {
		const sevenDaysOut = new SvelteDate(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const twoWeeksStr = `${sevenDaysOut.getFullYear()}-${String(sevenDaysOut.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysOut.getDate()).padStart(2, '0')}`;

		const changes: {
			key: string;
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
					key: `${entry.id}-departing-${entry.startDate}`,
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
					key: `${entry.id}-returning-${entry.endDate}`,
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
		const map = new SvelteMap<string, typeof this.upcomingChanges>();
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
		const onboardings = this.data.dashboard.data.activeOnboardings.filter((o) => this.personnelIds.has(o.personnelId));
		const completionSet = new SvelteSet(this.data.onboardingTrainingCompletions ?? []);

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
		const pinnedSet = new SvelteSet(pinnedGroupsStore.list);
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
		for (const entry of this.data.dashboard.data.ratingSchemeEntries) {
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
	}[] {
		return this.todayEntries
			.map((e) => {
				const person = personnelStore.items.find((p) => p.id === e.personnelId);
				const st = statusTypesStore.items.find((s) => s.id === e.statusTypeId);
				if (!person || !st) return null;
				return {
					id: e.id,
					personnelId: e.personnelId,
					personName: `${person.rank} ${person.lastName}, ${person.firstName}`,
					rank: person.rank ?? '',
					statusName: st.name,
					statusColor: st.color,
					startDate: e.startDate,
					endDate: e.endDate,
					statusTypeId: e.statusTypeId
				};
			})
			.filter((x): x is NonNullable<typeof x> => x !== null)
			.sort((a, b) => a.personName.localeCompare(b.personName));
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
		const days: {
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
		}[] = [];
		for (let i = 0; i < count; i++) {
			const d = new SvelteDate();
			d.setDate(d.getDate() + i);
			const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			const assignments = dailyAssignmentsStore.assignments
				.filter((a) => a.date === dateStr)
				.map((a) => {
					const type = dailyAssignmentsStore.types.find((t) => t.id === a.assignmentTypeId);
					let assigneeName = '';
					if (type?.assignTo === 'personnel') {
						const person = personnelStore.items.find((p) => p.id === a.assigneeId);
						if (person) assigneeName = `${person.rank} ${person.lastName}`;
					} else {
						assigneeName = a.assigneeId;
					}
					const color = type?.color ?? '#9e9e9e';
					return {
						id: a.id,
						typeName: type?.name ?? 'Unknown',
						shortName: type?.shortName ?? '',
						color,
						textColor: hexToTextColor(color),
						assigneeName
					};
				});
			days.push({ date: dateStr, isToday: i === 0, assignments });
		}
		return days;
	}

	// ---------------------------------------------------------------------------
	// Derived: trainingCurrencyPct — % of personnel with all training current
	// ---------------------------------------------------------------------------
	get trainingCurrencyPct(): number {
		const stats = this.trainingStats;
		if (!stats || this.totalPersonnel === 0) return 100;

		// Count distinct personnel with at least one expired or expiring record.
		// topTrainingIssues is one row per (person, training type) — deduplicate by name
		// so we don't divide by record count instead of person count.
		const withIssues = new SvelteSet<string>();
		for (const issue of this.topTrainingIssues) {
			if (issue.personName) withIssues.add(issue.personName);
		}

		// If the issues list is empty but stats show issues exist, fall back to
		// treating everyone as non-current (safe undercount rather than 100% false positive).
		const totalRecordIssues = stats.expired + stats.warningOrange + stats.warningYellow;
		if (totalRecordIssues === 0) return 100;
		if (withIssues.size === 0) return 0;

		return Math.max(0, Math.round(((this.totalPersonnel - withIssues.size) / this.totalPersonnel) * 100));
	}

	// ---------------------------------------------------------------------------
	// Derived: onLeaveCount — personnel specifically on leave today
	// ---------------------------------------------------------------------------
	get onLeaveCount(): number {
		return this.todayEntries.filter((e) => {
			const st = statusTypesStore.items.find((s) => s.id === e.statusTypeId);
			return st?.name?.toLowerCase().includes('leave') ?? false;
		}).length;
	}

	// ---------------------------------------------------------------------------
	// Derived: quickStatValue — resolve a metric to its numeric value
	// ---------------------------------------------------------------------------
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

	// ---------------------------------------------------------------------------
	// Derived: quickStatUnit — optional unit suffix for a metric
	// ---------------------------------------------------------------------------
	quickStatUnit(metricId: string): string {
		if (metricId === 'training-currency') return '%';
		return '';
	}

	// ---------------------------------------------------------------------------
	// Derived: trainingGroupDelinquencies — groups sorted by issue count desc
	// ---------------------------------------------------------------------------
	get trainingGroupDelinquencies(): { groupName: string; count: number; pct: number }[] {
		const stats = this.trainingStats;
		if (!stats) return [];

		return this.groupBreakdown
			.map((g) => {
				const groupPersonnel = personnelStore.items.filter((p) => p.groupId === g.id);
				const total = groupPersonnel.length;
				// Approximate: proportion of overall issues attributed to group by size
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
		const entries = this.data.dashboard.data.ratingSchemeEntries;
		const today = new SvelteDate();
		const results: ReturnType<typeof this.ratingsDueSoon> = [];

		for (const entry of entries) {
			const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
			if (status === 'completed' || status === 'current') continue;
			const end = new SvelteDate(entry.ratingPeriodEnd + 'T00:00:00');
			const diffMs = end.getTime() - today.getTime();
			const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
			if (daysUntil > lookaheadDays) continue;

			const person = personnelStore.items.find((p) => p.id === entry.ratedPersonId);
			const personName = person ? `${person.rank} ${person.lastName}` : (entry.ratedPersonId ?? 'Unknown');
			results.push({
				id: entry.id,
				personName,
				ratingPeriodEnd: entry.ratingPeriodEnd,
				status: status as 'overdue' | 'due-30' | 'due-60',
				daysUntil,
				evalType: entry.evalType ?? ''
			});
		}

		return results.sort((a, b) => a.daysUntil - b.daysUntil);
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
