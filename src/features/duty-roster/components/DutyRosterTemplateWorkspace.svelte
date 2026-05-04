<script lang="ts">
	import { deserialize } from '$app/forms';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import type {
		DutyRosterTemplateAcceptedRun,
		DutyRosterTemplate,
		DutyRosterTemplateCountReadModel,
		DutyRosterTemplateRunCorrection,
		DutyRosterTemplateSetupOptions,
		DutyRosterTemplateSettingsData,
		DutyRosterTemplateView
	} from '$features/duty-roster/templates/dutyRosterTemplates';
	import {
		manualSelectionForDate,
		previewFinalAssigneeId,
		type DutyRosterTemplateAcceptedSnapshot,
		type DutyRosterTemplatePreview
	} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import { parse as parseDevalue } from 'devalue';

	type ActionForm = {
		error?: string;
		generateError?: string;
		manualError?: string;
		settingsError?: string;
		applyError?: string;
		invalidateError?: string;
		correctionError?: string;
		preview?: DutyRosterTemplatePreview;
		acceptedRun?: DutyRosterTemplateAcceptedRun;
		printAcceptedRun?: boolean;
		generateValues?: {
			startDate?: string;
			endDate?: string;
		};
		values?: {
			name?: string;
			slug?: string;
			shortCode?: string;
			rankValues?: string[];
			groupIds?: string[];
			mosValues?: string[];
			dutyRoleValues?: string[];
			exemptPersonnelIds?: string[];
		};
	};

	interface WorkspaceData {
		orgId: string;
		orgName: string;
		templates: DutyRosterTemplate[];
		selectedTemplate?: DutyRosterTemplate | null;
		settings?: DutyRosterTemplateSettingsData | null;
		acceptedRuns?: DutyRosterTemplateAcceptedRun[];
		countReadModel?: DutyRosterTemplateCountReadModel | null;
		setupOptions?: DutyRosterTemplateSetupOptions | null;
		view?: DutyRosterTemplateView | 'new';
		historyDetailRunId?: string | null;
		historyDetailMode?: 'roster' | 'da6';
	}

	let { data, form }: { data: WorkspaceData; form?: unknown } = $props();
	let acceptAndPrintPending = $state(false);
	let acceptAndPrintError = $state<string | null>(null);
	let previewMode = $state<'list' | 'matrix'>('list');
	let generatingPreview = $state(false);
	let editingPreviewRows = $state<Record<string, boolean>>({});
	let editingCorrections = $state<Record<string, boolean>>({});
	let expandedHistoryRuns = $state<Record<string, boolean>>({});
	let selectedPreviewAssignees = $state<Record<string, string>>({});
	let selectedCorrectionAssignees = $state<Record<string, string>>({});
	let rankFilterValues = $state<string[]>([]);
	let groupFilterValues = $state<string[]>([]);
	let mosFilterValues = $state<string[]>([]);
	let dutyRoleFilterValues = $state<string[]>([]);
	let newTemplateStep = $state<'general' | 'pool' | 'exemptions' | 'baseline'>('general');
	let settingsSection = $state<'general' | 'pool' | 'exemptions' | 'baseline'>('general');
	let newTemplateName = $state('');
	let newTemplateSlug = $state('');
	let newTemplateShortCode = $state('');
	let settingsName = $state('');
	let settingsSlug = $state('');
	let settingsShortCode = $state('');
	let settingsExemptPersonnelIds = $state<string[]>([]);
	let settingsBaselineCounts = $state<Record<string, string>>({});
	let wizardExemptPersonnelIds = $state<string[]>([]);

	const INVALIDATE_CONFIRMATION = 'Invalidating this run will remove the assignments from the calendar. Are you sure?';
	const basePath = $derived(`/org/${data.orgId}/duty-rosters`);
	const createAction = $derived(`${basePath}?/createTemplate`);
	const createWizardAction = $derived(`${basePath}/new?/createTemplate`);
	const isNewTemplate = $derived(data.view === 'new');
	const selectedTemplate = $derived(isNewTemplate ? null : (data.selectedTemplate ?? null));
	const selectedView = $derived(data.view ?? 'generate');
	const actionForm = $derived((form && typeof form === 'object' ? form : null) as ActionForm | null);
	const preview = $derived(selectedView === 'generate' ? (actionForm?.preview ?? null) : null);
	const generateAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/generate?/generatePreview` : createAction
	);
	const manualPreviewAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/generate?/manualPreviewSelection` : createAction
	);
	const acceptPreviewAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/generate?/acceptPreview` : createAction
	);
	const applyPreviewAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/generate?/applyPreview` : createAction
	);
	const applyAcceptedRunAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/history?/applyAcceptedRun` : createAction
	);
	const invalidateAcceptedRunAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/history?/invalidateAcceptedRun` : createAction
	);
	const correctAcceptedRunAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/history?/recordCorrection` : createAction
	);
	const settingsAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/settings?/updateSettings` : createAction
	);
	const acceptedRuns = $derived(data.acceptedRuns ?? []);
	const setupPersonnel = $derived(data.settings?.personnel ?? data.setupOptions?.personnel ?? []);
	const historyDetailRun = $derived(
		data.historyDetailRunId ? (acceptedRuns.find((run) => run.id === data.historyDetailRunId) ?? null) : null
	);
	const countReadModel = $derived(data.countReadModel ?? null);
	const latestHistoryRunId = $derived(acceptedRuns[0]?.id ?? null);
	const baselineLocked = $derived(acceptedRuns.length > 0);
	const rankOptions = $derived(uniqueOptions(setupPersonnel.map((person) => person.rank) ?? []));
	const groupOptions = $derived(uniqueGroupOptions(setupPersonnel ?? []));
	const mosOptions = $derived(uniqueOptions(setupPersonnel.map((person) => person.mos).filter(Boolean) ?? []));
	const dutyRoleOptions = $derived(
		uniqueOptions(setupPersonnel.map((person) => person.dutyRole).filter(Boolean) ?? [])
	);
	const wizardResolvedPool = $derived(
		setupPersonnel.filter((person) => {
			if (rankFilterValues.length > 0 && !rankFilterValues.includes(person.rank)) return false;
			if (groupFilterValues.length > 0 && (!person.groupId || !groupFilterValues.includes(person.groupId))) {
				return false;
			}
			if (mosFilterValues.length > 0 && !mosFilterValues.includes(person.mos)) return false;
			if (dutyRoleFilterValues.length > 0 && !dutyRoleFilterValues.includes(person.dutyRole)) return false;
			return true;
		})
	);
	const wizardBaselineRows = $derived(
		wizardResolvedPool.filter((person) => !wizardExemptPersonnelIds.includes(person.id))
	);

	const viewTabs: Array<{ id: DutyRosterTemplateView; label: string; note: string }> = [
		{ id: 'generate', label: 'Generate', note: 'Preview future DA6 runs' },
		{ id: 'history', label: 'History', note: 'Accepted runs will appear here' },
		{ id: 'settings', label: 'Settings', note: 'Template identity and setup' }
	];

	const todayDate = $derived(dateOnlyLocal(new Date()));
	const defaultDateRange = $derived(nextMonthRange(new Date()));
	const generateStartDate = $derived(actionForm?.generateValues?.startDate ?? defaultDateRange.startDate);
	const generateEndDate = $derived(actionForm?.generateValues?.endDate ?? defaultDateRange.endDate);
	const canGenerate = $derived(generateStartDate >= todayDate && generateEndDate >= generateStartDate);
	const historyMode = $derived<'list' | 'matrix'>(data.historyDetailMode === 'da6' ? 'matrix' : 'list');

	$effect(() => {
		if (!data.settings) return;

		settingsName = selectedTemplate?.name ?? '';
		settingsSlug = selectedTemplate?.slug ?? '';
		settingsShortCode = selectedTemplate?.shortCode ?? '';
		settingsExemptPersonnelIds = [...(selectedTemplate?.exemptPersonnelIds ?? [])];
		settingsBaselineCounts = Object.fromEntries(
			data.settings.baselineRows.map((row) => [
				row.personnel.id,
				row.startingCount === null ? '' : String(row.startingCount)
			])
		);
		rankFilterValues = [...(selectedTemplate?.poolCriteria.rankValues ?? [])];
		groupFilterValues = [...(selectedTemplate?.poolCriteria.groupIds ?? [])];
		mosFilterValues = [...(selectedTemplate?.poolCriteria.mosValues ?? [])];
		dutyRoleFilterValues = [...(selectedTemplate?.poolCriteria.dutyRoleValues ?? [])];
	});

	$effect(() => {
		if (!isNewTemplate || !actionForm?.values) return;

		newTemplateName = actionForm.values.name ?? '';
		newTemplateSlug = actionForm.values.slug ?? '';
		newTemplateShortCode = actionForm.values.shortCode ?? '';
		rankFilterValues = [...(actionForm.values.rankValues ?? [])];
		groupFilterValues = [...(actionForm.values.groupIds ?? [])];
		mosFilterValues = [...(actionForm.values.mosValues ?? [])];
		dutyRoleFilterValues = [...(actionForm.values.dutyRoleValues ?? [])];
		wizardExemptPersonnelIds = [...(actionForm.values.exemptPersonnelIds ?? [])];
	});

	function uniqueOptions(values: string[]): string[] {
		return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
	}

	function uniqueGroupOptions(
		personnel: DutyRosterTemplateSettingsData['personnel']
	): Array<{ id: string; label: string }> {
		const groups: Array<{ id: string; label: string }> = [];
		for (const person of personnel) {
			if (person.groupId && !groups.some((group) => group.id === person.groupId)) {
				groups.push({ id: person.groupId, label: person.groupName || 'Unassigned Group' });
			}
		}

		return groups.sort((a, b) => a.label.localeCompare(b.label));
	}

	function dateOnlyLocal(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function nextMonthRange(date: Date): { startDate: string; endDate: string } {
		const start = new Date(date.getFullYear(), date.getMonth() + 1, 1);
		const end = new Date(date.getFullYear(), date.getMonth() + 2, 0);
		return {
			startDate: dateOnlyLocal(start),
			endDate: dateOnlyLocal(end)
		};
	}

	function optionItems(values: string[]): Array<{ value: string; label: string }> {
		return values.map((value) => ({ value, label: value }));
	}

	function groupOptionItems(values: Array<{ id: string; label: string }>): Array<{ value: string; label: string }> {
		return values.map((group) => ({ value: group.id, label: group.label }));
	}

	function personnelOptionItems(
		personnel:
			| DutyRosterTemplatePreview['selectionPersonnel']
			| DutyRosterTemplateAcceptedSnapshot['selectionPersonnel'],
		excludeId?: string | null
	): Array<{ value: string; label: string; description?: string }> {
		return personnel
			.filter((person) => person.id !== excludeId && !person.archivedAt)
			.map((person) => ({
				value: person.id,
				label: `${person.rank} ${person.lastName}, ${person.firstName}`,
				description: person.groupName
			}));
	}

	function slugifyLocal(value: string): string {
		return (
			value
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '')
				.slice(0, 72)
				.replace(/-+$/g, '') || 'duty-roster'
		);
	}

	function calendarActionState(run: DutyRosterTemplateAcceptedRun): 'apply' | 'applied' | 'reapply' {
		if (!run.appliedAt) return 'apply';
		if (run.calendarAssignmentsEdited) return 'reapply';
		return 'applied';
	}

	function previewEditAssigneeId(
		preview: DutyRosterTemplatePreview,
		date: string,
		fallbackAssigneeId: string | null
	): string {
		return selectedPreviewAssignees[date] ?? previewFinalAssigneeId(preview, date) ?? fallbackAssigneeId ?? '';
	}

	function previewSelectionWarnings(preview: DutyRosterTemplatePreview, date: string, selectedId: string): string[] {
		const warnings: string[] = [];
		const selected = preview.selectionPersonnel.find((person) => person.id === selectedId);
		if (!selected) return warnings;

		if (!preview.personnel.some((person) => person.id === selectedId)) {
			warnings.push('Selected Soldier is outside this template pool.');
		}

		const generatedRow = preview.rosterRows.find((row) => row.date === date);
		if (generatedRow?.reason) {
			warnings.push(generatedRow.reason);
		}

		return warnings;
	}

	function issueLabel(warnings: Array<{ message: string }>): string {
		if (warnings.length === 0) return 'Clear';
		return warnings.length === 1 ? 'Review' : `${warnings.length} issues`;
	}

	function issueTitle(warnings: Array<{ message: string }>): string {
		return warnings.length > 0 ? warnings.map((warning) => warning.message).join(' ') : 'No issue flagged.';
	}

	function historyDetailHref(run: DutyRosterTemplateAcceptedRun, mode: 'roster' | 'da6'): string {
		return selectedTemplate ? `${basePath}/${selectedTemplate.slug}/history/${run.id}?mode=${mode}` : basePath;
	}

	function correctionKey(runId: string, date: string): string {
		return `${runId}:${date}`;
	}

	function toggleHistoryRun(runId: string) {
		expandedHistoryRuns = { ...expandedHistoryRuns, [runId]: !expandedHistoryRuns[runId] };
	}

	function isCorrectionOpen(runId: string, date: string): boolean {
		return Boolean(editingCorrections[correctionKey(runId, date)]);
	}

	function selectedCorrectionAssigneeId(runId: string, date: string): string {
		return selectedCorrectionAssignees[correctionKey(runId, date)] ?? '';
	}

	function previewAssignee(preview: DutyRosterTemplatePreview, assigneeId: string | null) {
		return preview.selectionPersonnel.find((person) => person.id === assigneeId) ?? null;
	}

	function previewFormValue(preview: DutyRosterTemplatePreview): string {
		return JSON.stringify(preview);
	}

	function acceptedSnapshot(run: DutyRosterTemplateAcceptedRun): DutyRosterTemplateAcceptedSnapshot {
		return run.snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
	}

	function isAcceptedRun(value: unknown): value is DutyRosterTemplateAcceptedRun {
		return Boolean(
			value &&
			typeof value === 'object' &&
			'id' in value &&
			'snapshotPayload' in value &&
			value.snapshotPayload &&
			typeof value.snapshotPayload === 'object'
		);
	}

	function acceptedCellDisplay(
		cell: DutyRosterTemplateAcceptedSnapshot['da6']['rows'][number]['cells'][number]
	): string {
		return previewCellDisplay(cell);
	}

	function latestCorrectionForDate(run: DutyRosterTemplateAcceptedRun, date: string) {
		return run.corrections.filter((correction) => correction.runRowDate === date).at(-1) ?? null;
	}

	function correctionPersonName(
		display: DutyRosterTemplateRunCorrection['replacementDisplay'],
		fallbackId: string
	): string {
		return display ? `${display.rank} ${display.lastName}, ${display.firstName}` : fallbackId;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function da6CellClasses(
		cell: DutyRosterTemplatePreview['da6']['rows'][number]['cells'][number],
		column?: DutyRosterTemplatePreview['da6']['columns'][number]
	): string {
		const classes: string[] = [];
		if (cell.assigned) classes.push('cell-duty');
		if (cell.da6Code === 'A') classes.push('cell-a');
		if (cell.da6Code === 'D') classes.push('cell-d');
		if (cell.da6Code === 'U') classes.push('cell-u');
		if (column?.sequenceKind === 'weekend') classes.push('cell-weekend');
		return classes.join(' ');
	}

	function previewCellDisplay(cell: DutyRosterTemplatePreview['da6']['rows'][number]['cells'][number]): string {
		if (cell.da6Code === 'A') {
			return 'A';
		}
		if (cell.da6Code === 'D' || cell.da6Code === 'U') {
			return `${cell.da6Code}${cell.sequenceNumber ?? ''}`;
		}
		return cell.sequenceNumber === null ? '' : String(cell.sequenceNumber);
	}

	function printDraftPreview(preview: DutyRosterTemplatePreview): void {
		printDutyRosterForBrowser({ templatePreview: preview, statusLabel: 'Draft' });
	}

	function printAcceptedRun(run: DutyRosterTemplateAcceptedRun): void {
		printDutyRosterForBrowser({ acceptedSnapshot: acceptedSnapshot(run), statusLabel: 'Official' });
	}

	function confirmRunInvalidation(event: SubmitEvent): void {
		if (!confirm(INVALIDATE_CONFIRMATION)) {
			event.preventDefault();
		}
	}

	function actionResultData(resultText: string): Record<string, unknown> | null {
		let result: { type?: unknown; data?: unknown };
		try {
			result = deserialize(resultText) as { type?: unknown; data?: unknown };
		} catch {
			try {
				result = JSON.parse(resultText) as { type?: unknown; data?: unknown };
			} catch {
				return null;
			}
		}

		if (result.type !== 'success') {
			return null;
		}

		if (result.data && typeof result.data === 'object') {
			return result.data as Record<string, unknown>;
		}

		if (typeof result.data === 'string') {
			try {
				const parsed = parseDevalue(result.data);
				return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
			} catch {
				return null;
			}
		}

		return null;
	}

	async function acceptAndPrintPreview(preview: DutyRosterTemplatePreview): Promise<void> {
		if (acceptAndPrintPending) {
			return;
		}

		acceptAndPrintPending = true;
		acceptAndPrintError = null;

		const formData = new FormData();
		formData.set('preview', previewFormValue(preview));
		formData.set('intent', 'print');

		try {
			const response = await fetch(acceptPreviewAction, {
				method: 'POST',
				body: formData
			});
			const resultData = actionResultData(await response.text());

			if (isAcceptedRun(resultData?.acceptedRun)) {
				printAcceptedRun(resultData.acceptedRun);
				return;
			}

			acceptAndPrintError = 'Could not accept and print this Duty Roster preview.';
		} catch {
			acceptAndPrintError = 'Could not accept and print this Duty Roster preview.';
		} finally {
			acceptAndPrintPending = false;
		}
	}
</script>

<svelte:head>
	<title>Duty Rosters - Troop to Task</title>
</svelte:head>

<section class="duty-roster-workspace" aria-labelledby="duty-roster-title">
	{#if selectedTemplate && !isNewTemplate && selectedView === 'settings'}
		<h1 id="duty-roster-title" class="sr-only">{selectedTemplate.name} settings</h1>
	{:else if selectedTemplate && !isNewTemplate}
		<header class="template-detail-header">
			<div>
				<p class="eyebrow">Duty Roster Template</p>
				<h1 id="duty-roster-title">{selectedTemplate.name}</h1>
				<p class="summary">
					{selectedTemplate.shortCode
						? `${selectedTemplate.shortCode} /${selectedTemplate.slug}`
						: `/${selectedTemplate.slug}`}
				</p>
			</div>
			<a class="btn btn-secondary" href={basePath}>Back to Templates</a>
		</header>
	{:else}
		<header class="workspace-header">
			<div>
				<p class="eyebrow">{data.orgName}</p>
				<h1 id="duty-roster-title">Duty Rosters</h1>
				<p class="summary">One-duty DA Form 6 templates with durable workspace links.</p>
			</div>
			<div class="header-status" aria-label="Duty Roster Template count">
				<span>{data.templates.length}</span>
				<p>{data.templates.length === 1 ? 'Template' : 'Templates'}</p>
			</div>
		</header>
	{/if}

	{#if isNewTemplate}
		<section class="new-template-workspace" aria-labelledby="new-template-heading">
			<div class="template-title-row">
				<div>
					<p class="eyebrow">New Template</p>
					<h2 id="new-template-heading">Create Duty Roster Template</h2>
					<p class="summary">Complete each setup section, then save once to create the operational template.</p>
				</div>
				<a class="btn btn-secondary" href={basePath}>Back to Templates</a>
			</div>

			{#if actionForm?.settingsError}
				<p class="form-error settings-error" role="alert">{actionForm.settingsError}</p>
			{/if}

			<form class="settings-form wizard-form" method="POST" action={createWizardAction}>
				<nav class="settings-nav" aria-label="New Template steps">
					<button
						type="button"
						class:active={newTemplateStep === 'general'}
						onclick={() => (newTemplateStep = 'general')}
					>
						General
					</button>
					<button type="button" class:active={newTemplateStep === 'pool'} onclick={() => (newTemplateStep = 'pool')}>
						Pool & Filters
					</button>
					<button
						type="button"
						class:active={newTemplateStep === 'exemptions'}
						onclick={() => (newTemplateStep = 'exemptions')}
					>
						Exemptions
					</button>
					<button
						type="button"
						class:active={newTemplateStep === 'baseline'}
						onclick={() => (newTemplateStep = 'baseline')}
					>
						DA6 Baseline
					</button>
				</nav>

				<div class="settings-panels">
					{#if newTemplateStep === 'general'}
						<section class="settings-section" aria-labelledby="wizard-general-heading">
							<h4 id="wizard-general-heading">General</h4>
							<div class="identity-grid">
								<label>
									<span>Template name</span>
									<input
										name="name"
										maxlength="120"
										required
										bind:value={newTemplateName}
										onblur={() => {
											if (!newTemplateSlug) newTemplateSlug = slugifyLocal(newTemplateName);
										}}
										placeholder="CQ NCO"
									/>
								</label>
								<label>
									<span>Route slug</span>
									<input name="slug" maxlength="72" required bind:value={newTemplateSlug} placeholder="cq-nco" />
								</label>
								<label>
									<span>Short code</span>
									<input name="shortCode" maxlength="12" bind:value={newTemplateShortCode} placeholder="CQ" />
								</label>
							</div>
						</section>
					{/if}

					{#if newTemplateStep === 'pool'}
						<section class="settings-section" aria-labelledby="wizard-pool-heading">
							<h4 id="wizard-pool-heading">Pool & Filters</h4>
							<p class="field-help">Filters match any value inside one category, then combine across categories.</p>
							<div class="criteria-grid">
								<label class="tag-field">
									<span>Rank</span>
									<MultiTagSelect
										options={optionItems(rankOptions)}
										value={rankFilterValues}
										ariaLabel="New Template rank filters"
										placeholder="Any rank"
										onChange={(values) => (rankFilterValues = values)}
									/>
								</label>
								<label class="tag-field">
									<span>Group</span>
									<MultiTagSelect
										options={groupOptionItems(groupOptions)}
										value={groupFilterValues}
										ariaLabel="New Template group filters"
										placeholder="Any group"
										onChange={(values) => (groupFilterValues = values)}
									/>
								</label>
								<label class="tag-field">
									<span>MOS</span>
									<MultiTagSelect
										options={optionItems(mosOptions)}
										value={mosFilterValues}
										ariaLabel="New Template MOS filters"
										placeholder="Any MOS"
										onChange={(values) => (mosFilterValues = values)}
									/>
								</label>
								<label class="tag-field">
									<span>Duty Role</span>
									<MultiTagSelect
										options={optionItems(dutyRoleOptions)}
										value={dutyRoleFilterValues}
										ariaLabel="New Template Duty Role filters"
										placeholder="Any role"
										onChange={(values) => (dutyRoleFilterValues = values)}
									/>
								</label>
							</div>
						</section>
					{/if}

					{#if newTemplateStep === 'exemptions'}
						<section class="settings-section" aria-labelledby="wizard-exemptions-heading">
							<h4 id="wizard-exemptions-heading">Exemptions</h4>
							{#if wizardResolvedPool.length === 0}
								<div class="empty-history">No Soldiers match the current pool filters.</div>
							{:else}
								<div class="pool-table" role="table" aria-label="New Template resolved pool">
									<div class="pool-row pool-head" role="row">
										<span role="columnheader">Soldier</span>
										<span role="columnheader">Group</span>
										<span role="columnheader">MOS</span>
										<span role="columnheader">Exempt</span>
									</div>
									{#each wizardResolvedPool as person (person.id)}
										<div class="pool-row" role="row">
											<span role="cell">{person.rank} {person.lastName}, {person.firstName}</span>
											<span role="cell">{person.groupName || 'No Group'}</span>
											<span role="cell">{person.mos || 'No MOS'}</span>
											<span role="cell">
												<label class="row-check">
													<input
														type="checkbox"
														value={person.id}
														checked={wizardExemptPersonnelIds.includes(person.id)}
														onchange={(event) => {
															const checked = event.currentTarget.checked;
															wizardExemptPersonnelIds = checked
																? [...wizardExemptPersonnelIds, person.id]
																: wizardExemptPersonnelIds.filter((id) => id !== person.id);
														}}
													/>
													<span>Exempt</span>
												</label>
											</span>
										</div>
									{/each}
								</div>
							{/if}
						</section>
					{/if}

					{#if newTemplateStep === 'baseline'}
						<section class="settings-section" aria-labelledby="wizard-baseline-heading">
							<h4 id="wizard-baseline-heading">DA6 Baseline</h4>
							<p class="field-help">Optional starting counts. Leave blank to start from DA6 roster order.</p>
							{#if wizardBaselineRows.length === 0}
								<div class="empty-history">No baseline rows are available until the non-exempt pool has members.</div>
							{:else}
								<div class="baseline-list">
									{#each wizardBaselineRows as person (person.id)}
										<label>
											<span>{person.rank} {person.lastName}, {person.firstName}</span>
											<input type="number" min="0" step="1" name={`baseline:${person.id}`} placeholder="Count" />
										</label>
									{/each}
								</div>
							{/if}
						</section>
					{/if}
				</div>

				{#each rankFilterValues as value (value)}
					<input type="hidden" name="rankValues" {value} />
				{/each}
				{#each groupFilterValues as value (value)}
					<input type="hidden" name="groupIds" {value} />
				{/each}
				{#each mosFilterValues as value (value)}
					<input type="hidden" name="mosValues" {value} />
				{/each}
				{#each dutyRoleFilterValues as value (value)}
					<input type="hidden" name="dutyRoleValues" {value} />
				{/each}
				{#each wizardExemptPersonnelIds as value (value)}
					<input type="hidden" name="exemptPersonnelIds" {value} />
				{/each}

				<div class="wizard-actions">
					<button
						class="btn btn-secondary"
						type="button"
						disabled={newTemplateStep === 'general'}
						onclick={() => {
							newTemplateStep =
								newTemplateStep === 'baseline' ? 'exemptions' : newTemplateStep === 'exemptions' ? 'pool' : 'general';
						}}
					>
						Back
					</button>
					{#if newTemplateStep !== 'baseline'}
						<button
							class="btn btn-primary"
							type="button"
							onclick={() => {
								newTemplateStep =
									newTemplateStep === 'general' ? 'pool' : newTemplateStep === 'pool' ? 'exemptions' : 'baseline';
							}}
						>
							Continue
						</button>
					{:else}
						<button class="btn btn-primary" type="submit">Save Template</button>
					{/if}
				</div>
			</form>
		</section>
	{:else if !selectedTemplate}
		<section class="template-register" aria-labelledby="template-register-heading">
			<div class="template-register__header">
				<div>
					<p class="eyebrow">Duty Roster Templates</p>
					<h2 id="template-register-heading">Duty Rosters</h2>
					<p class="summary">
						One-duty DA6 roster generator per position. Open a template to generate, review history, or change settings.
					</p>
				</div>
				<a class="btn btn-primary" href={`${basePath}/new`}>New Template</a>
			</div>

			{#if data.templates.length === 0}
				<div class="empty-register">
					<p class="empty-title">No templates yet</p>
					<p>Create a one-duty template for CQ, Staff Duty, or another DA Form 6 roster.</p>
				</div>
			{:else}
				<div class="template-grid" aria-label="Duty Roster Template list">
					{#each data.templates as template (template.id)}
						<article class="template-card">
							<a class="template-card__main" href={`${basePath}/${template.slug}/generate`}>
								<div class="template-card__header">
									<div>
										<h3>{template.name}</h3>
										<span>/{template.slug}</span>
									</div>
									<span class="chip chip-primary">{template.shortCode ?? 'No code'}</span>
								</div>
								<div class="template-card__meta">
									<span><strong>{template.poolCriteria.rankValues.length || 'Any'}</strong> ranks</span>
									<span><strong>{template.exemptPersonnelIds.length}</strong> exempt</span>
									<span><strong>{Object.keys(template.manualBaselineCounts).length}</strong> baselines</span>
								</div>
							</a>
							<div class="template-card__actions" aria-label={`${template.name} quick actions`}>
								<a href={`${basePath}/${template.slug}/history`}>History</a>
								<a href={`${basePath}/${template.slug}/settings`}>Settings</a>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{:else}
		<div class="template-detail-workspace">
			{#if actionForm?.error}
				<p class="form-error" role="alert">{actionForm.error}</p>
			{/if}

			<nav class="view-tabs" aria-label="Duty Roster Template views">
				{#each viewTabs as tab (tab.id)}
					<a
						class:active={selectedView === tab.id}
						href={`${basePath}/${selectedTemplate.slug}/${tab.id}`}
						aria-current={selectedView === tab.id ? 'page' : undefined}
					>
						<span>{tab.label}</span>
						<small>{tab.note}</small>
					</a>
				{/each}
			</nav>

			<main class="view-panel" aria-labelledby="template-view-heading">
				{#if selectedView === 'generate'}
					<h2 id="template-view-heading" class="sr-only">Generate Duty Roster preview</h2>

					{#if actionForm?.generateError}
						<p class="form-error settings-error" role="alert">{actionForm.generateError}</p>
					{/if}

					<div class="generate-workspace">
						<aside class="setup-rail" aria-label="Generate setup">
							<div>
								<p class="eyebrow">Setup</p>
								<h4>{selectedTemplate.name}</h4>
								<p>Defaults to the full next calendar month. Past rosters are blocked here and again by the service.</p>
							</div>
							<div class="setup-stat">
								<span>Date range</span>
								<strong>{generateStartDate} to {generateEndDate}</strong>
							</div>
							<div class="setup-stat">
								<span>Policy</span>
								<strong>Longest break</strong>
								<small>DA6 roster order resolves ties. Authorized absence interrupts numbering.</small>
							</div>
							<form
								id="generate-preview-form"
								class="generate-form"
								method="POST"
								action={generateAction}
								onsubmit={() => {
									generatingPreview = true;
								}}
							>
								<input type="hidden" name="templateId" value={selectedTemplate.id} />
								<label>
									<span>Start date</span>
									<input
										name="startDate"
										type="date"
										required
										min={todayDate}
										value={generateStartDate}
										aria-describedby="generate-date-help"
									/>
								</label>
								<label>
									<span>End date</span>
									<input
										name="endDate"
										type="date"
										required
										min={todayDate}
										value={generateEndDate}
										aria-describedby="generate-date-help"
									/>
								</label>
								<button class="btn btn-primary" type="submit" disabled={!canGenerate || generatingPreview}>
									{generatingPreview ? 'Generating...' : 'Generate preview'}
								</button>
							</form>
							<p id="generate-date-help" class="field-help">
								Start date must be today or later, and the end date must be on or after the start date.
							</p>
						</aside>

						<div class="generate-main">
							{#if generatingPreview}
								<div class="preview-loading" aria-label="Generating Duty Roster preview">
									<SkeletonGrid rows={4} columns={3} />
								</div>
							{/if}

							{#if preview}
								<div class="run-header" aria-label="Generated preview summary">
									<div>
										<h3>Draft Preview</h3>
										<p>
											<span>Template <strong>{selectedTemplate.shortCode ?? selectedTemplate.name}</strong></span>
											<span>Range <strong>{preview.rosterRows.length} days</strong></span>
											<span>Pool <strong>{preview.da6.rows.length} eligible</strong></span>
										</p>
									</div>
									<div class="preview-output-actions" aria-label="Draft and official output actions">
										<Badge label="Draft preview" variant="outlined" />
										<button class="btn btn-secondary" type="button" onclick={() => printDraftPreview(preview)}>
											Print Draft
										</button>
										<form class="accept-preview-form" method="POST" action={acceptPreviewAction}>
											<input type="hidden" name="preview" value={previewFormValue(preview)} />
											<button class="btn btn-primary" type="submit">Accept Run</button>
										</form>
										<button
											class="btn btn-primary"
											type="button"
											disabled={acceptAndPrintPending}
											onclick={() => acceptAndPrintPreview(preview)}
										>
											{acceptAndPrintPending ? 'Accepting...' : 'Accept & Print'}
										</button>
										<form class="accept-preview-form" method="POST" action={applyPreviewAction}>
											<input type="hidden" name="preview" value={previewFormValue(preview)} />
											<button class="btn btn-primary btn-calendar" type="submit">Apply to Calendar</button>
										</form>
										{#if acceptAndPrintError}
											<p class="form-error inline-output-error" role="alert">{acceptAndPrintError}</p>
										{/if}
									</div>
								</div>

								<div class="view-switch" role="group" aria-label="Preview review mode">
									<button type="button" class:active={previewMode === 'list'} onclick={() => (previewMode = 'list')}>
										List
									</button>
									<button
										type="button"
										class:active={previewMode === 'matrix'}
										onclick={() => (previewMode = 'matrix')}
									>
										DA6 Matrix
									</button>
								</div>

								{#if actionForm?.manualError}
									<p class="form-error settings-error" role="alert">{actionForm.manualError}</p>
								{/if}

								{#if previewMode === 'list'}
									<section class="preview-table-shell" aria-labelledby="preview-list-heading">
										<h4 id="preview-list-heading" class="sr-only">Preview list</h4>
										<div class="preview-list" role="table" aria-label="Generated Duty Roster preview">
											<div class="preview-row preview-head" role="row">
												<span role="columnheader">Date</span>
												<span role="columnheader">Selected Soldier</span>
												<span role="columnheader">Source</span>
												<span role="columnheader">Manual change</span>
											</div>
											{#each preview.rosterRows as row (row.date)}
												{@const manualSelection = manualSelectionForDate(preview, row.date)}
												{@const finalAssignee = previewAssignee(preview, previewFinalAssigneeId(preview, row.date))}
												{@const generatedAssignee = previewAssignee(preview, row.assigneeId)}
												{@const editAssigneeId = previewEditAssigneeId(preview, row.date, row.assigneeId)}
												{@const liveWarnings = previewSelectionWarnings(preview, row.date, editAssigneeId)}
												{@const rowInEdit = Boolean(editingPreviewRows[row.date])}
												<div class="preview-row" role="row">
													<span role="cell">{row.date}</span>
													<div class="preview-selection" role="cell">
														{#if finalAssignee}
															<strong>{finalAssignee.rank} {finalAssignee.lastName}, {finalAssignee.firstName}</strong>
														{:else}
															{row.reason ?? 'No eligible Soldier'}
														{/if}
														{#if manualSelection && generatedAssignee}
															<small>
																Generated: {generatedAssignee.rank}
																{generatedAssignee.lastName}, {generatedAssignee.firstName}
															</small>
														{/if}
														{#if manualSelection?.warnings.length}
															<span
																class="issue-badge"
																role="button"
																tabindex="0"
																title={issueTitle(manualSelection.warnings)}
																aria-label={`Issue explanation: ${issueTitle(manualSelection.warnings)}`}
															>
																{issueLabel(manualSelection.warnings)}
															</span>
															<ul class="manual-warnings" aria-label={`Manual warnings for ${row.date}`}>
																{#each manualSelection.warnings as warning (warning.code)}
																	<li>{warning.message}</li>
																{/each}
															</ul>
														{/if}
														{#if manualSelection?.reason}
															<small>Reason: {manualSelection.reason}</small>
														{/if}
													</div>
													<span role="cell">
														{#if manualSelection}
															<Badge
																label="MANUAL"
																color="var(--color-warning-bg)"
																textColor="var(--color-warning-text)"
															/>
														{:else}
															<Badge label="Generated" variant="outlined" />
														{/if}
													</span>
													<div role="cell">
														{#if !rowInEdit}
															<button
																class="btn btn-secondary btn-sm"
																type="button"
																onclick={() => {
																	editingPreviewRows = { ...editingPreviewRows, [row.date]: true };
																	selectedPreviewAssignees = {
																		...selectedPreviewAssignees,
																		[row.date]: previewFinalAssigneeId(preview, row.date) ?? row.assigneeId ?? ''
																	};
																}}
															>
																Change
															</button>
														{:else}
															<form class="manual-preview-form" method="POST" action={manualPreviewAction}>
																<input type="hidden" name="preview" value={previewFormValue(preview)} />
																<input type="hidden" name="date" value={row.date} />
																<input
																	type="hidden"
																	name="startDate"
																	value={actionForm?.generateValues?.startDate ?? ''}
																/>
																<input type="hidden" name="endDate" value={actionForm?.generateValues?.endDate ?? ''} />
																<input type="hidden" name="assigneeId" value={editAssigneeId} />
																<label>
																	<span>Soldier</span>
																	<SearchSelect
																		options={personnelOptionItems(preview.selectionPersonnel)}
																		value={editAssigneeId}
																		ariaLabel={`Select Soldier for ${row.date}`}
																		placeholder="Search Soldier"
																		clearable={false}
																		compact
																		onchange={(value) => {
																			selectedPreviewAssignees = { ...selectedPreviewAssignees, [row.date]: value };
																		}}
																	/>
																</label>
																{#if liveWarnings.length > 0}
																	<label>
																		<span>Reason</span>
																		<input
																			name="reason"
																			type="text"
																			value={manualSelection?.reason ?? ''}
																			placeholder="Required for flagged changes"
																			required
																		/>
																	</label>
																{:else}
																	<input type="hidden" name="reason" value="" />
																{/if}
																<div class="inline-edit-actions">
																	<button class="btn btn-primary btn-sm" type="submit">Save</button>
																	<button
																		class="btn btn-secondary btn-sm"
																		type="button"
																		onclick={() => (editingPreviewRows = { ...editingPreviewRows, [row.date]: false })}
																	>
																		Cancel
																	</button>
																</div>
																{#if liveWarnings.length > 0}
																	<div class="issue-explain" role="status">
																		{#each liveWarnings as warning (warning)}
																			<span>{warning}</span>
																		{/each}
																	</div>
																{/if}
															</form>
														{/if}
													</div>
												</div>
											{/each}
										</div>
									</section>
								{/if}

								{#if previewMode === 'matrix'}
									<section aria-labelledby="preview-matrix-heading">
										<h4 id="preview-matrix-heading" class="sr-only">DA6 matrix</h4>
										<div class="matrix-scroll">
											<table class="da6-matrix" aria-label="DA6 preview matrix">
												<thead>
													<tr>
														<th scope="col">Soldier</th>
														{#each preview.da6.columns as column (column.date)}
															<th scope="col">{column.date}</th>
														{/each}
													</tr>
												</thead>
												<tbody>
													{#each preview.da6.rows as row (row.personnelId)}
														<tr>
															<th scope="row">{row.display.rank} {row.display.lastName}</th>
															{#each row.cells as cell (cell.date)}
																<td class:assigned={cell.assigned}>{previewCellDisplay(cell)}</td>
															{/each}
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									</section>
								{/if}
							{:else}
								<div class="run-header">
									<div>
										<h3>Draft Preview</h3>
										<p>
											<span>Template <strong>{selectedTemplate.shortCode ?? selectedTemplate.name}</strong></span>
											<span>Range <strong>{generateStartDate} to {generateEndDate}</strong></span>
											<span>Pool <strong>{countReadModel?.rows.length ?? 0} eligible</strong></span>
										</p>
									</div>
									<button
										class="btn btn-primary"
										type="submit"
										form="generate-preview-form"
										disabled={!canGenerate || generatingPreview}
									>
										{generatingPreview ? 'Generating...' : 'Generate preview'}
									</button>
								</div>
								<div class="pre-preview-state preview-table-shell" aria-label="Generate preview required">
									<table class="empty-preview-table">
										<thead>
											<tr>
												<th>Date range</th>
												<th>Pool</th>
												<th>Count source</th>
												<th>Action</th>
											</tr>
										</thead>
										<tbody>
											<tr>
												<td>{generateStartDate} to {generateEndDate}</td>
												<td>{countReadModel?.rows.length ?? 0} Soldiers in current count model</td>
												<td>{countReadModel?.sourceLabel ?? 'DA6 roster order'}</td>
												<td>Generate Preview</td>
											</tr>
										</tbody>
									</table>
									<EmptyState
										message="No draft exists yet. Confirm the date range, then generate a preview."
										actionLabel="Generate Preview"
									/>
								</div>
							{/if}
						</div>
					</div>
				{:else if selectedView === 'history'}
					<p class="eyebrow">History View</p>
					<h3 id="template-view-heading">Accepted runs</h3>
					<p>
						Accepted Duty Roster Runs are official history. List review shows generated versus manual rows; the matrix
						renders from the saved snapshot.
					</p>
					{#if actionForm?.applyError}
						<p class="form-error settings-error" role="alert">{actionForm.applyError}</p>
					{/if}
					{#if actionForm?.invalidateError}
						<p class="form-error settings-error" role="alert">{actionForm.invalidateError}</p>
					{/if}
					{#if actionForm?.correctionError}
						<p class="form-error settings-error" role="alert">{actionForm.correctionError}</p>
					{/if}
					{#if acceptedRuns.length === 0}
						<div class="empty-history">History is empty until a DA6 run is accepted.</div>
					{:else}
						{#if historyDetailRun}
							<div class="history-detail-banner">
								<a class="btn btn-secondary btn-sm" href={`${basePath}/${selectedTemplate.slug}/history`}>
									Back to History
								</a>
								<div class="view-switch" role="group" aria-label="History detail review mode">
									<a class:active={historyMode === 'list'} href={historyDetailHref(historyDetailRun, 'roster')}>
										Roster
									</a>
									<a class:active={historyMode === 'matrix'} href={historyDetailHref(historyDetailRun, 'da6')}>
										DA6 Matrix
									</a>
								</div>
							</div>
						{/if}
						<div class="history-list">
							{#each historyDetailRun ? [historyDetailRun] : acceptedRuns as run (run.id)}
								{@const snapshot = acceptedSnapshot(run)}
								{@const isInvalidated = run.status === 'invalidated'}
								{@const canInvalidateRun = !isInvalidated && run.id === latestHistoryRunId}
								{@const calendarState = calendarActionState(run)}
								<div class="history-run" aria-label={`${run.templateName} accepted run`}>
									<div
										class="history-run__header"
										onclick={() => !historyDetailRun && toggleHistoryRun(run.id)}
										role={historyDetailRun ? undefined : 'button'}
										tabindex={historyDetailRun ? undefined : 0}
									>
										<div>
											<h4>
												Run {run.startDate} to {run.endDate}
												{#if !isInvalidated && calendarState === 'applied'}
													<span class="applied-badge">Applied</span>
												{/if}
											</h4>
											<p>{run.startDate} to {run.endDate}</p>
										</div>
										<div class="accepted-output-actions">
											<span class:official-badge={!isInvalidated} class:invalidated-badge={isInvalidated}>
												{isInvalidated ? 'Invalidated' : 'Official'}
											</span>
											{#if !isInvalidated && calendarState === 'apply'}
												<span class="apply-later-badge">Not applied</span>
											{:else if !isInvalidated && calendarState === 'reapply'}
												<span class="apply-later-badge">Calendar needs sync</span>
											{/if}
											{#if !isInvalidated}
												<a class="btn btn-secondary btn-sm" href={historyDetailHref(run, 'roster')}> View Roster </a>
												<a class="btn btn-secondary btn-sm" href={historyDetailHref(run, 'da6')}> View DA6 </a>
												<button class="btn btn-secondary btn-sm" type="button" onclick={() => printAcceptedRun(run)}>
													Print Roster
												</button>
												<button class="btn btn-secondary btn-sm" type="button" onclick={() => printAcceptedRun(run)}>
													Print DA6
												</button>
											{/if}
											{#if !isInvalidated && calendarState !== 'applied'}
												<form class="accept-preview-form" method="POST" action={applyAcceptedRunAction}>
													<input type="hidden" name="runId" value={run.id} />
													<button class="btn btn-primary btn-sm" type="submit">
														{calendarState === 'reapply' ? 'Re-apply to Calendar' : 'Apply to Calendar'}
													</button>
												</form>
											{/if}
											{#if canInvalidateRun}
												<form
													class="accept-preview-form"
													method="POST"
													action={invalidateAcceptedRunAction}
													onsubmit={confirmRunInvalidation}
												>
													<input type="hidden" name="runId" value={run.id} />
													<button class="btn btn-danger btn-sm" type="submit">Invalidate run</button>
												</form>
											{:else if !isInvalidated}
												<span class="locked-history-note">Only latest run can be invalidated.</span>
											{/if}
										</div>
									</div>
									{#if historyDetailRun || expandedHistoryRuns[run.id]}
										{#if run.calendarAssignmentsEdited && !isInvalidated}
											<p class="history-warning">
												Calendar assignments linked to this run changed after apply. Re-applying may overwrite linked
												Calendar assignments, and invalidation will remove the run footprint after confirmation.
											</p>
										{/if}

										{#if historyDetailRun || historyMode === 'list'}
											<div class="preview-list" role="table" aria-label="Accepted Duty Roster list">
												<div class="preview-row preview-head" role="row">
													<span role="columnheader">Date</span>
													<span role="columnheader">Assigned Soldier</span>
													<span role="columnheader">Source</span>
													<span role="columnheader">Review state</span>
												</div>
												{#each snapshot.finalRows as row (row.date)}
													{@const correction = latestCorrectionForDate(run, row.date)}
													<div class="preview-row" role="row">
														<span role="cell">{row.date}</span>
														<div class="preview-selection" role="cell">
															{#if row.finalDisplay}
																<strong
																	>{row.finalDisplay.rank}
																	{row.finalDisplay.lastName}, {row.finalDisplay.firstName}</strong
																>
															{:else}
																Unfilled
															{/if}
															{#if row.assignmentSource === 'manual' && row.generatedDisplay}
																<small>
																	Generated: {row.generatedDisplay.rank}
																	{row.generatedDisplay.lastName}, {row.generatedDisplay.firstName}
																</small>
															{/if}
															{#if correction?.replacementDisplay}
																<small>
																	Actual: {correction.replacementDisplay.rank}
																	{correction.replacementDisplay.lastName}, {correction.replacementDisplay.firstName}
																</small>
															{/if}
														</div>
														<span role="cell">
															{#if correction}
																<Badge label="CORRECTED" variant="outlined" />
															{:else if row.assignmentSource === 'manual'}
																<Badge
																	label="MANUAL"
																	color="var(--color-warning-bg)"
																	textColor="var(--color-warning-text)"
																/>
															{:else}
																<Badge label="Generated" variant="outlined" />
															{/if}
														</span>
														<div class="preview-selection" role="cell">
															{#if correction}
																<div class="correction-summary">
																	<strong>Correction</strong>
																	<small>
																		{correctionPersonName(
																			correction.replacementDisplay,
																			correction.replacementAssigneeId
																		)}
																		performed duty for
																		{correctionPersonName(correction.originalDisplay, correction.originalAssigneeId)}.
																	</small>
																	<small>Reason: {correction.reason}</small>
																	<small
																		>{correction.countsTowardFuture
																			? 'Counts toward future DA6 runs.'
																			: 'Non-counting because this run is invalidated.'}</small
																	>
																</div>
															{/if}
															{#if row.warnings.length}
																<span
																	class="issue-badge"
																	role="button"
																	tabindex="0"
																	title={issueTitle(row.warnings)}
																	aria-label={`Issue explanation: ${issueTitle(row.warnings)}`}
																>
																	{issueLabel(row.warnings)}
																</span>
																<ul class="manual-warnings" aria-label={`Accepted warnings for ${row.date}`}>
																	{#each row.warnings as warning (warning.code)}
																		<li>{warning.message}</li>
																	{/each}
																</ul>
															{:else}
																<small>No warnings</small>
															{/if}
															{#if row.reason}
																<small>Reason: {row.reason}</small>
															{/if}
															{#if !isInvalidated && row.finalAssigneeId && historyDetailRun && !isCorrectionOpen(run.id, row.date)}
																<button
																	class="btn btn-secondary btn-sm"
																	type="button"
																	onclick={() =>
																		(editingCorrections = {
																			...editingCorrections,
																			[correctionKey(run.id, row.date)]: true
																		})}
																>
																	Record correction
																</button>
															{:else if !isInvalidated && row.finalAssigneeId && historyDetailRun}
																<form class="correction-form" method="POST" action={correctAcceptedRunAction}>
																	<input type="hidden" name="runId" value={run.id} />
																	<input type="hidden" name="runRowDate" value={row.date} />
																	<input
																		type="hidden"
																		name="replacementAssigneeId"
																		value={selectedCorrectionAssigneeId(run.id, row.date)}
																	/>
																	<label>
																		<span>Actual Soldier</span>
																		<SearchSelect
																			options={personnelOptionItems(snapshot.selectionPersonnel, row.finalAssigneeId)}
																			value={selectedCorrectionAssigneeId(run.id, row.date)}
																			ariaLabel={`Actual Soldier for ${row.date}`}
																			placeholder="Search Soldier"
																			clearable={false}
																			compact
																			onchange={(value) => {
																				selectedCorrectionAssignees = {
																					...selectedCorrectionAssignees,
																					[correctionKey(run.id, row.date)]: value
																				};
																			}}
																		/>
																	</label>
																	<label>
																		<span>Reason</span>
																		<input name="reason" placeholder="Reason for correction" required />
																	</label>
																	<div class="inline-edit-actions">
																		<button class="btn btn-primary btn-sm" type="submit">Save</button>
																		<button
																			class="btn btn-secondary btn-sm"
																			type="button"
																			onclick={() =>
																				(editingCorrections = {
																					...editingCorrections,
																					[correctionKey(run.id, row.date)]: false
																				})}
																		>
																			Cancel
																		</button>
																	</div>
																</form>
															{:else if isInvalidated && run.corrections.some((item) => item.runRowDate === row.date)}
																<small>Correction trail is locked with this invalidated run.</small>
															{/if}
														</div>
													</div>
												{/each}
											</div>
										{/if}

										{#if historyDetailRun && historyMode === 'matrix'}
											<div class="matrix-scroll">
												<table class="da6-matrix" aria-label="Accepted DA6 matrix">
													<thead>
														<tr>
															<th scope="col">Soldier</th>
															{#each snapshot.da6.columns as column (column.date)}
																<th scope="col">{column.date}</th>
															{/each}
														</tr>
													</thead>
													<tbody>
														{#each snapshot.da6.rows as row (row.personnelId)}
															<tr>
																<th scope="row">{row.display.rank} {row.display.lastName}</th>
																{#each row.cells as cell (cell.date)}
																	<td class:assigned={cell.assigned}>{acceptedCellDisplay(cell)}</td>
																{/each}
															</tr>
														{/each}
													</tbody>
												</table>
											</div>
										{/if}
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<h2 id="template-view-heading" class="sr-only">Duty Roster Template settings</h2>
					{#if actionForm?.settingsError}
						<p class="form-error settings-error" role="alert">{actionForm.settingsError}</p>
					{/if}

					{#if data.settings}
						<form class="settings-form settings-form--ledger" method="POST" action={settingsAction}>
							<input type="hidden" name="templateId" value={selectedTemplate.id} />

							<div class="settings-layout settings-layout--ledger">
								<nav class="settings-nav settings-nav--ledger" aria-label="Template settings sections">
									<button
										type="button"
										class:active={settingsSection === 'general'}
										aria-pressed={settingsSection === 'general'}
										onclick={() => (settingsSection = 'general')}
									>
										General
									</button>
									<button
										type="button"
										class:active={settingsSection === 'pool'}
										aria-pressed={settingsSection === 'pool'}
										onclick={() => (settingsSection = 'pool')}
									>
										Pool & Filters
									</button>
									<button
										type="button"
										class:active={settingsSection === 'exemptions'}
										aria-pressed={settingsSection === 'exemptions'}
										onclick={() => (settingsSection = 'exemptions')}
									>
										Exemptions
									</button>
									<button
										type="button"
										class:active={settingsSection === 'baseline'}
										aria-pressed={settingsSection === 'baseline'}
										onclick={() => (settingsSection = 'baseline')}
									>
										DA6 Baseline
									</button>
								</nav>

								<div class="settings-panel settings-panel--ledger">
									{#if settingsSection === 'general'}
										<section
											class="settings-section settings-section--general"
											aria-labelledby="template-identity-heading"
										>
											<h4 id="template-identity-heading">General settings</h4>
											<div class="identity-grid identity-grid--ledger">
												<label>
													<span>Template name</span>
													<input name="name" maxlength="120" required bind:value={settingsName} />
												</label>
												<label>
													<span>URL slug</span>
													<input name="slug" maxlength="72" required bind:value={settingsSlug} />
													<small>Scoped to organization. Must be unique.</small>
												</label>
												<label class="short-code-field">
													<span>Short code</span>
													<input name="shortCode" maxlength="12" bind:value={settingsShortCode} placeholder="CQ" />
													<small>Used for compact calendar badges. Can repeat across templates.</small>
												</label>
											</div>
										</section>
									{:else}
										<input type="hidden" name="name" value={settingsName} />
										<input type="hidden" name="slug" value={settingsSlug} />
										<input type="hidden" name="shortCode" value={settingsShortCode} />
									{/if}

									{#if settingsSection === 'pool'}
										<section class="settings-section" aria-labelledby="pool-criteria-heading">
											<h4 id="pool-criteria-heading">Pool & filters</h4>
											<p class="field-help">
												Selections match any value inside a category, then combine across categories. For example, SGT
												or CPL, and Alpha Group.
											</p>
											<div class="criteria-grid">
												<label class="tag-field">
													<span>Rank</span>
													<MultiTagSelect
														options={optionItems(rankOptions)}
														value={rankFilterValues}
														ariaLabel="Rank filters"
														placeholder="Any rank"
														onChange={(values) => (rankFilterValues = values)}
													/>
												</label>
												<label class="tag-field">
													<span>Group</span>
													<MultiTagSelect
														options={groupOptionItems(groupOptions)}
														value={groupFilterValues}
														ariaLabel="Group filters"
														placeholder="Any group"
														onChange={(values) => (groupFilterValues = values)}
													/>
												</label>
												<label class="tag-field">
													<span>MOS</span>
													<MultiTagSelect
														options={optionItems(mosOptions)}
														value={mosFilterValues}
														ariaLabel="MOS filters"
														placeholder="Any MOS"
														onChange={(values) => (mosFilterValues = values)}
													/>
												</label>
												<label class="tag-field">
													<span>Duty Role</span>
													<MultiTagSelect
														options={optionItems(dutyRoleOptions)}
														value={dutyRoleFilterValues}
														ariaLabel="Duty role filters"
														placeholder="Any role"
														onChange={(values) => (dutyRoleFilterValues = values)}
													/>
												</label>
											</div>
										</section>
									{/if}
									{#each rankFilterValues as value (value)}
										<input type="hidden" name="rankValues" {value} />
									{/each}
									{#each groupFilterValues as value (value)}
										<input type="hidden" name="groupIds" {value} />
									{/each}
									{#each mosFilterValues as value (value)}
										<input type="hidden" name="mosValues" {value} />
									{/each}
									{#each dutyRoleFilterValues as value (value)}
										<input type="hidden" name="dutyRoleValues" {value} />
									{/each}

									{#if settingsSection === 'exemptions'}
										<section class="settings-section" aria-labelledby="pool-preview-heading">
											<h4 id="pool-preview-heading">Exemptions</h4>
											{#if data.settings.resolvedPool.length === 0}
												<div class="empty-history">No active Personnel Records match the current pool criteria.</div>
											{:else}
												<div class="pool-table" role="table" aria-label="Resolved Duty Roster pool">
													<div class="pool-row pool-head" role="row">
														<span role="columnheader">Soldier</span>
														<span role="columnheader">Group</span>
														<span role="columnheader">MOS</span>
														<span role="columnheader">Exempt</span>
													</div>
													{#each data.settings.resolvedPool as person (person.id)}
														<div class="pool-row" role="row">
															<span role="cell">{person.rank} {person.lastName}, {person.firstName}</span>
															<span role="cell">{person.groupName || 'No Group'}</span>
															<span role="cell">{person.mos || 'No MOS'}</span>
															<span role="cell">
																<label class="row-check">
																	<input
																		type="checkbox"
																		name="exemptPersonnelIds"
																		value={person.id}
																		checked={settingsExemptPersonnelIds.includes(person.id)}
																		onchange={(event) => {
																			const checked = event.currentTarget.checked;
																			settingsExemptPersonnelIds = checked
																				? [...settingsExemptPersonnelIds, person.id]
																				: settingsExemptPersonnelIds.filter((id) => id !== person.id);
																		}}
																	/>
																	<span>Exempt</span>
																</label>
															</span>
														</div>
													{/each}
												</div>
											{/if}
										</section>
									{:else}
										{#each settingsExemptPersonnelIds as value (value)}
											<input type="hidden" name="exemptPersonnelIds" {value} />
										{/each}
									{/if}

									{#if settingsSection === 'baseline'}
										<section class="settings-section" aria-labelledby="baseline-heading">
											<h4 id="baseline-heading">DA6 Baseline</h4>
											<p>
												Counts are optional and apply only until the first accepted run for this template. Leave blank
												to start from DA6 roster order.
											</p>
											{#if baselineLocked}
												<p class="baseline-lock">
													Manual DA6 Baseline is locked because this template has accepted history. Future previews use
													accepted runs for DA6 continuity.
												</p>
											{/if}
											{#if data.settings.baselineRows.length === 0}
												<div class="empty-history">
													No baseline rows are available until the non-exempt pool has members.
												</div>
											{:else}
												<div class="baseline-list">
													{#each data.settings.baselineRows as row (row.personnel.id)}
														<label>
															<span>{row.personnel.rank} {row.personnel.lastName}, {row.personnel.firstName}</span>
															<input
																type="number"
																min="0"
																step="1"
																name={`baseline:${row.personnel.id}`}
																value={settingsBaselineCounts[row.personnel.id] ?? ''}
																placeholder="Count"
																readonly={baselineLocked}
																oninput={(event) => {
																	settingsBaselineCounts = {
																		...settingsBaselineCounts,
																		[row.personnel.id]: event.currentTarget.value
																	};
																}}
															/>
														</label>
													{/each}
												</div>
											{/if}
										</section>
									{:else}
										{#each data.settings.baselineRows as row (row.personnel.id)}
											<input
												type="hidden"
												name={`baseline:${row.personnel.id}`}
												value={settingsBaselineCounts[row.personnel.id] ?? ''}
											/>
										{/each}
									{/if}

									<div class="settings-actions">
										<a class="btn btn-secondary" href={`${basePath}/${selectedTemplate.slug}/generate`}>Cancel</a>
										<button class="btn btn-primary" type="submit">Save settings</button>
									</div>
								</div>
							</div>
						</form>
					{:else}
						<div class="empty-history">Loading template settings...</div>
					{/if}
				{/if}
			</main>
		</div>
	{/if}
</section>

<style>
	.duty-roster-workspace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		padding: var(--sp-5);
		color: var(--text-primary);
		max-width: 1400px;
	}

	.workspace-header,
	.template-title-row,
	.template-detail-header {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		margin-bottom: var(--sp-5);
	}

	.workspace-header h1,
	.template-detail-header h1,
	.template-title-row h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 3vw, 2.25rem);
		line-height: 1.05;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.eyebrow {
		margin: 0 0 var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.summary {
		margin: var(--sp-1) 0 0;
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--text-secondary);
		max-width: 68ch;
	}

	.header-status {
		display: grid;
		gap: 2px;
		justify-items: end;
		min-width: 8rem;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.header-status span {
		color: var(--text-primary);
		font-size: 1.8rem;
		font-weight: 800;
		line-height: 1;
	}

	.header-status p {
		margin: 0;
	}

	/* Template Register */
	.template-register,
	.new-template-workspace {
		display: grid;
		gap: var(--sp-5);
	}

	.template-register__header {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		margin-bottom: var(--sp-1);
	}

	.template-register__header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 3vw, 2.25rem);
		line-height: 1.05;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.template-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--sp-4);
	}

	.template-card {
		background: var(--surface-panel);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		cursor: pointer;
		transition:
			box-shadow var(--transition-normal),
			border-color var(--transition-normal);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.template-card:hover {
		box-shadow: var(--shadow-md);
		border-color: var(--ink-35);
	}

	.template-card__main {
		color: inherit;
		text-decoration: none;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		flex: 1;
	}

	.template-card__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.template-card__name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1875rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		line-height: 1.1;
	}

	.template-card__slug {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--text-tertiary);
		letter-spacing: 0.08em;
	}

	.template-card__meta {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		flex-wrap: wrap;
	}

	.template-meta-item {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--text-secondary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.template-meta-item strong {
		color: var(--text-primary);
		font-weight: 600;
	}

	.template-card__actions {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		flex-wrap: wrap;
		border-top: 1px solid var(--ink-15);
		padding-top: var(--sp-3);
	}

	.template-card__action {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
		text-decoration: none;
	}

	.template-card__action:hover {
		color: var(--text-primary);
		text-decoration: underline;
	}

	/* View Tabs */
	.view-tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--ink-15);
		margin-bottom: var(--sp-5);
	}

	.view-tabs a {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 3.75rem;
		padding: var(--sp-3) var(--sp-5);
		border: 1px solid transparent;
		border-bottom: 2px solid transparent;
		border-radius: var(--radius-md) var(--radius-md) 0 0;
		background: transparent;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		text-decoration: none;
		cursor: pointer;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast);
		margin-bottom: -1px;
	}

	.view-tabs a:hover {
		color: var(--text-primary);
	}

	.view-tabs a.active {
		color: var(--amber);
		border-color: color-mix(in srgb, var(--amber) 44%, var(--ink-15) 56%);
		border-bottom-color: var(--amber);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--amber-light) 8%);
	}

	.view-tabs small {
		display: none;
	}

	.view-panel {
		display: grid;
		gap: var(--sp-4);
	}

	.template-detail-workspace:has(.settings-form--ledger) .view-tabs {
		margin-bottom: var(--sp-5);
	}

	/* Generate Workspace */
	.generate-workspace {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: var(--sp-5);
		align-items: start;
	}

	.setup-rail {
		background: var(--surface-panel);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		position: sticky;
		top: 76px;
	}

	.setup-rail__section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.setup-rail__label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		margin: 0;
	}

	.setup-rail__value {
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
		margin: 0;
	}

	.setup-rail__helper {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0;
	}

	.pool-summary {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.pool-summary__row {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.pool-summary__row strong {
		color: var(--text-primary);
		font-weight: 600;
	}

	.generate-form {
		display: flex;
		gap: var(--sp-2);
		flex-direction: column;
	}

	.generate-form label {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.generate-form input {
		min-height: 2.45rem;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-primary);
		font: inherit;
		padding: 0 var(--sp-2);
	}

	/* Run Header */
	.run-header {
		background: var(--surface-panel);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-lg);
		padding: var(--sp-4) var(--sp-5);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
	}

	.run-header__copy {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.run-header__title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1875rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.run-header__meta {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}

	.run-header__meta-item {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.run-header__meta-item .highlight {
		color: var(--text-primary);
		font-weight: 600;
	}

	.run-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		align-items: center;
	}

	/* State Bands */
	.state-band {
		padding: 10px 16px;
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.state-band--draft {
		background: var(--info-bg);
		color: var(--info);
		border: 1px solid color-mix(in srgb, var(--info) 20%, transparent);
	}

	.state-band--applied {
		background: var(--success-bg);
		color: var(--success);
		border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
	}

	.state-band--stale {
		background: var(--amber-light);
		color: var(--amber-dark);
		border: 1px solid color-mix(in srgb, var(--amber) 20%, transparent);
	}

	/* View Toggle */
	.view-switch {
		display: inline-flex;
		gap: 0;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		margin-bottom: var(--sp-4);
	}

	.view-switch button,
	.view-switch a {
		padding: 8px 16px;
		border: none;
		border-right: 1px solid var(--ink-15);
		background: transparent;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
		text-decoration: none;
	}

	.view-switch button:last-child,
	.view-switch a:last-child {
		border-right: none;
	}

	.view-switch button:hover,
	.view-switch a:hover {
		color: var(--text-primary);
	}

	.view-switch button.active,
	.view-switch a.active {
		background: var(--surface-panel);
		color: var(--text-primary);
	}

	/* Preview Table */
	.preview-table-shell {
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		overflow-x: auto;
	}

	.preview-table {
		width: 100%;
		border-collapse: collapse;
		min-width: 760px;
	}

	.preview-table th,
	.preview-table td {
		padding: 0.75rem 1rem;
		text-align: left;
		border-bottom: 1px solid var(--ink-06);
		vertical-align: middle;
	}

	.preview-table th {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
	}

	.preview-table td {
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.preview-table tbody tr:last-child td {
		border-bottom: none;
	}

	.preview-table tbody tr:hover {
		background: color-mix(in srgb, var(--surface-subtle) 62%, var(--surface-panel) 38%);
	}

	.preview-table .cell-date {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.preview-table .cell-soldier {
		font-weight: 600;
	}

	.preview-table .cell-soldier .original {
		font-size: 0.6875rem;
		color: var(--text-tertiary);
		font-weight: 400;
		display: block;
	}

	.preview-table .cell-actions {
		display: flex;
		gap: 4px;
	}

	/* Preview list (div-based, for test compatibility) */
	.preview-list {
		display: grid;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--surface-panel);
	}

	.preview-row {
		display: grid;
		grid-template-columns: minmax(7rem, 0.45fr) minmax(14rem, 1fr) minmax(7rem, 0.45fr) minmax(18rem, 1.3fr);
		gap: var(--sp-3);
		align-items: start;
		padding: var(--sp-2) var(--sp-3);
		border-top: 1px solid var(--ink-06);
	}

	.preview-row:first-child {
		border-top: 0;
	}

	.preview-head {
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		align-items: center;
	}

	.preview-selection {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.preview-selection strong {
		color: var(--text-primary);
		font-weight: 600;
	}

	.preview-selection small {
		color: var(--text-tertiary);
		font-size: 0.75rem;
		line-height: 1.35;
	}

	/* DA6 Matrix */
	.matrix-scroll {
		overflow-x: auto;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.da6-matrix {
		border-collapse: collapse;
		min-width: 100%;
	}

	.da6-matrix th,
	.da6-matrix td {
		border: 1px solid var(--ink-15);
		padding: 6px 8px;
		text-align: center;
		font-size: 0.75rem;
		min-width: 40px;
	}

	.da6-matrix thead th {
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.da6-matrix tbody th {
		text-align: left;
		font-weight: 600;
		background: var(--surface-panel);
		position: sticky;
		left: 0;
		z-index: 5;
		min-width: 180px;
	}

	.da6-matrix .cell-seq {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--text-primary);
	}

	.da6-matrix .cell-a {
		background: var(--info-bg);
		color: var(--info);
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.da6-matrix .cell-d {
		background: var(--amber-light);
		color: var(--amber-dark);
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.da6-matrix .cell-u {
		background: var(--danger-bg);
		color: var(--danger);
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.da6-matrix .cell-duty {
		background: color-mix(in srgb, var(--success-bg) 60%, transparent);
		color: var(--success);
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.da6-matrix .cell-weekend {
		background: var(--surface-subtle);
	}

	/* History */
	.history-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.history-run {
		background: var(--surface-panel);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.history-run__header {
		padding: var(--sp-4) var(--sp-5);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		flex-wrap: wrap;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.history-run__header:hover {
		background: color-mix(in srgb, var(--surface-subtle) 40%, var(--surface-panel) 60%);
	}

	.history-run__copy {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.history-run__title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.history-run__meta {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}

	.history-run__meta-item {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.history-run__meta-item .highlight {
		color: var(--text-primary);
		font-weight: 600;
	}

	.history-run__body {
		border-top: 1px solid var(--ink-06);
		padding: var(--sp-4) var(--sp-5);
	}

	.history-run__actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		align-items: center;
		margin-bottom: var(--sp-4);
	}

	.history-run__section-title {
		margin: 0 0 var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	/* Corrections */
	.correction-card {
		background: var(--surface-subtle);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		padding: var(--sp-3) var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.correction-card__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.correction-card__title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.correction-card__body {
		font-size: var(--text-sm);
		color: var(--text-primary);
		line-height: 1.5;
	}

	.correction-card__body .swap-from {
		color: var(--text-tertiary);
		text-decoration: line-through;
	}

	.correction-card__body .swap-to {
		font-weight: 600;
	}

	/* Settings */
	.settings-layout {
		display: grid;
		grid-template-columns: 260px 1fr;
		gap: var(--sp-6);
		align-items: start;
	}

	.settings-nav {
		position: sticky;
		top: 76px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.settings-nav button {
		padding: 10px 14px;
		border-radius: var(--radius-md);
		border: none;
		background: transparent;
		text-align: left;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
	}

	.settings-nav button:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.settings-nav button.active {
		background: var(--surface-panel);
		color: var(--text-primary);
		box-shadow: inset 2px 0 0 var(--amber);
	}

	.settings-panels {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.settings-panel {
		background: var(--surface-panel);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-lg);
		padding: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.settings-panel__title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1875rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.settings-group {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.settings-group__label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-secondary);
		margin: 0;
	}

	.pool-filters {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--sp-3);
	}

	.filter-chip {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 8px 12px;
		background: var(--surface-subtle);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.filter-chip .filter-key {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	/* Exemption list */
	.exemption-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.exemption-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		background: var(--surface-subtle);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
	}

	.exemption-row__name {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-primary);
	}

	.exemption-row__meta {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		letter-spacing: 0.08em;
	}

	/* Baseline table */
	.baseline-table {
		width: 100%;
		border-collapse: collapse;
	}

	.baseline-table th,
	.baseline-table td {
		padding: 10px 12px;
		text-align: left;
		border-bottom: 1px solid var(--ink-06);
		font-size: var(--text-sm);
	}

	.baseline-table th {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
	}

	.baseline-table td {
		color: var(--text-primary);
	}

	.baseline-table input[type='number'] {
		width: 80px;
		padding: 6px 8px;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	/* Misc */
	.empty-register,
	.empty-history {
		border: 1px dashed var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		padding: var(--sp-6);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.empty-title {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-display);
		font-size: 1.1875rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.form-error {
		margin: 0;
		border: 1px solid var(--danger);
		border-radius: var(--radius-md);
		background: var(--danger-bg);
		color: var(--danger);
		padding: var(--sp-2) var(--sp-3);
		font-size: var(--text-sm);
	}

	.field-help {
		margin: var(--sp-2) 0 0;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1.45;
	}

	/* Badges */
	.issue-badge {
		display: inline-flex;
		width: fit-content;
		border: 1px solid var(--color-warning-border, var(--ink-15));
		border-radius: var(--radius-pill);
		background: var(--color-warning-bg, var(--amber-light));
		color: var(--color-warning-text, var(--amber-dark));
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0;
		padding: 2px var(--sp-2);
		text-transform: uppercase;
		cursor: help;
	}

	.manual-warnings {
		display: grid;
		gap: 4px;
		margin: 0;
		padding-left: var(--sp-4);
		color: var(--color-warning-text, var(--text-primary));
		font-size: 0.85rem;
		line-height: 1.35;
	}

	.issue-explain {
		display: grid;
		gap: 4px;
		grid-column: 1 / -1;
		border: 1px solid var(--color-warning-border, var(--ink-15));
		border-radius: var(--radius-md);
		background: var(--color-warning-bg, var(--amber-light));
		color: var(--color-warning-text, var(--amber-dark));
		padding: var(--sp-2);
		font-size: 0.85rem;
	}

	/* Inline edit forms */
	.manual-preview-form,
	.correction-form {
		display: grid;
		grid-template-columns: minmax(10rem, 1fr) minmax(10rem, 1fr) auto;
		gap: var(--sp-3);
		align-items: end;
	}

	.inline-edit-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}

	.manual-preview-form label,
	.correction-form label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
	}

	.manual-preview-form input,
	.correction-form input {
		min-height: 2.25rem;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		color: var(--text-primary);
		font: inherit;
		padding: 0 var(--sp-2);
	}

	.correction-summary {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		padding: var(--sp-2);
	}

	/* Count source panel */
	.count-source-panel {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
		border: 1px solid var(--amber);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		padding: var(--sp-4);
	}

	.count-source-panel span,
	.count-source-panel small {
		color: var(--text-tertiary);
	}

	.count-source-panel span {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
	}

	.count-source-panel strong {
		color: var(--text-primary);
	}

	.count-source-meta,
	.count-row-strip {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.count-source-meta span,
	.count-row-strip span {
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		padding: 0.35rem 0.5rem;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.count-row-strip span {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
	}

	/* Settings form */
	.settings-form {
		display: grid;
		gap: var(--sp-5);
	}

	.settings-form--ledger {
		gap: 0;
	}

	.settings-layout--ledger {
		grid-template-columns: minmax(12rem, 17rem) minmax(0, 1fr);
		gap: var(--sp-6);
		align-items: start;
	}

	.settings-nav--ledger {
		top: 88px;
		gap: var(--sp-2);
		padding-top: 0;
	}

	.settings-nav--ledger button {
		display: flex;
		min-height: 3.25rem;
		align-items: center;
		padding: 0 var(--sp-3);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		line-height: 1.2;
		text-align: left;
		text-transform: uppercase;
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.settings-nav--ledger button:hover {
		border-color: var(--ink-15);
		background: color-mix(in srgb, var(--surface-panel) 76%, var(--surface-subtle) 24%);
		color: var(--text-primary);
	}

	.settings-nav--ledger button.active {
		border-color: color-mix(in srgb, var(--amber) 38%, var(--ink-15) 62%);
		background: color-mix(in srgb, var(--surface-panel) 94%, var(--amber-light) 6%);
		box-shadow: none;
		color: var(--text-primary);
	}

	.settings-panel--ledger {
		gap: var(--sp-6);
		min-height: 36rem;
		padding: var(--sp-8);
		border-color: var(--ink-15);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.settings-section {
		background: var(--surface-panel);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.settings-panel--ledger .settings-section {
		padding: 0 0 var(--sp-6);
		border: 0;
		border-bottom: 1px solid var(--ink-06);
		border-radius: 0;
		background: transparent;
	}

	.settings-panel--ledger .settings-section:last-of-type {
		padding-bottom: 0;
		border-bottom: 0;
	}

	.settings-section--general {
		min-height: 28rem;
	}

	.settings-section h4 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.45rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.identity-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-3);
	}

	.identity-grid--ledger {
		grid-template-columns: minmax(0, 1fr);
		gap: var(--sp-6);
	}

	.criteria-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-3);
	}

	.tag-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-width: 0;
	}

	.tag-field > span {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
	}

	.settings-summary {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-3);
	}

	.settings-summary div {
		display: grid;
		gap: 4px;
		padding: var(--sp-3);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.settings-summary span {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
	}

	.settings-summary strong {
		color: var(--text-primary);
		font-size: 1.35rem;
		line-height: 1;
	}

	.identity-grid label {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-width: 0;
		color: var(--text-primary);
	}

	.identity-grid--ledger label {
		max-width: none;
	}

	.identity-grid span {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.identity-grid input {
		min-height: 2.5rem;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		color: var(--text-primary);
		padding: 0 var(--sp-3);
	}

	.identity-grid--ledger input {
		min-height: 4.25rem;
		background: color-mix(in srgb, var(--surface-panel) 96%, var(--surface-subtle) 4%);
		font-family: var(--font-serif);
		font-size: 1.25rem;
		line-height: 1.2;
	}

	.identity-grid--ledger .short-code-field input {
		width: min(11rem, 100%);
	}

	.identity-grid--ledger small {
		color: var(--text-tertiary);
		font-family: var(--font-serif);
		font-size: 1rem;
		line-height: 1.45;
	}

	.identity-grid input:focus-visible,
	.baseline-list input:focus-visible {
		border-color: var(--amber);
		outline: var(--focus-outline);
		outline-offset: 2px;
	}

	.row-check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		color: var(--text-primary);
	}

	.pool-table {
		display: grid;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--surface-panel);
	}

	.pool-row {
		display: grid;
		grid-template-columns: minmax(10rem, 1.3fr) minmax(7rem, 0.8fr) minmax(5rem, 0.5fr) minmax(6rem, 0.5fr);
		gap: var(--sp-3);
		align-items: center;
		padding: var(--sp-2) var(--sp-3);
		border-top: 1px solid var(--ink-06);
	}

	.pool-row:first-child {
		border-top: 0;
	}

	.pool-head {
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.baseline-list {
		display: grid;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--surface-panel);
	}

	.baseline-list label {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-2) var(--sp-3);
		border-top: 1px solid var(--ink-06);
		color: var(--text-primary);
	}

	.baseline-list label:first-child {
		border-top: 0;
	}

	.baseline-list input {
		width: 7rem;
		min-height: 2.25rem;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-primary);
		padding: 0 var(--sp-2);
	}

	.baseline-lock {
		margin: 0;
		border: 1px solid var(--amber);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		padding: var(--sp-2) var(--sp-3);
		font-size: var(--text-sm);
	}

	.settings-actions {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		justify-content: flex-end;
		padding-top: var(--sp-6);
	}

	/* Wizard */
	.wizard-form {
		margin-top: 0;
	}

	.wizard-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}

	/* History detail banner */
	.history-detail-banner {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-4);
	}

	/* Pre-preview */
	.pre-preview-state {
		margin-top: var(--sp-4);
	}

	.empty-preview-table {
		width: 100%;
		min-width: 42rem;
		border-collapse: collapse;
		background: var(--surface-panel);
	}

	.empty-preview-table th,
	.empty-preview-table td {
		border-bottom: 1px solid var(--ink-06);
		padding: var(--sp-3);
		text-align: left;
		font-size: var(--text-sm);
	}

	.empty-preview-table th {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
	}

	.preview-loading {
		margin-top: var(--sp-4);
	}

	/* Print / output actions */
	.preview-output-actions,
	.accepted-output-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		justify-content: flex-end;
	}

	.accept-preview-form {
		display: flex;
		justify-content: flex-end;
	}

	.inline-output-error {
		flex-basis: 100%;
	}

	/* History warning */
	.history-warning {
		margin: 0 0 var(--sp-3);
		border: 1px solid var(--amber);
		border-radius: var(--radius-md);
		background: var(--amber-light);
		color: var(--amber-dark);
		font-size: var(--text-sm);
		padding: var(--sp-2) var(--sp-3);
	}

	/* Official/invalidated badges */
	.official-badge,
	.applied-badge,
	.apply-later-badge,
	.invalidated-badge,
	.locked-history-note {
		display: inline-flex;
		width: fit-content;
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0;
		padding: 2px var(--sp-2);
		text-transform: uppercase;
	}

	.invalidated-badge {
		background: var(--danger-bg);
		color: var(--danger);
	}

	.applied-badge {
		background: var(--success-bg);
		color: var(--success);
	}

	.apply-later-badge {
		background: var(--surface-subtle);
		color: var(--text-secondary);
	}

	.locked-history-note {
		background: var(--surface-subtle);
		color: var(--text-tertiary);
	}

	/* Calendar button */
	.btn-calendar {
		background: var(--amber);
		color: var(--accent-contrast);
	}

	/* Responsive */
	@media (max-width: 1100px) {
		.generate-workspace {
			grid-template-columns: 1fr;
		}

		.settings-layout {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 900px) {
		.duty-roster-workspace {
			padding: var(--sp-3);
		}

		.workspace-header,
		.template-title-row,
		.template-detail-header,
		.run-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.header-status {
			justify-items: start;
		}

		.identity-grid,
		.criteria-grid,
		.settings-summary {
			grid-template-columns: 1fr;
		}

		.manual-preview-form,
		.correction-form {
			grid-template-columns: 1fr;
		}

		.pool-row,
		.preview-row {
			grid-template-columns: 1fr;
		}

		.setup-rail {
			position: static;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}
</style>
