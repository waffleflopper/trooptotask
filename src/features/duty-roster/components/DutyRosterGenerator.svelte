<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AvailabilityEntry, SpecialDay, StatusType } from '$lib/types';
	import type { AssignmentType, DailyAssignment } from '$lib/types';
	import type { RosterHistoryItem, RosterHistoryEntry, DA6Data } from '../stores/dutyRosterHistory.svelte';
	import { formatDate } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	interface Props {
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		personnelByGroup: { group: string; personnel: Personnel[] }[];
		groups: string[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		specialDays: SpecialDay[];
		rosterHistory: RosterHistoryItem[];
		onApplyRoster: (assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]) => Promise<boolean>;
		onSaveRoster: (payload: Omit<RosterHistoryItem, 'id' | 'createdAt'>) => Promise<RosterHistoryItem | null>;
		onDeleteRoster: (id: string) => Promise<void>;
		onUpdateExemptions: (assignmentTypeId: string, personnelIds: string[]) => Promise<void>;
	}

	let {
		assignmentTypes,
		assignments,
		personnelByGroup,
		groups,
		availabilityEntries,
		statusTypes,
		specialDays,
		rosterHistory,
		onApplyRoster,
		onSaveRoster,
		onDeleteRoster,
		onUpdateExemptions
	}: Props = $props();

	// Default dates: first and last day of current month
	function getMonthStart(): string {
		const now = new Date();
		return formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
	}

	function getMonthEnd(): string {
		const now = new Date();
		return formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
	}

	// View state: 'config' | 'preview' | 'history'
	let view = $state<'config' | 'preview' | 'history'>('config');

	// Configuration state
	let selectedAssignmentTypeId = $state('');
	let dutyDuration = $state<'daily' | 'weekly' | 'monthly'>('daily');
	let startDate = $state(getMonthStart());
	let endDate = $state(getMonthEnd());
	let selectedGroups = $state<string[]>([]);
	let selectedRanks = $state<string[]>([]);
	let selectedMOS = $state<string[]>([]);
	let selectedRoles = $state<string[]>([]);
	let excludeStatuses = $state<string[]>([]);
	let excludeWeekends = $state(false);
	let excludeHolidays = $state(false);
	let excludeOrgClosures = $state(false);

	// Generated roster state
	let generatedRoster = $state<{ date: string; assignee: Personnel | null; reason?: string }[]>([]);
	let generatedDA6 = $state<DA6Data | null>(null);
	let isGenerating = $state(false);
	let isApplying = $state(false);
	let previewTab = $state<'roster' | 'da6'>('roster');
	let applyFeedback = $state<{ tone: 'success' | 'error'; message: string } | null>(null);

	// Extract all unique values in single pass for efficiency (O(n) instead of O(4n))
	const personnelData = $derived.by(() => {
		const ranks = new Set<string>();
		const mos = new Set<string>();
		const roles = new Set<string>();
		const all: Personnel[] = [];

		for (const group of personnelByGroup) {
			for (const person of group.personnel) {
				all.push(person);
				ranks.add(person.rank);
				if (person.mos) mos.add(person.mos);
				if (person.clinicRole) roles.add(person.clinicRole);
			}
		}

		return {
			allPersonnel: all,
			allRanks: Array.from(ranks).sort(),
			allMOS: Array.from(mos).sort(),
			allRoles: Array.from(roles).sort()
		};
	});

	// Convenience accessors
	const allPersonnel = $derived(personnelData.allPersonnel);
	const allRanks = $derived(personnelData.allRanks);
	const allMOS = $derived(personnelData.allMOS);
	const allRoles = $derived(personnelData.allRoles);

	// Get currently selected assignment type object
	const selectedAssignmentType = $derived.by(
		() => assignmentTypes.find((t) => t.id === selectedAssignmentTypeId) ?? null
	);

	// Exempt personnel IDs for the currently selected assignment type
	const currentExemptIds = $derived.by(() => selectedAssignmentType?.exemptPersonnelIds ?? []);

	// Filter personnel based on selection criteria (excluding exempt)
	const eligiblePersonnel = $derived.by(() => {
		let personnel = allPersonnel;

		// Filter by groups if any selected
		if (selectedGroups.length > 0) {
			personnel = personnel.filter((p) => selectedGroups.includes(p.groupName));
		}

		// Filter by ranks if any selected
		if (selectedRanks.length > 0) {
			personnel = personnel.filter((p) => selectedRanks.includes(p.rank));
		}

		// Filter by MOS if any selected
		if (selectedMOS.length > 0) {
			personnel = personnel.filter((p) => p.mos && selectedMOS.includes(p.mos));
		}

		// Filter by clinic role if any selected
		if (selectedRoles.length > 0) {
			personnel = personnel.filter((p) => p.clinicRole && selectedRoles.includes(p.clinicRole));
		}

		// Exclude exempt personnel
		const exempt = currentExemptIds;
		if (exempt.length > 0) {
			personnel = personnel.filter((p) => !exempt.includes(p.id));
		}

		return personnel;
	});

	// Calculate duty counts from existing assignments
	function getDutyCounts(assignmentTypeId: string): Map<string, number> {
		const counts = new Map<string, number>();

		// Initialize all eligible personnel with 0
		eligiblePersonnel.forEach((p) => counts.set(p.id, 0));

		// Count existing assignments of this type
		assignments
			.filter((a) => a.assignmentTypeId === assignmentTypeId)
			.forEach((a) => {
				const current = counts.get(a.assigneeId) ?? 0;
				counts.set(a.assigneeId, current + 1);
			});

		return counts;
	}

	// Get last duty date per person for tiebreaker.
	// Only considers assignments BEFORE the generation period start date so that
	// future assignments (e.g. March already generated) don't corrupt a past period
	// (e.g. generating February retroactively).
	function getLastDutyDates(assignmentTypeId: string, beforeDate: string): Map<string, string | null> {
		const lastDates = new Map<string, string | null>();
		eligiblePersonnel.forEach((p) => lastDates.set(p.id, null));

		assignments
			.filter((a) => a.assignmentTypeId === assignmentTypeId && a.date < beforeDate)
			.forEach((a) => {
				const current = lastDates.get(a.assigneeId) ?? null;
				if (current === null || a.date > current) {
					lastDates.set(a.assigneeId, a.date);
				}
			});

		return lastDates;
	}

	// Check if person is available on a given date
	function isPersonAvailable(person: Personnel, date: string): boolean {
		const entries = availabilityEntries.filter(
			(e) => e.personnelId === person.id && date >= e.startDate && date <= e.endDate
		);

		if (entries.length === 0) return true;

		for (const entry of entries) {
			if (excludeStatuses.includes(entry.statusTypeId)) {
				return false;
			}
		}

		return true;
	}

	// Build set of excluded special day dates based on toggles
	const excludedSpecialDays = $derived.by(() => {
		const dates = new Set<string>();
		for (const day of specialDays) {
			if (excludeHolidays && day.type === 'federal-holiday') dates.add(day.date);
			if (excludeOrgClosures && day.type === 'org-closure') dates.add(day.date);
		}
		return dates;
	});

	// Get dates based on duration, filtering out excluded days
	function getDutyDates(start: string, end: string, duration: 'daily' | 'weekly' | 'monthly'): string[] {
		const dates: string[] = [];
		const startD = new Date(start + 'T00:00:00');
		const endD = new Date(end + 'T00:00:00');

		let current = new Date(startD);

		while (current <= endD) {
			const dayOfWeek = current.getDay();
			const dateStr = formatDate(current);
			const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

			if (!(excludeWeekends && isWeekend) && !excludedSpecialDays.has(dateStr)) {
				dates.push(dateStr);
			}

			switch (duration) {
				case 'daily':
					current.setDate(current.getDate() + 1);
					break;
				case 'weekly':
					current.setDate(current.getDate() + 7);
					break;
				case 'monthly':
					current.setMonth(current.getMonth() + 1);
					break;
			}
		}

		return dates;
	}

	// DA6-style roster generation algorithm with last-duty tiebreaker
	function generateRoster() {
		if (!selectedAssignmentTypeId || !startDate || !endDate) return;

		isGenerating = true;

		const dutyDates = getDutyDates(startDate, endDate, dutyDuration);
		const dutyCounts = getDutyCounts(selectedAssignmentTypeId);
		const roster: { date: string; assignee: Personnel | null; reason?: string }[] = [];

		// Working copies for this generation run.
		// Pass startDate so only assignments BEFORE this period influence initial ordering.
		const workingCounts = new Map(dutyCounts);
		const initialLastDutyDates = getLastDutyDates(selectedAssignmentTypeId, startDate);
		const workingLastDutyDates = new Map(initialLastDutyDates);

		// DA6 capture: build personnel list sorted alphabetically for stable row order
		const da6Personnel = [...eligiblePersonnel]
			.sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`))
			.map((p) => ({ id: p.id, name: `${p.lastName}, ${p.firstName}`, rank: p.rank, group: p.groupName }));
		const da6Dates: DA6Data['dates'] = [];

		for (const date of dutyDates) {
			// Get available personnel for this date
			const available = eligiblePersonnel.filter((p) => isPersonAvailable(p, date));

			if (available.length === 0) {
				roster.push({ date, assignee: null, reason: 'No eligible personnel available' });
				// DA6: everyone unavailable
				da6Dates.push({ date, positions: da6Personnel.map(() => null) });
				continue;
			}

			// DA Form 6 rule: whoever went longest since last duty goes next.
			// Never done duty (null) → oldest last date → alphabetical tiebreaker.
			available.sort((a, b) => {
				const aLast = workingLastDutyDates.get(a.id) ?? null;
				const bLast = workingLastDutyDates.get(b.id) ?? null;
				if (aLast !== bLast) {
					if (aLast === null) return -1; // never assigned → goes first
					if (bLast === null) return 1;
					return aLast.localeCompare(bLast); // older date first
				}
				return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
			});

			const assigned = available[0];

			roster.push({ date, assignee: assigned });

			// DA6: capture each person's queue position for this date
			const positions = da6Personnel.map((dp) => {
				const availIdx = available.findIndex((a) => a.id === dp.id);
				return availIdx >= 0 ? availIdx + 1 : null; // null = unavailable, 1 = assigned
			});
			da6Dates.push({ date, positions });

			workingCounts.set(assigned.id, (workingCounts.get(assigned.id) ?? 0) + 1);
			workingLastDutyDates.set(assigned.id, date);
		}

		generatedRoster = roster;
		generatedDA6 = { personnel: da6Personnel, dates: da6Dates };
		previewTab = 'roster';
		view = 'preview';
		isGenerating = false;
	}

	// Apply roster to calendar and save to history
	async function applyRoster() {
		if (generatedRoster.length === 0) return;

		isApplying = true;
		applyFeedback = null;

		const assignmentsToCreate = generatedRoster
			.filter((r) => r.assignee !== null)
			.map((r) => ({
				date: r.date,
				assignmentTypeId: selectedAssignmentTypeId,
				assigneeId: r.assignee!.id
			}));

		// Save to history first
		const assignmentType = assignmentTypes.find((t) => t.id === selectedAssignmentTypeId);
		const typeName = assignmentType?.name ?? 'Duty';
		const historyRoster: RosterHistoryEntry[] = generatedRoster.map((r) => ({
			date: r.date,
			assigneeId: r.assignee?.id ?? null,
			assigneeName: r.assignee ? `${r.assignee.lastName}, ${r.assignee.firstName}` : null,
			assigneeRank: r.assignee?.rank ?? null,
			assigneeGroup: r.assignee?.groupName ?? null,
			reason: r.reason
		}));

		const saved = await onSaveRoster({
			assignmentTypeId: selectedAssignmentTypeId,
			name: `${typeName} – ${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`,
			startDate,
			endDate,
			roster: historyRoster,
			da6: generatedDA6 ?? undefined,
			config: {
				dutyDuration,
				assignmentTypeName: typeName,
				selectedGroups,
				selectedRanks,
				selectedMOS,
				selectedRoles,
				excludeStatuses,
				excludeWeekends,
				excludeHolidays,
				excludeOrgClosures
			}
		});

		const applied = await onApplyRoster(assignmentsToCreate);
		isApplying = false;

		if (!applied) {
			applyFeedback = {
				tone: 'error',
				message: 'The roster could not be applied to the calendar. Nothing was changed.'
			};
			return;
		}

		applyFeedback = {
			tone: 'success',
			message: saved
				? 'Roster applied to the calendar and saved to history.'
				: 'Roster applied to the calendar. History could not be saved.'
		};
		view = 'history';
	}

	// Export to Excel (HTML table format) — accepts optional overrides for re-export from history
	function exportToExcel(opts?: {
		roster: RosterHistoryEntry[];
		typeName: string;
		startDate: string;
		endDate: string;
		da6?: DA6Data;
	}) {
		const isHistory = !!opts;
		const typeName = opts?.typeName ?? assignmentTypes.find((t) => t.id === selectedAssignmentTypeId)?.name ?? 'Duty';
		const sd = opts?.startDate ?? startDate;
		const ed = opts?.endDate ?? endDate;
		const da6 = opts?.da6 ?? generatedDA6;

		let html = `
			<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
			<head>
				<meta charset="utf-8">
				<style>
					table { border-collapse: collapse; margin-bottom: 24px; }
					th, td { border: 1px solid #000; padding: 8px; text-align: left; }
					th { background-color: #4a5568; color: white; font-weight: bold; }
					.unavailable { background-color: #fed7d7; color: #c53030; }
					.da6-assigned { background-color: #c6f6d5; font-weight: bold; text-align: center; }
					.da6-position { text-align: center; color: #718096; }
					.da6-unavail { text-align: center; color: #a0aec0; background-color: #f7fafc; }
				</style>
			</head>
			<body>
				<h2>${typeName} Roster</h2>
				<p>Generated: ${new Date().toLocaleDateString()}</p>
				<p>Period: ${formatDisplayDate(sd)} - ${formatDisplayDate(ed)}</p>
				<table>
					<tr>
						<th>Date</th>
						<th>Day</th>
						<th>Assigned</th>
						<th>Rank</th>
						<th>Group</th>
						<th>Notes</th>
					</tr>
		`;

		if (isHistory && opts) {
			for (const entry of opts.roster) {
				const date = new Date(entry.date + 'T00:00:00');
				const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
				const displayDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

				if (entry.assigneeId) {
					html += `
						<tr>
							<td>${displayDate}</td>
							<td>${dayName}</td>
							<td>${entry.assigneeName ?? ''}</td>
							<td>${entry.assigneeRank ?? ''}</td>
							<td>${entry.assigneeGroup ?? ''}</td>
							<td></td>
						</tr>
					`;
				} else {
					html += `
						<tr class="unavailable">
							<td>${displayDate}</td>
							<td>${dayName}</td>
							<td colspan="3">UNFILLED</td>
							<td>${entry.reason ?? ''}</td>
						</tr>
					`;
				}
			}
		} else {
			for (const entry of generatedRoster) {
				const date = new Date(entry.date + 'T00:00:00');
				const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
				const displayDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

				if (entry.assignee) {
					html += `
						<tr>
							<td>${displayDate}</td>
							<td>${dayName}</td>
							<td>${entry.assignee.lastName}, ${entry.assignee.firstName}</td>
							<td>${entry.assignee.rank}</td>
							<td>${entry.assignee.groupName}</td>
							<td></td>
						</tr>
					`;
				} else {
					html += `
						<tr class="unavailable">
							<td>${displayDate}</td>
							<td>${dayName}</td>
							<td colspan="3">UNFILLED</td>
							<td>${entry.reason ?? ''}</td>
						</tr>
					`;
				}
			}
		}

		html += '</table>';

		// DA6 Reference Grid — shows each person's queue position per date
		if (da6 && da6.dates.length > 0) {
			html += `
				<h2>DA Form 6 Reference</h2>
				<p>Queue position per date. <b>X</b> = assigned duty, number = queue position, <b>—</b> = unavailable.</p>
				<table>
					<tr>
						<th>Rank</th>
						<th>Name</th>
			`;

			for (const d of da6.dates) {
				const date = new Date(d.date + 'T00:00:00');
				html += `<th>${date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</th>`;
			}

			html += '</tr>';

			for (let i = 0; i < da6.personnel.length; i++) {
				const person = da6.personnel[i];
				html += `<tr><td>${person.rank}</td><td>${person.name}</td>`;

				for (const d of da6.dates) {
					const pos = d.positions[i];
					if (pos === null) {
						html += '<td class="da6-unavail">&mdash;</td>';
					} else if (pos === 1) {
						html += '<td class="da6-assigned">X</td>';
					} else {
						html += `<td class="da6-position">${pos}</td>`;
					}
				}

				html += '</tr>';
			}

			html += '</table>';
		}

		html += '</body></html>';

		const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${typeName.replace(/\s+/g, '_')}_Roster_${sd}_to_${ed}.xls`;
		a.click();
		URL.revokeObjectURL(url);
	}

	let reApplyItem = $state<RosterHistoryItem | null>(null);

	// Re-apply a history roster to the calendar
	function reApplyHistoryRoster(item: RosterHistoryItem) {
		reApplyItem = item;
	}

	async function doReApplyRoster() {
		const item = reApplyItem;
		if (!item) return;
		reApplyItem = null;

		const assignmentsToCreate = item.roster
			.filter((r) => r.assigneeId !== null)
			.map((r) => ({
				date: r.date,
				assignmentTypeId: item.assignmentTypeId,
				assigneeId: r.assigneeId!
			}));

		await onApplyRoster(assignmentsToCreate);
	}

	function formatDisplayDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatHistoryDate(isoString: string): string {
		return new Date(isoString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function toggleGroup(group: string) {
		if (selectedGroups.includes(group)) {
			selectedGroups = selectedGroups.filter((g) => g !== group);
		} else {
			selectedGroups = [...selectedGroups, group];
		}
	}

	function toggleRank(rank: string) {
		if (selectedRanks.includes(rank)) {
			selectedRanks = selectedRanks.filter((r) => r !== rank);
		} else {
			selectedRanks = [...selectedRanks, rank];
		}
	}

	function toggleMOS(mos: string) {
		if (selectedMOS.includes(mos)) {
			selectedMOS = selectedMOS.filter((m) => m !== mos);
		} else {
			selectedMOS = [...selectedMOS, mos];
		}
	}

	function toggleRole(role: string) {
		if (selectedRoles.includes(role)) {
			selectedRoles = selectedRoles.filter((r) => r !== role);
		} else {
			selectedRoles = [...selectedRoles, role];
		}
	}

	function toggleExcludeStatus(statusId: string) {
		if (excludeStatuses.includes(statusId)) {
			excludeStatuses = excludeStatuses.filter((s) => s !== statusId);
		} else {
			excludeStatuses = [...excludeStatuses, statusId];
		}
	}

	function toggleExempt(personnelId: string) {
		const current = currentExemptIds;
		const next = current.includes(personnelId) ? current.filter((id) => id !== personnelId) : [...current, personnelId];
		onUpdateExemptions(selectedAssignmentTypeId, next);
	}

	// Set default excluded statuses (common "unavailable" statuses)
	$effect(() => {
		if (excludeStatuses.length === 0 && statusTypes.length > 0) {
			const unavailableNames = ['leave', 'tdy', 'school', 'sick', 'appointment'];
			excludeStatuses = statusTypes
				.filter((s) => unavailableNames.some((n) => s.name.toLowerCase().includes(n)))
				.map((s) => s.id);
		}
	});

	// Personnel-only assignment types
	const personnelAssignmentTypes = $derived(assignmentTypes.filter((t) => t.assignTo === 'personnel'));

	const panelTitle = $derived(
		view === 'history' ? 'Roster History' : view === 'preview' ? 'Generated Roster Preview' : 'Generate Duty Roster'
	);
</script>

<section class="generator-shell">
	<div class="generator-hero card card-flat">
		<div class="hero-copy">
			<p class="eyebrow">Duty planning</p>
			<h2>{panelTitle}</h2>
			<p class="hero-description">
				Build and review DA6-style rosters without working inside a popup. Generate, preview, re-apply, and audit
				rosters from one page.
			</p>
		</div>

		<div class="view-nav" aria-label="Duty roster views">
			<button class="view-tab" class:active={view === 'config'} onclick={() => (view = 'config')}>Configuration</button>
			<button
				class="view-tab"
				class:active={view === 'preview'}
				onclick={() => (view = 'preview')}
				disabled={generatedRoster.length === 0}
			>
				Preview
			</button>
			<button class="view-tab" class:active={view === 'history'} onclick={() => (view = 'history')}>
				History
				{#if rosterHistory.length > 0}
					<span class="history-badge">{rosterHistory.length}</span>
				{/if}
			</button>
		</div>
	</div>

	{#if applyFeedback}
		<div class="feedback-banner" class:error={applyFeedback.tone === 'error'}>
			{applyFeedback.message}
		</div>
	{/if}

	<div class="generator-body">
		{#if view === 'history'}
			<section class="panel-card section-card card card-flat history-panel">
				<div class="panel-header">
					<div>
						<h3>Roster History</h3>
						<p class="hint">Past rosters, most recent first.</p>
					</div>
					<button class="btn btn-secondary btn-sm" onclick={() => (view = 'config')}>Back to Config</button>
				</div>

				{#if rosterHistory.length === 0}
					<div class="empty-state">
						<p>No roster history yet. Generate and apply a roster to save it here.</p>
					</div>
				{:else}
					<div class="history-list">
						{#each rosterHistory as item (item.id)}
							{@const filled = item.roster.filter((r) => r.assigneeId).length}
							{@const total = item.roster.length}
							<div class="history-card">
								<div class="history-card-info">
									<div class="history-card-name">{item.name}</div>
									<div class="history-card-meta">
										{formatDisplayDate(item.startDate)} – {formatDisplayDate(item.endDate)}
										&nbsp;·&nbsp;
										{filled}/{total} filled &nbsp;·&nbsp;
										<span class="history-card-date">{formatHistoryDate(item.createdAt)}</span>
									</div>
								</div>
								<div class="history-card-actions">
									<button
										class="btn btn-secondary btn-xs"
										onclick={() => {
											const typeName = assignmentTypes.find((t) => t.id === item.assignmentTypeId)?.name ?? 'Duty';
											exportToExcel({
												roster: item.roster,
												typeName,
												startDate: item.startDate,
												endDate: item.endDate,
												da6: item.da6
											});
										}}
										title="Export to Excel"
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
											<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
											<polyline points="14 2 14 8 20 8" />
										</svg>
										Export
									</button>
									<button
										class="btn btn-secondary btn-xs"
										onclick={() => reApplyHistoryRoster(item)}
										title="Re-apply to calendar"
									>
										Re-apply
									</button>
									<button
										class="btn btn-danger btn-xs"
										onclick={() => onDeleteRoster(item.id)}
										title="Delete this roster"
									>
										Delete
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{:else if view === 'preview'}
			<section class="panel-card section-card card card-flat preview-panel">
				<div class="panel-header">
					<div>
						<h3>Generated Roster Preview</h3>
						<p class="hint">Review coverage, export the roster, then push it to the calendar when it looks right.</p>
					</div>
					<div class="panel-actions">
						<button class="btn btn-secondary" onclick={() => (view = 'config')}>Back to Config</button>
						<button class="btn btn-secondary" onclick={() => exportToExcel()}>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								width="16"
								height="16"
								aria-hidden="true"
							>
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
								<line x1="16" y1="13" x2="8" y2="13" />
								<line x1="16" y1="17" x2="8" y2="17" />
							</svg>
							Export to Excel
						</button>
						<button
							class="btn btn-primary"
							onclick={applyRoster}
							disabled={isApplying || generatedRoster.filter((r) => r.assignee).length === 0}
						>
							{isApplying ? 'Applying...' : 'Apply to Calendar'}
						</button>
					</div>
				</div>

				<div class="roster-stats">
					<div class="stat">
						<span class="stat-value">{generatedRoster.length}</span>
						<span class="stat-label">Total Duties</span>
					</div>
					<div class="stat">
						<span class="stat-value">{generatedRoster.filter((r) => r.assignee).length}</span>
						<span class="stat-label">Filled</span>
					</div>
					<div class="stat unfilled">
						<span class="stat-value">{generatedRoster.filter((r) => !r.assignee).length}</span>
						<span class="stat-label">Unfilled</span>
					</div>
				</div>

				<div class="preview-tabs">
					<button class="preview-tab" class:active={previewTab === 'roster'} onclick={() => (previewTab = 'roster')}>
						Roster
					</button>
					<button class="preview-tab" class:active={previewTab === 'da6'} onclick={() => (previewTab = 'da6')}>
						DA6 Order
					</button>
				</div>

				{#if previewTab === 'da6' && generatedDA6}
					<p class="hint">
						<strong>X</strong> = assigned duty &nbsp; # = queue position &nbsp; <strong>&mdash;</strong> = unavailable
					</p>
					<p class="hint hint-detail">
						Queue positions reflect each person's priority among <em>available</em> personnel per day. Numbers shift
						when others become unavailable or exempt, which is expected under the DA6 rotation logic in
						<a
							href="https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1004278"
							target="_blank"
							rel="noopener noreferrer">AR 220-45</a
						>.
					</p>
					<div class="roster-table-container">
						<div class="table-responsive">
							<table class="roster-table da6-table">
								<thead>
									<tr>
										<th class="da6-sticky-col">Name</th>
										{#each generatedDA6.dates as d}
											{@const date = new Date(d.date + 'T00:00:00')}
											<th class="da6-date-col"
												>{date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</th
											>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each generatedDA6.personnel as person, i}
										<tr>
											<td class="da6-sticky-col da6-name-cell">
												<span class="assignee-rank">{person.rank}</span>
												{person.name}
											</td>
											{#each generatedDA6.dates as d}
												{@const pos = d.positions[i]}
												{#if pos === null}
													<td class="da6-cell da6-unavail">&mdash;</td>
												{:else if pos === 1}
													<td class="da6-cell da6-assigned">X</td>
												{:else}
													<td class="da6-cell da6-queue">{pos}</td>
												{/if}
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{:else}
					<div class="roster-table-container">
						<div class="table-responsive">
							<table class="roster-table">
								<thead>
									<tr>
										<th>Date</th>
										<th>Day</th>
										<th>Assigned</th>
										<th>Group</th>
									</tr>
								</thead>
								<tbody>
									{#each generatedRoster as entry}
										{@const date = new Date(entry.date + 'T00:00:00')}
										<tr class:unfilled={!entry.assignee}>
											<td>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
											<td>{date.toLocaleDateString('en-US', { weekday: 'short' })}</td>
											{#if entry.assignee}
												<td>
													<span class="assignee-rank">{entry.assignee.rank}</span>
													{entry.assignee.lastName}, {entry.assignee.firstName}
												</td>
												<td>{entry.assignee.groupName}</td>
											{:else}
												<td class="unfilled-cell" colspan="2">{entry.reason ?? 'Unfilled'}</td>
											{/if}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</section>
		{:else}
			<div class="config-grid">
				<section class="config-section panel-card section-card card card-flat config-main">
					<div class="panel-header">
						<div>
							<h3>Duty Configuration</h3>
							<p class="hint">Choose what you are filling and the date range the roster should cover.</p>
						</div>
					</div>

					<div class="form-group">
						<label class="label" for="assignmentType">Assignment Type</label>
						<select id="assignmentType" class="select" bind:value={selectedAssignmentTypeId}>
							<option value="">Select duty type...</option>
							{#each personnelAssignmentTypes as type}
								<option value={type.id}>{type.name} ({type.shortName})</option>
							{/each}
						</select>
					</div>

					<div class="form-row">
						<div class="form-group">
							<label class="label" for="duration">Duty Duration</label>
							<select id="duration" class="select" bind:value={dutyDuration}>
								<option value="daily">Daily</option>
								<option value="weekly">Weekly</option>
								<option value="monthly">Monthly</option>
							</select>
						</div>
					</div>

					<div class="form-row">
						<div class="form-group">
							<label class="label" for="startDate">Start Date</label>
							<input id="startDate" type="date" class="input" bind:value={startDate} />
						</div>
						<div class="form-group">
							<label class="label" for="endDate">End Date</label>
							<input id="endDate" type="date" class="input" bind:value={endDate} />
						</div>
					</div>
				</section>

				<section class="config-section panel-card section-card card card-flat">
					<div class="panel-header">
						<div>
							<h3>Schedule Options</h3>
							<p class="hint">Skip dates you know should not be filled by the auto-rotation.</p>
						</div>
					</div>

					<label class="toggle-row">
						<input type="checkbox" bind:checked={excludeWeekends} />
						<span>Exclude weekends (Sat & Sun)</span>
					</label>

					<label class="toggle-row">
						<input type="checkbox" bind:checked={excludeHolidays} />
						<span>Exclude federal holidays</span>
					</label>

					<label class="toggle-row">
						<input type="checkbox" bind:checked={excludeOrgClosures} />
						<span>Exclude org closures</span>
					</label>
				</section>

				<section class="config-section panel-card section-card card card-flat">
					<div class="panel-header">
						<div>
							<h3>Unavailable Statuses</h3>
							<p class="hint">Anyone carrying one of these statuses during a duty date will be skipped.</p>
						</div>
					</div>

					<div class="chip-list">
						{#each statusTypes as status}
							<button
								class="chip status-chip"
								class:selected={excludeStatuses.includes(status.id)}
								style="--chip-color: {status.color}; --chip-text: {status.textColor}"
								onclick={() => toggleExcludeStatus(status.id)}
							>
								{status.name}
							</button>
						{/each}
					</div>
				</section>

				<section class="config-section panel-card section-card card card-flat config-main">
					<div class="panel-header">
						<div>
							<h3>Eligible Personnel</h3>
							<p class="hint">Leave everything unselected to include everyone in the current scope.</p>
						</div>
						<div class="eligible-count">{eligiblePersonnel.length} eligible</div>
					</div>

					<div class="filter-group">
						<div class="label">Groups</div>
						<div class="chip-list">
							{#each groups as group}
								<button class="chip" class:selected={selectedGroups.includes(group)} onclick={() => toggleGroup(group)}>
									{group || '(No Group)'}
								</button>
							{/each}
						</div>
					</div>

					<div class="filter-group">
						<div class="label">Ranks</div>
						<div class="chip-list">
							{#each allRanks as rank}
								<button class="chip" class:selected={selectedRanks.includes(rank)} onclick={() => toggleRank(rank)}>
									{rank}
								</button>
							{/each}
						</div>
					</div>

					{#if allMOS.length > 0}
						<div class="filter-group">
							<div class="label">MOS</div>
							<div class="chip-list">
								{#each allMOS as mos}
									<button class="chip" class:selected={selectedMOS.includes(mos)} onclick={() => toggleMOS(mos)}>
										{mos}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if allRoles.length > 0}
						<div class="filter-group">
							<div class="label">Roles</div>
							<div class="chip-list">
								{#each allRoles as role}
									<button class="chip" class:selected={selectedRoles.includes(role)} onclick={() => toggleRole(role)}>
										{role}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</section>

				{#if selectedAssignmentTypeId}
					<section class="config-section panel-card section-card card card-flat config-main">
						<div class="panel-header">
							<div>
								<h3>Exempt Personnel</h3>
								<p class="hint">These people will never be assigned this duty type.</p>
							</div>
							{#if currentExemptIds.length > 0}
								<div class="exempt-count">{currentExemptIds.length} exempted</div>
							{/if}
						</div>

						<div class="chip-list">
							{#each personnelByGroup as grp}
								{#each grp.personnel as person}
									<button
										class="chip exempt-chip"
										class:selected={currentExemptIds.includes(person.id)}
										onclick={() => toggleExempt(person.id)}
									>
										{person.rank}
										{person.lastName}
									</button>
								{/each}
							{/each}
						</div>
					</section>
				{/if}

			</div>

			<div class="sticky-actions section-card card card-flat">
				<div>
					<h3>Ready to generate?</h3>
					<p class="hint">The preview shows who gets assigned before anything is written to the calendar.</p>
				</div>
				<button
					class="btn btn-primary"
					onclick={generateRoster}
					disabled={!selectedAssignmentTypeId || !startDate || !endDate || eligiblePersonnel.length === 0 || isGenerating}
				>
					{isGenerating ? 'Generating...' : 'Generate Roster'}
				</button>
			</div>
		{/if}
	</div>
</section>

{#if reApplyItem}
	<ConfirmDialog
		title="Re-apply Roster"
		message={`Re-apply "${reApplyItem.name}" to the calendar? This will overwrite any existing assignments for those dates.`}
		confirmLabel="Re-apply"
		variant="warning"
		onConfirm={doReApplyRoster}
		onCancel={() => (reApplyItem = null)}
	/>
{/if}

<style>
	.hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.hint-detail {
		font-style: italic;
		margin-top: 0;
	}

	.hint-detail a {
		color: var(--color-primary);
		text-decoration: underline;
	}

	.generator-shell {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.generator-hero {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-lg);
		padding: var(--section-card-padding);
	}

	.hero-copy {
		flex: 1;
		min-width: 0;
	}

	.hero-copy h2,
	.panel-header h3,
	.sticky-actions h3 {
		margin: 0;
		font-family: var(--font-display);
	}

	.hero-copy h2 {
		font-size: var(--font-size-xl);
	}

	.eyebrow {
		margin: 0 0 var(--spacing-xs);
		font-size: var(--font-size-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.hero-description {
		margin: var(--spacing-sm) 0 0;
		max-width: 58ch;
		color: var(--color-text-secondary);
	}

	.view-nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		justify-content: flex-end;
		flex-shrink: 0;
		margin-left: auto;
		align-self: center;
	}

	.view-tab {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.view-tab.active {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
		color: var(--color-primary);
	}

	.view-tab:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.feedback-banner {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		border: 1px solid #166534;
		background: #f0fdf4;
		color: #166534;
		font-size: var(--font-size-sm);
		font-weight: 600;
	}

	.feedback-banner.error {
		border-color: #b91c1c;
		background: #fef2f2;
		color: #b91c1c;
	}

	.generator-body {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.panel-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.config-section .panel-header {
		margin-bottom: 0;
	}

	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
		justify-content: flex-end;
	}

	.config-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--spacing-lg);
		align-items: stretch;
	}

	.config-main {
		grid-column: span 2;
	}

	.config-section {
		margin-bottom: 0;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.chip {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.chip:hover {
		border-color: var(--color-primary);
	}

	.chip.selected {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-chrome);
	}

	.chip.status-chip.selected {
		background: var(--chip-color);
		border-color: var(--chip-color);
		color: var(--chip-text);
	}

	.chip.exempt-chip.selected {
		background: #dc2626;
		border-color: #dc2626;
		color: white;
	}

	.eligible-count,
	.exempt-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		text-align: center;
		margin-top: 0;
	}

	.history-panel,
	.preview-panel {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.history-card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.history-card-info {
		flex: 1;
		min-width: 0;
	}

	.history-card-name {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.history-card-meta {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	.history-card-date {
		color: var(--color-text-muted);
	}

	.history-card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		flex-shrink: 0;
	}

	.btn-xs {
		padding: 2px var(--spacing-xs);
		font-size: var(--font-size-xs);
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.btn-danger {
		background: #dc2626;
		color: white;
		border-color: #dc2626;
	}

	.btn-danger:hover {
		background: #b91c1c;
		border-color: #b91c1c;
	}

	.history-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		background: var(--color-primary);
		color: var(--color-chrome);
		border-radius: var(--radius-full);
		font-size: 10px;
		font-weight: 700;
		margin-left: 2px;
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.roster-stats {
		display: flex;
		gap: var(--spacing-md);
	}

	.stat {
		flex: 1;
		text-align: center;
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.stat-value {
		display: block;
		font-size: var(--font-size-xl);
		font-weight: 700;
		color: var(--color-primary);
	}

	.stat-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
	}

	.stat.unfilled .stat-value {
		color: #dc2626;
	}

	.roster-table-container {
		max-height: min(65vh, 700px);
		overflow: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.roster-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.roster-table th,
	.roster-table td {
		padding: var(--spacing-sm);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.roster-table th {
		background: var(--color-bg);
		font-weight: 600;
		position: sticky;
		top: 0;
	}

	.roster-table tr:last-child td {
		border-bottom: none;
	}

	.roster-table tr.unfilled {
		background: #fef2f2;
	}

	.unfilled-cell {
		color: #dc2626;
		font-style: italic;
	}

	.assignee-rank {
		font-weight: 600;
		color: var(--color-primary);
		margin-right: var(--spacing-xs);
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		cursor: pointer;
		margin-bottom: 0;
	}

	.toggle-row input[type='checkbox'] {
		width: 16px;
		height: 16px;
		accent-color: var(--color-primary);
	}

	/* Preview Tabs */
	.preview-tabs {
		display: flex;
		gap: 0;
		border-bottom: 2px solid var(--color-border);
		margin-bottom: var(--spacing-md);
	}

	.preview-tab {
		padding: var(--spacing-sm) var(--spacing-md);
		border: none;
		background: none;
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		transition: all 0.15s ease;
	}

	.preview-tab:hover {
		color: var(--color-text);
	}

	.preview-tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	/* DA6 Table */
	.da6-table {
		font-size: var(--font-size-xs);
	}

	.da6-sticky-col {
		position: sticky;
		left: 0;
		background: var(--color-surface);
		z-index: 1;
		white-space: nowrap;
	}

	.da6-table thead .da6-sticky-col {
		z-index: 2;
		background: var(--color-bg);
	}

	.da6-name-cell {
		min-width: 160px;
	}

	.da6-date-col {
		text-align: center;
		min-width: 40px;
		padding: var(--spacing-xs) !important;
	}

	.da6-cell {
		text-align: center;
		padding: var(--spacing-xs) !important;
		font-variant-numeric: tabular-nums;
	}

	.da6-assigned {
		background: #c6f6d5;
		font-weight: 700;
		color: #22543d;
	}

	.da6-queue {
		color: var(--color-text-muted);
	}

	.da6-unavail {
		color: var(--color-text-muted);
		background: var(--color-bg);
		opacity: 0.5;
	}

	.sticky-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		position: sticky;
		bottom: var(--spacing-md);
	}

	.sticky-actions h3 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-xs);
	}

	@media (max-width: 900px) {
		.generator-hero,
		.panel-header,
		.sticky-actions {
			flex-direction: column;
		}

		.view-nav,
		.panel-actions {
			justify-content: flex-start;
		}

		.config-grid {
			grid-template-columns: 1fr;
		}

		.config-main {
			grid-column: auto;
		}
	}
</style>
