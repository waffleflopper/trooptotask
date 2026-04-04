<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import DutyRosterGenerator from './DutyRosterGenerator.svelte';
	import { getLegacySimpleTemplates } from '../legacySimpleTemplates';
	import type { Personnel } from '$lib/types';
	import type { AvailabilityEntry, SpecialDay, StatusType } from '$lib/types';
	import type { AssignmentType, DailyAssignment } from '$lib/types';
	import type { RosterHistoryItem } from '../stores/dutyRosterHistory.svelte';
	import type {
		DutyEvent,
		DutyEventApplyInput,
		DutyEventPreview,
		DutyEventSeriesApplyResult,
		DutyEventSeriesInput,
		DutyEventSeriesPattern,
		DutyEventSeriesPreview,
		DutyTemplate
	} from '../duty-roster.types';

	interface Props {
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		personnelByGroup: { group: string; personnel: Personnel[] }[];
		groups: string[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		specialDays: SpecialDay[];
		rosterHistory: RosterHistoryItem[];
		advancedDutyTemplates: DutyTemplate[];
		advancedDutyEvents: DutyEvent[];
		onApplyRoster: (assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]) => Promise<boolean>;
		onSaveRoster: (payload: Omit<RosterHistoryItem, 'id' | 'createdAt'>) => Promise<RosterHistoryItem | null>;
		onDeleteRoster: (id: string) => Promise<void>;
		onUpdateExemptions: (assignmentTypeId: string, personnelIds: string[]) => Promise<void>;
		onPreviewAdvancedEvent: (input: DutyEventApplyInput) => Promise<DutyEventPreview | null>;
		onApplyAdvancedEvent: (input: DutyEventApplyInput) => Promise<DutyEvent | null>;
		onPreviewAdvancedSeries: (input: DutyEventSeriesInput) => Promise<DutyEventSeriesPreview | null>;
		onApplyAdvancedSeries: (input: DutyEventSeriesInput) => Promise<DutyEventSeriesApplyResult | null>;
		canManageAdvancedTemplates: boolean;
		onManageAdvancedTemplates: () => void;
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
		advancedDutyTemplates,
		advancedDutyEvents,
		onApplyRoster,
		onSaveRoster,
		onDeleteRoster,
		onUpdateExemptions,
		onPreviewAdvancedEvent,
		onApplyAdvancedEvent,
		onPreviewAdvancedSeries,
		onApplyAdvancedSeries,
		canManageAdvancedTemplates,
		onManageAdvancedTemplates
	}: Props = $props();

	type WizardView =
		| 'choose-lane'
		| 'simple-template-list'
		| 'simple-generator'
		| 'advanced-template-list'
		| 'advanced-generator';

	let view = $state<WizardView>('choose-lane');
	let selectedSimpleAssignmentTypeId = $state<string | null>(null);
	let selectedAdvancedTemplateId = $state<string | null>(null);
	let advancedStartDate = $state('');
	let advancedEndDate = $state('');
	let advancedPattern = $state<DutyEventSeriesPattern>('daily');
	let selectedWeekdays = $state<Set<number>>(new Set([1, 3, 5]));
	let customDateDraft = $state('');
	let customDateEntries = $state<string[]>([]);
	let advancedSeriesPreview = $state<DutyEventSeriesPreview | null>(null);
	let isPreviewingAdvancedSeries = $state(false);
	let isApplyingAdvancedSeries = $state(false);
	let appliedAdvancedEvents = $state<DutyEvent[]>([]);

	const weekdayOptions = [
		{ value: 0, label: 'Sunday' },
		{ value: 1, label: 'Monday' },
		{ value: 2, label: 'Tuesday' },
		{ value: 3, label: 'Wednesday' },
		{ value: 4, label: 'Thursday' },
		{ value: 5, label: 'Friday' },
		{ value: 6, label: 'Saturday' }
	];

	const simpleTemplates = $derived(getLegacySimpleTemplates(assignmentTypes));
	const selectedSimpleTemplate = $derived(
		simpleTemplates.find((template) => template.assignmentTypeId === selectedSimpleAssignmentTypeId) ?? null
	);
	const activeAdvancedTemplates = $derived(
		[...advancedDutyTemplates]
			.filter((template) => template.mode === 'advanced' && template.status === 'active')
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const selectedAdvancedTemplate = $derived(
		activeAdvancedTemplates.find((template) => template.id === selectedAdvancedTemplateId) ?? null
	);
	const personnelById = $derived.by(() => {
		const map = new Map<string, Personnel>();
		for (const group of personnelByGroup) {
			for (const person of group.personnel) {
				map.set(person.id, person);
			}
		}
		return map;
	});

	$effect(() => {
		appliedAdvancedEvents = [...advancedDutyEvents].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
	});

	function getTodayDate(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function openSimpleLane() {
		view = 'simple-template-list';
	}

	function openAdvancedLane() {
		view = 'advanced-template-list';
	}

	function chooseSimpleTemplate(assignmentTypeId: string) {
		selectedSimpleAssignmentTypeId = assignmentTypeId;
		view = 'simple-generator';
	}

	function chooseAdvancedTemplate(templateId: string) {
		selectedAdvancedTemplateId = templateId;
		advancedStartDate = getTodayDate();
		advancedEndDate = addCalendarDays(advancedStartDate, 6);
		advancedPattern = 'daily';
		selectedWeekdays = new Set([1, 3, 5]);
		customDateDraft = '';
		customDateEntries = [];
		advancedSeriesPreview = null;
		view = 'advanced-generator';
	}

	function goBackToTemplates() {
		view = 'simple-template-list';
	}

	function goBackToAdvancedTemplates() {
		advancedSeriesPreview = null;
		view = 'advanced-template-list';
	}

	function addCalendarDays(date: string, days: number): string {
		const value = new Date(`${date}T00:00:00`);
		value.setDate(value.getDate() + days);
		return value.toISOString().slice(0, 10);
	}

	function formatSlotAssignee(assigneeId: string | null): string {
		if (!assigneeId) return 'Unfilled';
		const person = personnelById.get(assigneeId);
		return person ? `${person.rank} ${person.lastName}` : assigneeId;
	}

	function toggleWeekday(day: number) {
		const next = new Set(selectedWeekdays);
		if (next.has(day)) {
			next.delete(day);
		} else {
			next.add(day);
		}
		selectedWeekdays = next;
	}

	function addCustomDate() {
		const nextDate = customDateDraft.trim();
		if (!nextDate) return;
		customDateEntries = [...new Set([...customDateEntries, nextDate])].sort((a, b) => a.localeCompare(b));
		customDateDraft = '';
	}

	function removeCustomDate(date: string) {
		customDateEntries = customDateEntries.filter((item) => item !== date);
	}

	function buildSeriesInput(): DutyEventSeriesInput | null {
		if (!selectedAdvancedTemplateId) return null;
		if (advancedPattern === 'custom-dates') {
			if (customDateEntries.length === 0) return null;
			return {
				templateId: selectedAdvancedTemplateId,
				pattern: advancedPattern,
				customDates: customDateEntries
			};
		}

		if (!advancedStartDate || !advancedEndDate) return null;

		return {
			templateId: selectedAdvancedTemplateId,
			startDate: advancedStartDate,
			endDate: advancedEndDate,
			pattern: advancedPattern,
			selectedWeekdays: advancedPattern === 'selected-weekdays' ? [...selectedWeekdays].sort((a, b) => a - b) : undefined
		};
	}

	async function handlePreviewAdvancedSeries() {
		const input = buildSeriesInput();
		if (!input) return;
		isPreviewingAdvancedSeries = true;
		try {
			advancedSeriesPreview = await onPreviewAdvancedSeries(input);
		} finally {
			isPreviewingAdvancedSeries = false;
		}
	}

	async function handleApplyAdvancedSeries() {
		const input = buildSeriesInput();
		if (!input) return;
		isApplyingAdvancedSeries = true;
		try {
			const result = await onApplyAdvancedSeries(input);
			if (result) {
				appliedAdvancedEvents = [...result.events, ...appliedAdvancedEvents.filter((existing) => !result.events.some((event) => event.id === existing.id))].sort(
					(a, b) => b.coverageStart.localeCompare(a.coverageStart)
				);
				advancedSeriesPreview = null;
			}
		} finally {
			isApplyingAdvancedSeries = false;
		}
	}

	function patternNeedsRange(pattern: DutyEventSeriesPattern): boolean {
		return pattern !== 'custom-dates';
	}

	function handlePatternChange(nextPattern: DutyEventSeriesPattern) {
		advancedPattern = nextPattern;
		advancedSeriesPreview = null;

		if (nextPattern === 'selected-weekdays') {
			selectedWeekdays = new Set();
		}
	}
</script>

<section class="wizard-shell">
	{#if view === 'simple-generator' && selectedSimpleAssignmentTypeId}
		<div class="wizard-banner">
			<div>
				<p class="eyebrow">Simple Lane</p>
				<h2>{selectedSimpleTemplate?.name ?? 'Simple duty roster'}</h2>
				<p class="wizard-copy">This path keeps the current one-person DA6-style behavior and existing calendar records intact.</p>
			</div>
			<button class="btn btn-secondary" type="button" onclick={goBackToTemplates}>Back to Simple Templates</button>
		</div>

		<DutyRosterGenerator
			initialAssignmentTypeId={selectedSimpleAssignmentTypeId}
			assignmentTypes={assignmentTypes}
			assignments={assignments}
			personnelByGroup={personnelByGroup}
			groups={groups}
			availabilityEntries={availabilityEntries}
			statusTypes={statusTypes}
			specialDays={specialDays}
			rosterHistory={rosterHistory}
			onApplyRoster={onApplyRoster}
			onSaveRoster={onSaveRoster}
			onDeleteRoster={onDeleteRoster}
			onUpdateExemptions={onUpdateExemptions}
		/>
	{:else}
		<div class="wizard-hero card card-flat">
			<div class="hero-copy">
				<p class="eyebrow">Duty wizard</p>
				<h2>Choose the lane that matches the duty.</h2>
				<p class="wizard-copy">
					Simple duties keep the existing one-person roster behavior. Advanced duties use reusable templates for the rebuilt flow.
				</p>
			</div>
		</div>

		{#if view === 'choose-lane'}
			<div class="lane-grid">
				<article class="lane-card card card-flat">
					<p class="eyebrow">Simple</p>
					<h3>Reuse an existing one-person duty.</h3>
					<p class="lane-copy">Bridge current assignment types into the new flow without migrating or rewriting legacy calendar data.</p>
					<button class="btn btn-primary" type="button" onclick={openSimpleLane}>Use Simple Duty</button>
				</article>

				<article class="lane-card card card-flat">
					<p class="eyebrow">Advanced</p>
					<h3>Build toward team-based duties.</h3>
					<p class="lane-copy">Select an advanced template, preview a recurring team duty series, and apply it as first-class duty events.</p>
					<button
						class="btn btn-secondary"
						type="button"
						disabled={!canManageAdvancedTemplates}
						onclick={openAdvancedLane}
					>
						Use Advanced Duty
					</button>
					{#if !canManageAdvancedTemplates}
						<p class="lane-note">Advanced duty generation is currently limited to organization admins.</p>
					{/if}
				</article>
			</div>
		{/if}

		{#if view === 'simple-template-list'}
			<section class="template-list card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Simple templates</p>
						<h3>Select an existing duty type.</h3>
					</div>
					<button class="btn btn-secondary btn-sm" type="button" onclick={() => (view = 'choose-lane')}>Back</button>
				</div>

				{#if simpleTemplates.length === 0}
					<EmptyState
						message="No one-person duty types are available yet. Add a personnel assignment type first, then it will appear here automatically."
						variant="simple"
					/>
				{:else}
					<div class="template-grid">
						{#each simpleTemplates as template (template.id)}
							<article class="template-card">
								<div>
									<h4>{template.name}</h4>
									<p class="template-meta">{template.shortName} · {template.exemptPersonnelCount} exempt</p>
									<p class="template-description">{template.description}</p>
								</div>
								<button class="btn btn-primary btn-sm" type="button" onclick={() => chooseSimpleTemplate(template.assignmentTypeId)}>
									Continue with {template.name}
								</button>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if view === 'advanced-template-list'}
			<section class="template-list card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Advanced templates</p>
						<h3>Select a saved template for a recurring run.</h3>
					</div>
					<div class="header-actions">
						<button class="btn btn-secondary btn-sm" type="button" onclick={() => (view = 'choose-lane')}>Back</button>
						<button class="btn btn-secondary btn-sm" type="button" onclick={onManageAdvancedTemplates}>Manage Templates</button>
					</div>
				</div>

				{#if activeAdvancedTemplates.length === 0}
					<EmptyState
						message="No active advanced duty templates are ready yet. Save and activate one in the template builder, then come back here to generate a recurring run."
						variant="simple"
					/>
				{:else}
					<div class="template-grid">
						{#each activeAdvancedTemplates as template (template.id)}
							<article class="template-card">
								<div>
									<h4>{template.name}</h4>
									<p class="template-meta">
						{template.coverageMode === 'timed' ? `${template.startTime} to ${template.endTime}` : 'All day'}
										· {template.slots.length} slot definition{template.slots.length === 1 ? '' : 's'}
									</p>
									<p class="template-description">{template.description ?? 'No description yet.'}</p>
								</div>
								<button class="btn btn-primary btn-sm" type="button" onclick={() => chooseAdvancedTemplate(template.id)}>
									Generate Series
								</button>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if view === 'advanced-generator' && selectedAdvancedTemplate}
			<section class="template-list card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Advanced series</p>
						<h3>{selectedAdvancedTemplate.name}</h3>
						<p class="template-description">Choose a date pattern, preview the resulting event series, and apply the run as first-class team duty events.</p>
					</div>
					<div class="header-actions">
						<button class="btn btn-secondary btn-sm" type="button" onclick={goBackToAdvancedTemplates}>Back</button>
						<button class="btn btn-secondary btn-sm" type="button" onclick={onManageAdvancedTemplates}>Manage Templates</button>
					</div>
				</div>

				<div class="advanced-form">
					{#if patternNeedsRange(advancedPattern)}
						<label class="field">
							<span class="label">Start Date</span>
							<input class="input" type="date" bind:value={advancedStartDate} />
						</label>
						<label class="field">
							<span class="label">End Date</span>
							<input class="input" type="date" bind:value={advancedEndDate} />
						</label>
					{/if}
					<label class="field">
						<span class="label">Date Pattern</span>
						<select
							class="select"
							value={advancedPattern}
							aria-label="Date Pattern"
							onchange={(event) => handlePatternChange((event.currentTarget as HTMLSelectElement).value as DutyEventSeriesPattern)}
						>
							<option value="daily">Daily</option>
							<option value="weekday-only">Weekdays Only</option>
							<option value="weekend-only">Weekends Only</option>
							<option value="selected-weekdays">Selected Weekdays</option>
							<option value="holiday-closure-only">Holiday/Closure Only</option>
							<option value="custom-dates">Custom Dates</option>
						</select>
					</label>
					<button class="btn btn-primary" type="button" disabled={!buildSeriesInput() || isPreviewingAdvancedSeries} onclick={handlePreviewAdvancedSeries}>
						{isPreviewingAdvancedSeries ? 'Preparing Preview...' : 'Preview Series'}
					</button>
				</div>

				{#if advancedPattern === 'selected-weekdays'}
					<div class="weekday-picker">
						{#each weekdayOptions as option (option.value)}
							<label class="weekday-option">
								<input
									type="checkbox"
									checked={selectedWeekdays.has(option.value)}
									onchange={() => toggleWeekday(option.value)}
									aria-label={option.label}
								/>
								<span>{option.label}</span>
							</label>
						{/each}
					</div>
				{/if}

				{#if advancedPattern === 'custom-dates'}
					<div class="custom-dates-panel">
						<label class="field">
							<span class="label">Custom Date</span>
							<input class="input" type="date" bind:value={customDateDraft} />
						</label>
						<button class="btn btn-secondary" type="button" onclick={addCustomDate}>Add Date</button>
						<div class="slot-chip-list">
							{#each customDateEntries as date (date)}
								<button class="slot-chip slot-chip-action" type="button" onclick={() => removeCustomDate(date)}>{date}</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if advancedSeriesPreview}
					<section class="preview-card" aria-label="Advanced event preview">
						<div class="preview-header">
							<div>
								<p class="eyebrow">Series preview ready</p>
								<h4>{advancedSeriesPreview.templateName}</h4>
								<p class="template-meta">{advancedSeriesPreview.eventDates.length} event{advancedSeriesPreview.eventDates.length === 1 ? '' : 's'} · {advancedSeriesPreview.pattern}</p>
							</div>
							<button class="btn btn-primary" type="button" disabled={isApplyingAdvancedSeries} onclick={handleApplyAdvancedSeries}>
								{isApplyingAdvancedSeries ? 'Applying Series...' : 'Apply Series'}
							</button>
						</div>

						<div class="slot-preview-list">
							{#each advancedSeriesPreview.events as event (event.eventDate)}
								{@const hasLowConfidence = event.slotInstances.some((slot) => slot.fairnessConfidence === 'low')}
								<article class="slot-preview-item">
									<div>
										<h5>{event.eventDate}</h5>
										<p class="template-meta">{event.coverageStart} to {event.coverageEnd}</p>
										<p class="summary-line">
											Blocking: <strong>{event.isBlocking ? 'Yes' : 'No'}</strong> · Fill:
											<strong>{event.fillSummary.filledSlots}/{event.fillSummary.totalSlots}</strong>
										</p>
										{#if hasLowConfidence}
											<p class="summary-line">Fairness confidence: <strong>Low</strong></p>
										{/if}
									</div>
									<div class="slot-preview-list nested-list">
										{#each event.slotInstances as slot (`${event.eventDate}-${slot.roleLabel}-${slot.slotIndex}`)}
											<div class="slot-preview-subitem">
												<strong>{slot.roleLabel} #{slot.slotIndex + 1}</strong>
												<span>{formatSlotAssignee(slot.assigneeId)}</span>
												<span>{slot.unfilledReason ?? slot.selectionReason ?? 'Generated assignment ready to apply.'}</span>
											</div>
										{/each}
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/if}
			</section>
		{/if}
	{/if}

	<section class="applied-events card card-flat">
		<div class="list-header">
			<div>
				<p class="eyebrow">Applied events</p>
				<h3>Applied advanced duty events</h3>
			</div>
		</div>

		{#if appliedAdvancedEvents.length === 0}
			<EmptyState
				message="No advanced duty events have been applied yet. Use the advanced lane to generate a series from an active template."
				variant="simple"
			/>
		{:else}
			<div class="template-grid">
				{#each appliedAdvancedEvents as event (event.id)}
					<article class="template-card">
						<div>
							<h4>{event.templateName}</h4>
							<p class="template-meta">{event.coverageStart} to {event.coverageEnd}</p>
							<p class="template-description">
								{event.fillSummary.filledSlots}/{event.fillSummary.totalSlots} slot{event.fillSummary.totalSlots === 1 ? '' : 's'} filled
							</p>
						</div>
						<div class="slot-chip-list">
							{#each event.slotInstances as slot (slot.id)}
								<span class="slot-chip">{slot.roleLabel} #{slot.slotIndex + 1}: {formatSlotAssignee(slot.assigneeId)}</span>
							{/each}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</section>

<style>
	.wizard-shell {
		display: grid;
		gap: var(--sp-5);
	}

	.wizard-hero,
	.wizard-banner,
	.lane-card,
	.template-list,
	.applied-events {
		padding: var(--sp-5);
	}

	.wizard-hero,
	.wizard-banner {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: linear-gradient(135deg, color-mix(in srgb, var(--surface-panel) 88%, var(--amber-light) 12%), var(--surface-panel));
	}

	.wizard-banner,
	.list-header,
	.preview-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
	}

	.header-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	h2,
	h3,
	h4,
	h5 {
		margin: 0;
	}

	.wizard-copy,
	.lane-copy,
	.template-description,
	.lane-note,
	.template-meta,
	.summary-line {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}

	.lane-grid,
	.template-grid {
		display: grid;
		gap: var(--sp-4);
	}

	.lane-grid {
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}

	.template-grid {
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		margin-top: var(--sp-4);
	}

	.lane-card,
	.template-card,
	.preview-card {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.lane-card,
	.template-card,
	.preview-card,
	.slot-preview-item {
		padding: var(--sp-4);
	}

	.template-card,
	.slot-preview-item {
		display: grid;
		gap: var(--sp-3);
	}

	.advanced-form,
	.slot-chip-list {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.advanced-form {
		align-items: end;
		margin-top: var(--sp-4);
	}

	.field {
		display: grid;
		gap: var(--sp-2);
		min-width: min(220px, 100%);
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.preview-card,
	.slot-preview-list {
		margin-top: var(--sp-4);
	}

	.weekday-picker,
	.custom-dates-panel {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	.weekday-option {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 8px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.slot-preview-list {
		display: grid;
		gap: var(--sp-3);
	}

	.slot-preview-item {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.slot-chip {
		display: inline-flex;
		align-items: center;
		padding: 4px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--amber-light) 75%, var(--surface-panel) 25%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--amber-dark);
	}

	.slot-chip-action {
		border: none;
		cursor: pointer;
	}

	.nested-list {
		margin-top: 0;
	}

	.slot-preview-subitem {
		display: grid;
		gap: 2px;
		padding: 10px 12px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-secondary);
	}

	@media (max-width: 720px) {
		.wizard-banner,
		.list-header,
		.preview-header,
		.advanced-form {
			flex-direction: column;
			align-items: stretch;
		}

		.header-actions {
			width: 100%;
		}

		.header-actions :global(.btn) {
			flex: 1;
		}
	}
</style>
