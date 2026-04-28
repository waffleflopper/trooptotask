<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AvailabilityEntry, SpecialDay, StatusType } from '$lib/types';
	import type { AssignmentType, DailyAssignment } from '$lib/types';
	import type { DutyEvent } from '../duty-roster.types';
	import type { RosterHistoryItem, RosterHistoryEntry, DA6Data } from '../stores/dutyRosterHistory.svelte';
	import { buildDutyRosterApplyPayload, buildDutyRosterHistoryPayload, buildDutyRosterRunSnapshot } from '../run';
	import type { DutyRosterRunSnapshot, DutyRosterSnapshotPersonnel } from '../run';
	import { exportDutyRosterForBrowser } from '../export/dutyRosterBrowserExport';
	import { formatDate } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import WizardStepper from './WizardStepper.svelte';
	import DutyRosterProgressModal from './DutyRosterProgressModal.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { SvelteSet } from 'svelte/reactivity';

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
	type GeneratedRosterEntry = { date: string; assignee: DutyRosterSnapshotPersonnel | null; reason?: string };

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
	let draftExemptIds = new SvelteSet<string>();
	let excludeStatuses = $state<string[]>([]);
	let excludeWeekends = $state(false);
	let excludeHolidays = $state(false);
	let excludeOrgClosures = $state(false);
	let isSavingExemptions = $state(false);
	let lastSyncedExemptionScope = '';

	// Generated roster state
	let activeRunSnapshot = $state<DutyRosterRunSnapshot | null>(null);
	let generatedRoster = $state<GeneratedRosterEntry[]>([]);
	let isGenerating = $state(false);
	let isApplying = $state(false);
	let isRetryingHistory = $state(false);
	let previewTab = $state<'roster' | 'da6'>('roster');
	let applyFeedback = $state<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null);
	let partialSuccessSnapshot = $state<DutyRosterRunSnapshot | null>(null);

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

	// Generate the preview from an immutable run snapshot while the page owns form state/rendering.
	function generateRoster() {
		if (!selectedAssignmentType || !startDate || !endDate) return;

		isGenerating = true;

		const snapshot = buildDutyRosterRunSnapshot({
			assignmentType: selectedAssignmentType,
			personnel: allPersonnel,
			assignments,
			advancedDutyEvents,
			availabilityEntries,
			statusTypes,
			specialDays,
			config: {
				startDate,
				endDate,
				dutyDuration,
				excludedStatusIds: excludeStatuses,
				excludeWeekends,
				excludeHolidays,
				excludeOrgClosures,
				exemptPersonnelIds: [...draftExemptIds]
			},
			generatedAt: new Date().toISOString()
		});
		const personnelById = new Map(snapshot.personnel.map((person) => [person.id, person]));

		activeRunSnapshot = snapshot;
		partialSuccessSnapshot = null;
		generatedRoster = snapshot.rosterRows.map((row) => ({
			date: row.date,
			assignee: row.assigneeId ? (personnelById.get(row.assigneeId) ?? null) : null,
			reason: row.reason
		}));
		previewTab = 'roster';
		view = 'preview';
		isGenerating = false;
	}

	async function saveSnapshotHistory(snapshot: DutyRosterRunSnapshot): Promise<RosterHistoryItem | null> {
		return onSaveRoster(buildDutyRosterHistoryPayload(snapshot));
	}

	// Apply roster to calendar and save to history
	async function applyRoster() {
		const snapshot = activeRunSnapshot;
		if (!snapshot || generatedRoster.length === 0) return;

		isApplying = true;
		applyFeedback = null;
		partialSuccessSnapshot = null;

		try {
			const applied = await onApplyRoster(buildDutyRosterApplyPayload(snapshot));
			if (!applied) {
				applyFeedback = {
					tone: 'error',
					message: 'The roster could not be applied to the calendar. Nothing was changed.'
				};
				return;
			}

			const saved = await saveSnapshotHistory(snapshot);

			if (!saved) {
				partialSuccessSnapshot = snapshot;
				applyFeedback = {
					tone: 'warning',
					message: 'Roster applied to the calendar. History could not be saved.'
				};
				view = 'preview';
				return;
			}

			applyFeedback = {
				tone: 'success',
				message: 'Roster applied to the calendar and saved to history.'
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

	async function retryHistorySave() {
		const snapshot = partialSuccessSnapshot;
		if (!snapshot) return;

		isRetryingHistory = true;
		applyFeedback = null;
		try {
			const saved = await saveSnapshotHistory(snapshot);
			if (!saved) {
				applyFeedback = {
					tone: 'warning',
					message: 'History could not be saved. The snapshot is still available to retry or export.'
				};
				return;
			}
			partialSuccessSnapshot = null;
			applyFeedback = {
				tone: 'success',
				message: 'Roster history saved.'
			};
			view = 'history';
		} catch (error) {
			applyFeedback = {
				tone: 'error',
				message: error instanceof Error ? error.message : 'History could not be saved.'
			};
		} finally {
			isRetryingHistory = false;
		}
	}

	// Temporary browser download adapter; formatting stays isolated outside the run module.
	function exportToExcel(opts?: {
		roster: RosterHistoryEntry[];
		typeName: string;
		startDate: string;
		endDate: string;
		da6?: DA6Data;
	}) {
		if (opts) {
			exportDutyRosterForBrowser({ history: opts });
			return;
		}
		if (!activeRunSnapshot) return;
		exportDutyRosterForBrowser({ model: activeRunSnapshot.exportModel, da6: activeRunSnapshot.da6 });
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

	function replaceDraftExemptIds(ids: Iterable<string>) {
		draftExemptIds.clear();
		for (const id of ids) {
			draftExemptIds.add(id);
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

		replaceDraftExemptIds(currentExemptIds);
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
		<div
			class="feedback-banner"
			class:error={applyFeedback.tone === 'error'}
			class:warning={applyFeedback.tone === 'warning'}
		>
			<span>{applyFeedback.message}</span>
			{#if partialSuccessSnapshot}
				<div class="feedback-actions">
					<button class="btn btn-secondary btn-xs" onclick={retryHistorySave} disabled={isRetryingHistory}>
						{isRetryingHistory ? 'Saving...' : 'Retry History Save'}
					</button>
					<button class="btn btn-secondary btn-xs" onclick={() => exportToExcel()}>Export Snapshot</button>
				</div>
			{/if}
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

				{#if previewTab === 'da6' && activeRunSnapshot}
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
										{#each activeRunSnapshot.da6.columns as column (column.date)}
											{@const date = new Date(column.date + 'T00:00:00')}
											<th class="da6-date-col"
												>{date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</th
											>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each activeRunSnapshot.da6.rows as row (row.personnelId)}
										<tr>
											<td class="da6-sticky-col da6-name-cell">
												<span class="assignee-rank">{row.display.rank}</span>
												{row.display.lastName}, {row.display.firstName}
											</td>
											{#each activeRunSnapshot.da6.columns as column, columnIndex (column.date)}
												{@const cell = row.cells[columnIndex]}
												{#if !cell || cell.queuePosition === null}
													<td class="da6-cell da6-unavail">&mdash;</td>
												{:else if cell.assigned}
													<td class="da6-cell da6-assigned">X</td>
												{:else}
													<td class="da6-cell da6-queue">{cell.queuePosition}</td>
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
									{#each generatedRoster as entry (entry.date)}
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
							{#each personnelAssignmentTypes as type (type.id)}
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
						{#each statusTypes as status (status.id)}
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
							onChange={replaceDraftExemptIds}
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
{#if isApplying}
	<DutyRosterProgressModal mode="apply" eventCount={generatedRoster.filter((entry) => entry.assignee).length} />
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
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-4);
		border-radius: var(--radius-md);
		border: 1px solid #166534;
		background: #f0fdf4;
		color: #166534;
		font-size: var(--text-ui-sm);
		font-weight: 600;
	}

	.feedback-banner.warning {
		border-color: #a16207;
		background: #fefce8;
		color: #854d0e;
	}

	.feedback-banner.error {
		border-color: #b91c1c;
		background: #fef2f2;
		color: #b91c1c;
	}

	.feedback-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
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
