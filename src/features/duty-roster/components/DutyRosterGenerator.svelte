<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AvailabilityEntry, SpecialDay, StatusType } from '$lib/types';
	import type { AssignmentType, DailyAssignment } from '$lib/types';
	import type { DutyEvent } from '../duty-roster.types';
	import { resolveSlotBlockingMode } from '../blockingMode';
	import type { RosterHistoryItem, RosterHistoryEntry, DA6Data } from '../stores/dutyRosterHistory.svelte';
	import { formatDate } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import WizardStepper from './WizardStepper.svelte';
	import MultiTagSelect from './MultiTagSelect.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		initialAssignmentTypeId?: string;
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		advancedDutyEvents: DutyEvent[];
		personnelByGroup: { group: string; personnel: Personnel[] }[];
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
		initialAssignmentTypeId = undefined,
		assignmentTypes,
		assignments,
		advancedDutyEvents,
		personnelByGroup,
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

	type DutyRosterView = 'setup' | 'preview' | 'history';

	const WIZARD_STEPS = [
		{ id: 'setup', label: 'Setup' },
		{ id: 'preview', label: 'Preview & Apply' }
	];

	let view = $state<DutyRosterView>('setup');

	// Configuration state
	let selectedAssignmentTypeId = $state('');
	let dutyDuration = $state<'daily' | 'weekly' | 'monthly'>('daily');
	let startDate = $state(getMonthStart());
	let endDate = $state(getMonthEnd());
	let draftExemptIds = $state<Set<string>>(new Set());
	let excludeStatuses = $state<string[]>([]);
	let excludeWeekends = $state(false);
	let excludeHolidays = $state(false);
	let excludeOrgClosures = $state(false);
	let isSavingExemptions = $state(false);
	let lastSyncedExemptionScope = '';

	// Generated roster state
	let generatedRoster = $state<{ date: string; assignee: Personnel | null; reason?: string }[]>([]);
	let generatedDA6 = $state<DA6Data | null>(null);
	let isGenerating = $state(false);
	let isApplying = $state(false);
	let previewTab = $state<'roster' | 'da6'>('roster');
	let applyFeedback = $state<{ tone: 'success' | 'error'; message: string } | null>(null);

	const allPersonnel = $derived(personnelByGroup.flatMap((group) => group.personnel));

	const exemptPersonnelOptions = $derived(
		[...allPersonnel]
			.sort((a, b) => a.lastName.localeCompare(b.lastName, 'en-US') || a.firstName.localeCompare(b.firstName, 'en-US'))
			.map((p) => ({ value: p.id, label: `${p.rank} ${p.lastName}, ${p.firstName}` }))
	);

	// Get currently selected assignment type object
	const selectedAssignmentType = $derived.by(
		() => assignmentTypes.find((t) => t.id === selectedAssignmentTypeId) ?? null
	);

	// Exempt personnel IDs for the currently selected assignment type
	const currentExemptIds = $derived.by(() => selectedAssignmentType?.exemptPersonnelIds ?? []);

	const availableRosterPool = $derived.by(() => allPersonnel.filter((person) => !draftExemptIds.has(person.id)));

	const eligiblePersonnel = $derived(availableRosterPool);

	const hasExemptionChanges = $derived.by(() => {
		if (currentExemptIds.length !== draftExemptIds.size) return true;
		return currentExemptIds.some((id) => !draftExemptIds.has(id));
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
	function formatDateTime(value: Date): string {
		const year = value.getFullYear();
		const month = String(value.getMonth() + 1).padStart(2, '0');
		const day = String(value.getDate()).padStart(2, '0');
		const hours = String(value.getHours()).padStart(2, '0');
		const minutes = String(value.getMinutes()).padStart(2, '0');
		const seconds = String(value.getSeconds()).padStart(2, '0');
		return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
	}

	function addHours(dateTime: string, hours: number): string {
		const value = new Date(dateTime);
		value.setHours(value.getHours() + hours);
		return formatDateTime(value);
	}

	function hasBlockingAdvancedDuty(personnelId: string, date: string): boolean {
		const dayStart = `${date}T00:00:00`;
		const dayEnd = `${date}T23:59:59`;
		return advancedDutyEvents.some((event) => {
			const hasBlockingAssignee = event.slotInstances.some((slot) => {
				if (slot.assigneeId !== personnelId) {
					return false;
				}

				const snapshotSlot = event.rulesSnapshot.slots.find(
					(candidate) => candidate.templateSlotId === slot.templateSlotId
				);
				return resolveSlotBlockingMode(event.isBlocking, snapshotSlot?.blockingMode);
			});
			if (!hasBlockingAssignee) return false;
			const overlaps = event.coverageStart < dayEnd && event.coverageEnd > dayStart;
			const cooldownBlocks =
				event.coverageEnd <= dayStart && addHours(event.coverageEnd, event.cooldownHours) > dayStart;
			return overlaps || cooldownBlocks;
		});
	}

	function isPersonAvailable(person: Personnel, date: string): boolean {
		if (hasBlockingAdvancedDuty(person.id, date)) {
			return false;
		}

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

		try {
			const applied = await onApplyRoster(assignmentsToCreate);
			if (!applied) {
				applyFeedback = {
					tone: 'error',
					message: 'The roster could not be applied to the calendar. Nothing was changed.'
				};
				return;
			}

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
					exemptPersonnelIds: [...draftExemptIds],
					excludeStatuses,
					excludeWeekends,
					excludeHolidays,
					excludeOrgClosures
				}
			});

			applyFeedback = {
				tone: 'success',
				message: saved
					? 'Roster applied to the calendar and saved to history.'
					: 'Roster applied to the calendar. History could not be saved.'
			};
			view = 'history';
		} catch (error) {
			applyFeedback = {
				tone: 'error',
				message:
					error instanceof Error
						? error.message
						: 'The roster could not be applied to the calendar. Nothing was changed.'
			};
		} finally {
			isApplying = false;
		}
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

	function toggleExcludeStatus(statusId: string) {
		if (excludeStatuses.includes(statusId)) {
			excludeStatuses = excludeStatuses.filter((s) => s !== statusId);
		} else {
			excludeStatuses = [...excludeStatuses, statusId];
		}
	}

	async function saveExemptions() {
		if (!selectedAssignmentTypeId || !hasExemptionChanges || isSavingExemptions) return;
		isSavingExemptions = true;
		try {
			await onUpdateExemptions(selectedAssignmentTypeId, [...draftExemptIds]);
			toastStore.success('Exempt personnel updated');
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to update exempt personnel');
		} finally {
			isSavingExemptions = false;
		}
	}

	// Default to all statuses excluded — users click off the ones they want to allow
	$effect(() => {
		if (excludeStatuses.length === 0 && statusTypes.length > 0) {
			excludeStatuses = statusTypes.map((s) => s.id);
		}
	});

	$effect(() => {
		const currentScope = `${selectedAssignmentTypeId}:${[...currentExemptIds].sort().join(',')}`;
		if (currentScope === lastSyncedExemptionScope) return;

		if (lastSyncedExemptionScope && hasExemptionChanges) {
			toastStore.warning('Unsaved exempt personnel changes were discarded because the duty exemptions changed.');
		}

		draftExemptIds = new Set(currentExemptIds);
		lastSyncedExemptionScope = currentScope;
	});

	// Personnel-only assignment types
	const personnelAssignmentTypes = $derived(assignmentTypes.filter((t) => t.assignTo === 'personnel'));
	let lastAppliedInitialAssignmentTypeId = $state<string | null>(null);

	$effect(() => {
		const nextInitialId = initialAssignmentTypeId?.trim() || null;
		if (!nextInitialId || nextInitialId === lastAppliedInitialAssignmentTypeId) return;
		if (!personnelAssignmentTypes.some((type) => type.id === nextInitialId)) return;

		selectedAssignmentTypeId = nextInitialId;
		lastAppliedInitialAssignmentTypeId = nextInitialId;
	});

	const panelTitle = $derived(
		view === 'history' ? 'Roster History' : view === 'preview' ? 'Generated Roster Preview' : 'Generate Duty Roster'
	);

	const canGenerate = $derived(!!selectedAssignmentTypeId && !!startDate && !!endDate && eligiblePersonnel.length > 0);
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
		{#if view !== 'history'}
			<button class="btn btn-secondary btn-sm" onclick={() => (view = 'history')}>
				View History{rosterHistory.length > 0 ? ` (${rosterHistory.length})` : ''}
			</button>
		{/if}
	</div>

	{#if applyFeedback}
		<div class="feedback-banner" class:error={applyFeedback.tone === 'error'}>
			{applyFeedback.message}
		</div>
	{/if}

	{#if view !== 'history'}
		<WizardStepper steps={WIZARD_STEPS} current={view === 'preview' ? 'preview' : 'setup'} />
	{/if}

	<div class="generator-body">
		{#if view === 'history'}
			<section class="panel-card section-card card card-flat history-panel">
				<div class="panel-header">
					<div>
						<h3>Roster History</h3>
						<p class="hint">Past rosters, most recent first.</p>
					</div>
					<button class="btn btn-secondary btn-sm" onclick={() => (view = 'setup')}>Back to Setup</button>
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
						<button class="btn btn-secondary" onclick={() => (view = 'setup')}>← Back</button>
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
		{:else if view === 'setup'}
			<div class="wizard-step">
				<section class="config-section panel-card section-card card card-flat">
					<div class="panel-header">
						<div>
							<h3>Duty Configuration</h3>
							<p class="hint">Choose what you are filling and the date range the roster should cover.</p>
						</div>
						<div class="panel-actions">
							<button class="btn btn-primary" onclick={generateRoster} disabled={!canGenerate || isGenerating}>
								{isGenerating ? 'Generating...' : 'Generate Roster'}
							</button>
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
							<p class="pane-eyebrow">Scheduling</p>
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
							<p class="pane-eyebrow">Availability Rules</p>
							<h3>Unavailable Statuses</h3>
							<p class="hint">Anyone carrying one of these statuses during a duty date will be skipped.</p>
						</div>
					</div>

					<div class="chip-list">
						{#each statusTypes as status}
							<button
								class="chip status-chip"
								class:selected={excludeStatuses.includes(status.id)}
								aria-pressed={excludeStatuses.includes(status.id)}
								style="--chip-color: {status.color}; --chip-text: {status.textColor}"
								onclick={() => toggleExcludeStatus(status.id)}
							>
								{status.name}
							</button>
						{/each}
					</div>
				</section>

				{#if selectedAssignmentTypeId}
					<section class="config-section panel-card section-card card card-flat">
						<div class="panel-header">
							<div>
								<p class="pane-eyebrow">Exemptions</p>
								<h3>Exempt Personnel</h3>
								<p class="hint">
									These people will never be assigned this duty type. Everyone else is eligible by default.
								</p>
							</div>
							{#if hasExemptionChanges}
								<div class="panel-actions">
									<button class="btn btn-primary btn-sm" onclick={saveExemptions} disabled={isSavingExemptions}>
										{isSavingExemptions ? 'Saving...' : 'Save Exemptions'}
									</button>
								</div>
							{/if}
						</div>
						<MultiTagSelect
							options={exemptPersonnelOptions}
							value={[...draftExemptIds]}
							placeholder="Search to add exempt personnel..."
							ariaLabel="Exempt personnel"
							onChange={(ids) => (draftExemptIds = new Set(ids))}
						/>
					</section>
				{/if}
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
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		margin-bottom: var(--sp-2);
	}

	.hint-detail {
		font-style: italic;
		margin-top: 0;
	}

	.hint-detail a {
		color: var(--amber);
		text-decoration: underline;
	}

	.generator-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.generator-hero {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-6);
		padding: var(--section-card-padding);
	}

	.hero-copy {
		flex: 1;
		min-width: 0;
	}

	.hero-copy h2,
	.panel-header h3 {
		margin: 0;
		font-family: var(--font-display);
	}

	.hero-copy h2 {
		font-size: var(--text-ui-xl);
	}

	.eyebrow {
		margin: 0 0 var(--sp-1);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.hero-description {
		margin: var(--sp-2) 0 0;
		max-width: 58ch;
		color: var(--text-secondary);
	}

	.feedback-banner {
		padding: var(--sp-2) var(--sp-4);
		border-radius: var(--radius-md);
		border: 1px solid #166534;
		background: #f0fdf4;
		color: #166534;
		font-size: var(--text-ui-sm);
		font-weight: 600;
	}

	.feedback-banner.error {
		border-color: #b91c1c;
		background: #fef2f2;
		color: #b91c1c;
	}

	.wizard-step {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.generator-body {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.panel-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.config-section .panel-header {
		margin-bottom: 0;
	}

	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		justify-content: flex-end;
	}

	.config-section {
		margin-bottom: 0;
	}

	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.pane-eyebrow {
		margin: 0 0 var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.chip {
		appearance: none;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid var(--border-default);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.chip:hover {
		border-color: var(--ink-35);
		background: var(--surface-panel);
		color: var(--text-primary);
	}

	.chip.selected {
		background: var(--amber-light);
		border-color: var(--amber);
		color: var(--amber-dark);
	}

	.chip.status-chip.selected {
		background: var(--chip-color);
		border-color: var(--chip-color);
		color: var(--chip-text);
	}

	.history-panel,
	.preview-panel {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.history-card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface-page);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
	}

	.history-card-info {
		flex: 1;
		min-width: 0;
	}

	.history-card-name {
		font-size: var(--text-ui-sm);
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.history-card-meta {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		margin-top: 2px;
	}

	.history-card-date {
		color: var(--text-tertiary);
	}

	.history-card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		flex-shrink: 0;
	}

	.btn-xs {
		padding: 2px var(--sp-1);
		font-size: var(--text-xs);
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

	.empty-state {
		text-align: center;
		padding: var(--sp-8);
		color: var(--text-tertiary);
		font-size: var(--text-ui-sm);
	}

	.roster-stats {
		display: flex;
		gap: var(--sp-4);
	}

	.stat {
		flex: 1;
		text-align: center;
		padding: var(--sp-2);
		background: var(--surface-page);
		border-radius: var(--radius-md);
	}

	.stat-value {
		display: block;
		font-size: var(--text-ui-xl);
		font-weight: 700;
		color: var(--amber);
	}

	.stat-label {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		text-transform: uppercase;
	}

	.stat.unfilled .stat-value {
		color: #dc2626;
	}

	.roster-table-container {
		max-height: min(65vh, 700px);
		overflow: auto;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
	}

	.roster-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-ui-sm);
	}

	.roster-table th,
	.roster-table td {
		padding: var(--sp-2);
		text-align: left;
		border-bottom: 1px solid var(--border-default);
	}

	.roster-table th {
		background: var(--surface-page);
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
		color: var(--amber);
		margin-right: var(--sp-1);
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--text-ui-sm);
		cursor: pointer;
		margin-bottom: 0;
	}

	.toggle-row input[type='checkbox'] {
		width: 16px;
		height: 16px;
		accent-color: var(--amber);
	}

	/* Preview Tabs */
	.preview-tabs {
		display: flex;
		gap: 0;
		border-bottom: 2px solid var(--border-default);
		margin-bottom: var(--sp-4);
	}

	.preview-tab {
		padding: var(--sp-2) var(--sp-4);
		border: none;
		background: none;
		font-size: var(--text-ui-sm);
		font-weight: 500;
		color: var(--text-tertiary);
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		transition: all 0.15s ease;
	}

	.preview-tab:hover {
		color: var(--text-primary);
	}

	.preview-tab.active {
		color: var(--amber);
		border-bottom-color: var(--amber);
	}

	/* DA6 Table */
	.da6-table {
		font-size: var(--text-xs);
	}

	.da6-sticky-col {
		position: sticky;
		left: 0;
		background: var(--surface-panel);
		z-index: 1;
		white-space: nowrap;
	}

	.da6-table thead .da6-sticky-col {
		z-index: 2;
		background: var(--surface-page);
	}

	.da6-name-cell {
		min-width: 160px;
	}

	.da6-date-col {
		text-align: center;
		min-width: 40px;
		padding: var(--sp-1) !important;
	}

	.da6-cell {
		text-align: center;
		padding: var(--sp-1) !important;
		font-variant-numeric: tabular-nums;
	}

	.da6-assigned {
		background: #c6f6d5;
		font-weight: 700;
		color: #22543d;
	}

	.da6-queue {
		color: var(--text-tertiary);
	}

	.da6-unavail {
		color: var(--text-tertiary);
		background: var(--surface-page);
		opacity: 0.5;
	}

	@media (max-width: 900px) {
		.generator-hero,
		.panel-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.panel-actions {
			justify-content: flex-start;
		}
	}
</style>
