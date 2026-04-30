<script lang="ts">
	import type { DutyEventSeriesPreview, DutyEventPreviewSlotInstance, DutyTemplate } from '../duty-roster.types';
	import type { Personnel } from '$lib/types';
	import CollisionReviewPanel from './CollisionReviewPanel.svelte';
	import type { SlotExplanationSection } from './SlotPreviewItem.svelte';
	import SearchSelect, { type SearchSelectOption } from '$lib/components/ui/SearchSelect.svelte';

	type AdvancedRunUiState =
		| 'draft'
		| 'stale'
		| 'expired'
		| 'applying'
		| 'applied'
		| 'failed-before-persistence'
		| 'partial-recovery';

	const stateCopy: Record<AdvancedRunUiState, { label: string; description: string }> = {
		draft: {
			label: 'Draft preview',
			description: 'This generated run is under review.'
		},
		stale: {
			label: 'Stale preview',
			description: 'Source data or reviewed inputs changed. Regenerate before applying.'
		},
		expired: {
			label: 'Expired preview',
			description: 'This 24-hour draft snapshot can no longer be applied.'
		},
		applying: {
			label: 'Applying',
			description: 'The reviewed snapshot is being persisted.'
		},
		applied: {
			label: 'Applied',
			description: 'This run is finalized and cannot be normally applied again.'
		},
		'failed-before-persistence': {
			label: 'Failed before persistence',
			description: 'Nothing was persisted. Retry may be allowed if the draft is still valid.'
		},
		'partial-recovery': {
			label: 'Partial recovery',
			description: 'Some persistence succeeded. Use recovery instead of retrying the run.'
		}
	};

	interface Props {
		preview: DutyEventSeriesPreview;
		template: DutyTemplate;
		eyebrow?: string;
		meta?: string;
		applyLabel?: string;
		applyingLabel?: string;
		isRefreshing: boolean;
		isApplying: boolean;
		collisionReviewConfirmed: boolean;
		shortfallReviewConfirmed: boolean;
		previewCollisionMessages: string[];
		personnelOptions: Personnel[];
		snapshotState?: AdvancedRunUiState;
		canExportPreview?: boolean;
		canRegenerate?: boolean;
		canRetryApply?: boolean;
		canRecoverPartialApply?: boolean;
		formatAssignee: (id: string | null) => string;
		formatCoverageLabel: (event: {
			coverageMode: 'all-day' | 'timed';
			coverageStart: string;
			coverageEnd: string;
		}) => string;
		getExplanationSections: (slot: DutyEventPreviewSlotInstance) => SlotExplanationSection[];
		hasSeriesSlotOverride: (eventDate: string, slot: DutyEventPreviewSlotInstance) => boolean;
		onApply: () => void;
		onRegenerate?: () => void;
		onExportPreview?: () => void;
		onRetryApply?: () => void;
		onRecoverPartialApply?: () => void;
		onCollisionConfirmedChange: (confirmed: boolean) => void;
		onShortfallConfirmedChange: (confirmed: boolean) => void;
		onUpdateSlotAssignee: (eventDate: string, slot: DutyEventPreviewSlotInstance, assigneeId: string | null) => void;
		onToggleSlotLock: (eventDate: string, slot: DutyEventPreviewSlotInstance) => void;
		onClearSlot: (eventDate: string, slot: DutyEventPreviewSlotInstance) => void;
		onResetSlot: (eventDate: string, slot: DutyEventPreviewSlotInstance) => void;
	}

	let {
		preview,
		template,
		eyebrow = 'Series preview ready',
		meta = `${preview.eventDates.length} event${preview.eventDates.length === 1 ? '' : 's'} · ${preview.pattern}`,
		applyLabel = 'Apply Series',
		applyingLabel = 'Applying Series...',
		isRefreshing,
		isApplying,
		collisionReviewConfirmed,
		shortfallReviewConfirmed,
		previewCollisionMessages,
		personnelOptions,
		snapshotState = 'draft',
		canExportPreview = true,
		canRegenerate = true,
		canRetryApply = false,
		canRecoverPartialApply = false,
		formatAssignee,
		formatCoverageLabel,
		getExplanationSections,
		hasSeriesSlotOverride,
		onApply,
		onRegenerate = () => {},
		onExportPreview = () => {},
		onRetryApply = () => {},
		onRecoverPartialApply = () => {},
		onCollisionConfirmedChange,
		onShortfallConfirmedChange,
		onUpdateSlotAssignee,
		onToggleSlotLock,
		onClearSlot,
		onResetSlot
	}: Props = $props();

	let selectedDate = $state('all');
	let selectedPool = $state('all');

	const previewRequiresCollisionReview = $derived(previewCollisionMessages.length > 0);
	const previewHasShortfalls = $derived(preview.events.some((event) => event.fillSummary.unfilledSlots > 0));
	const totalSlots = $derived(preview.events.reduce((total, event) => total + event.fillSummary.totalSlots, 0));
	const filledSlots = $derived(preview.events.reduce((total, event) => total + event.fillSummary.filledSlots, 0));
	const hasApplySnapshotMetadata = $derived(Boolean(preview.snapshotId && preview.snapshotFingerprint));
	const canApply = $derived(
		!isApplying &&
			!isRefreshing &&
			snapshotState === 'draft' &&
			hasApplySnapshotMetadata &&
			!(previewRequiresCollisionReview && !collisionReviewConfirmed) &&
			!(previewHasShortfalls && !shortfallReviewConfirmed)
	);
	const currentStateCopy = $derived(stateCopy[snapshotState]);
	const disableActionControls = $derived(isRefreshing || isApplying || snapshotState === 'applying');
	const canUseRegenerate = $derived(canRegenerate && !disableActionControls);
	const canUsePreviewExport = $derived(canExportPreview && !disableActionControls && snapshotState !== 'expired');
	const canUseRetry = $derived(
		canRetryApply && snapshotState === 'failed-before-persistence' && !disableActionControls
	);
	const canUseRecovery = $derived(
		canRecoverPartialApply && snapshotState === 'partial-recovery' && !disableActionControls
	);

	const poolKeys = $derived([...new Set(template.slots.map((slot) => slot.rotationPoolKey))].sort());
	const poolBySlotId = $derived(new Map(template.slots.map((slot) => [slot.id, slot.rotationPoolKey])));
	const reviewRows = $derived.by(() =>
		preview.events.flatMap((event) =>
			event.slotInstances.map((slot) => ({
				event,
				slot,
				poolKey: slot.templateSlotId ? (poolBySlotId.get(slot.templateSlotId) ?? 'Unassigned') : 'Unassigned'
			}))
		)
	);
	const filteredRows = $derived(
		reviewRows.filter((row) => {
			const matchesDate = selectedDate === 'all' || row.event.eventDate === selectedDate;
			const matchesPool = selectedPool === 'all' || row.poolKey === selectedPool;
			return matchesDate && matchesPool;
		})
	);

	function slotLabel(slot: DutyEventPreviewSlotInstance) {
		return `${slot.roleLabel} #${slot.slotIndex + 1}`;
	}

	function sourceLabel(slot: DutyEventPreviewSlotInstance, hasOverride: boolean) {
		if (!slot.assigneeId && hasOverride) return 'Cleared';
		if (!slot.assigneeId) return 'Unfilled';
		if (slot.assignmentSource === 'locked') return 'Locked';
		if (slot.assignmentSource === 'manual' || hasOverride) return 'Changed by user';
		return 'Generated';
	}

	function issueLabel(slot: DutyEventPreviewSlotInstance) {
		if (!slot.assigneeId) return 'Unfilled';
		if (slot.warningState === 'conflict') return 'Conflict';
		if (slot.warningState === 'warning') return 'Warning';
		if (slot.fairnessConfidence === 'low') return 'Low confidence';
		return 'No issue';
	}

	function assigneeOptionDescription(slot: DutyEventPreviewSlotInstance, person: Personnel) {
		const ranking = slot.candidateRankings?.find((candidate) => candidate.personnelId === person.id);
		if (!ranking) return undefined;

		const selectedRanking = slot.assigneeId
			? slot.candidateRankings?.find((candidate) => candidate.personnelId === slot.assigneeId)
			: undefined;
		const isSelected = slot.assigneeId === person.id;
		if (isSelected) return `Current pick, #${ranking.rank}`;

		const nextRank = selectedRanking?.rank === 1 ? 2 : 1;
		if (ranking.rank === nextRank) return `Next up, #${ranking.rank}`;

		return `Rotation #${ranking.rank}`;
	}

	function assigneeOptions(slot: DutyEventPreviewSlotInstance): SearchSelectOption[] {
		return [
			{ value: '', label: 'Leave Unfilled' },
			...personnelOptions.map((person) => ({
				value: person.id,
				label: `${person.rank} ${person.lastName}`,
				description: assigneeOptionDescription(slot, person)
			}))
		];
	}

	function usesWeekendHolidaySequence(event: DutyEventSeriesPreview['events'][number]) {
		return event.advancedDa6SequenceKey === 'weekend-holiday';
	}

	function handleTableViewportKeydown(event: KeyboardEvent) {
		const viewport = event.currentTarget as HTMLElement;
		if (event.key === 'ArrowRight') {
			viewport.scrollLeft += 48;
			event.preventDefault();
		} else if (event.key === 'ArrowLeft') {
			viewport.scrollLeft -= 48;
			event.preventDefault();
		} else if (event.key === 'Home') {
			viewport.scrollLeft = 0;
		} else if (event.key === 'End') {
			viewport.scrollLeft = viewport.scrollWidth;
		}
	}
</script>

<section class="preview-card" aria-label="Advanced event preview">
	<div class="preview-header">
		<div>
			<p class="eyebrow">{eyebrow}</p>
			<h4>{preview.templateName}</h4>
			<p class="template-meta">{meta}</p>
			<p class="summary-line"><span>Fill:</span> <strong>{filledSlots}/{totalSlots}</strong></p>
			{#if isRefreshing}
				<p class="template-meta">Refreshing preview around your edits...</p>
			{/if}
		</div>
	</div>

	<section class="run-action-state" aria-label="Advanced run actions and snapshot state">
		<div class="state-copy">
			<p class="state-label">{currentStateCopy.label}</p>
			<p>{currentStateCopy.description}</p>
			{#if snapshotState === 'draft' && !hasApplySnapshotMetadata}
				<p class="snapshot-warning">Snapshot identity is missing. Regenerate before applying.</p>
			{/if}
			<p class="preview-export-label">Preview export: not applied output</p>
		</div>
		<div class="persistent-actions">
			<button class="btn btn-secondary btn-sm" type="button" disabled={!canUseRegenerate} onclick={onRegenerate}>
				Regenerate preview
			</button>
			<button
				class="btn btn-secondary btn-sm"
				type="button"
				disabled={!canUsePreviewExport}
				aria-label="Export preview, not applied output"
				onclick={onExportPreview}>Export preview</button
			>
			{#if snapshotState === 'failed-before-persistence'}
				<button class="btn btn-secondary btn-sm" type="button" disabled={!canUseRetry} onclick={onRetryApply}>
					Retry apply
				</button>
			{/if}
			{#if snapshotState === 'partial-recovery'}
				<button
					class="btn btn-secondary btn-sm"
					type="button"
					disabled={!canUseRecovery}
					onclick={onRecoverPartialApply}
				>
					Recover partial apply
				</button>
			{/if}
			<button class="btn btn-primary btn-sm" type="button" disabled={!canApply} onclick={onApply}>
				{isApplying ? applyingLabel : applyLabel}
			</button>
		</div>
	</section>

	{#if previewRequiresCollisionReview}
		<div class="collision-wrapper">
			<CollisionReviewPanel
				messages={previewCollisionMessages}
				confirmed={collisionReviewConfirmed}
				onConfirmedChange={onCollisionConfirmedChange}
				applyLabel="applying the run"
			/>
		</div>
	{/if}

	{#if previewHasShortfalls}
		<div class="collision-wrapper">
			<label class="checkbox-row">
				<input
					type="checkbox"
					checked={shortfallReviewConfirmed}
					onchange={(event) => onShortfallConfirmedChange((event.currentTarget as HTMLInputElement).checked)}
				/>
				<span>I understand this run still has unfilled duty slots</span>
			</label>
		</div>
	{/if}

	<div class="review-filters" aria-label="Advanced duty review filters">
		<label class="filter-field">
			<span>Filter by date</span>
			<select
				value={selectedDate}
				onchange={(event) => (selectedDate = (event.currentTarget as HTMLSelectElement).value)}
			>
				<option value="all">All dates</option>
				{#each preview.eventDates as eventDate (eventDate)}
					<option value={eventDate}>Date {eventDate}</option>
				{/each}
			</select>
		</label>
		<label class="filter-field">
			<span>Filter by rotation pool</span>
			<select
				value={selectedPool}
				onchange={(event) => (selectedPool = (event.currentTarget as HTMLSelectElement).value)}
			>
				<option value="all">All pools</option>
				{#each poolKeys as poolKey (poolKey)}
					<option value={poolKey}>{poolKey}</option>
				{/each}
			</select>
		</label>
		<p class="review-count">{filteredRows.length} of {reviewRows.length} slots shown</p>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<section
		class="review-table-wrap"
		aria-label="Advanced duty run table viewport"
		tabindex="0"
		onkeydown={handleTableViewportKeydown}
	>
		<table class="review-table" aria-label="Advanced duty run review">
			<thead>
				<tr>
					<th scope="col">Date</th>
					<th scope="col">Coverage</th>
					<th scope="col">Slot</th>
					<th scope="col">Proposed Soldier</th>
					<th scope="col">Source</th>
					<th scope="col">Issue</th>
					<th scope="col">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredRows as row (`${row.event.eventDate}-${row.slot.roleLabel}-${row.slot.slotIndex}`)}
					{@const hasOverride = hasSeriesSlotOverride(row.event.eventDate, row.slot)}
					{@const explanationSections = getExplanationSections(row.slot)}
					<tr class:sequence-weekend-holiday={usesWeekendHolidaySequence(row.event)}>
						<td class="date-cell">
							<span>{row.event.eventDate}</span>
							{#if usesWeekendHolidaySequence(row.event)}
								<span class="sequence-label">{row.event.advancedDa6SequenceLabel ?? 'Separate weekend DA6'}</span>
							{/if}
						</td>
						<td>{formatCoverageLabel(row.event)}</td>
						<td>
							<div class="slot-cell">
								<strong>{slotLabel(row.slot)}</strong>
								<span>{row.poolKey}</span>
							</div>
						</td>
						<td>
							<label class="assignee-field">
								<span class="sr-only">Assignee for {row.event.eventDate} {slotLabel(row.slot)}</span>
								<SearchSelect
									options={assigneeOptions(row.slot)}
									value={row.slot.assigneeId ?? ''}
									disabled={isRefreshing || isApplying}
									clearable={false}
									compact
									placeholder="Leave Unfilled"
									ariaLabel={`Assignee for ${row.event.eventDate} ${slotLabel(row.slot)}`}
									onchange={(value) => onUpdateSlotAssignee(row.event.eventDate, row.slot, value || null)}
								/>
							</label>
							<div class="assignee-meta">
								<span class="assignee-name">{formatAssignee(row.slot.assigneeId)}</span>
								{#if explanationSections.length > 0}
									<details class="assignment-details">
										<summary
											aria-label={`Show assignment details for ${row.event.eventDate} ${slotLabel(row.slot)}`}
											title="Assignment details"
										>
											<span aria-hidden="true">?</span>
										</summary>
										<div class="assignment-popover" role="group">
											<p class="slot-note-label">{row.event.eventDate} · {slotLabel(row.slot)}</p>
											{#each explanationSections as section (`${row.event.eventDate}-${row.slot.slotIndex}-${section.label}`)}
												<div
													class="note-section"
													class:note-warning={section.tone === 'warning'}
													class:note-conflict={section.tone === 'conflict'}
												>
													<p class="note-section-label">{section.label}</p>
													{#each section.lines as line (`${section.label}-${line}`)}
														<p>{line}</p>
													{/each}
												</div>
											{/each}
										</div>
									</details>
								{/if}
							</div>
						</td>
						<td>
							<span class="state-chip">{sourceLabel(row.slot, hasOverride)}</span>
						</td>
						<td>
							<span
								class="issue-chip"
								class:issue-conflict={issueLabel(row.slot) === 'Conflict'}
								class:issue-warning={issueLabel(row.slot) === 'Warning' || issueLabel(row.slot) === 'Low confidence'}
								class:issue-unfilled={issueLabel(row.slot) === 'Unfilled'}
								>{issueLabel(row.slot)}
								{#if row.slot.warningState === 'warning'}<span class="sr-only">Soft warning</span>{/if}
								{#if row.slot.warningState === 'conflict'}<span class="sr-only">Hard conflict</span>{/if}</span
							>
						</td>
						<td>
							<div class="row-actions">
								<button
									class="btn btn-secondary btn-sm"
									type="button"
									disabled={isRefreshing || isApplying}
									aria-label={`${row.slot.assignmentSource === 'locked' ? 'Unlock' : 'Lock'} ${row.event.eventDate} ${slotLabel(row.slot)}`}
									onclick={() => onToggleSlotLock(row.event.eventDate, row.slot)}
								>
									{row.slot.assignmentSource === 'locked' ? 'Unlock' : 'Lock'}
								</button>
								<button
									class="btn btn-secondary btn-sm"
									type="button"
									disabled={isRefreshing || isApplying}
									aria-label={`Clear ${row.event.eventDate} ${slotLabel(row.slot)}`}
									onclick={() => onClearSlot(row.event.eventDate, row.slot)}
								>
									Clear
								</button>
								<button
									class="btn btn-secondary btn-sm"
									type="button"
									disabled={isRefreshing || isApplying || !hasOverride}
									aria-label={`Reset ${row.event.eventDate} ${slotLabel(row.slot)}`}
									onclick={() => onResetSlot(row.event.eventDate, row.slot)}
								>
									Reset
								</button>
							</div>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="empty-cell">No slots match these filters.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
</section>

<style>
	.preview-card {
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		min-width: 0;
	}

	.preview-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
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

	h4 {
		margin: 0;
	}

	.template-meta,
	.summary-line {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}

	.summary-line span {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.collision-wrapper {
		margin-top: var(--sp-4);
	}

	.run-action-state {
		position: sticky;
		top: var(--sp-3);
		z-index: 3;
		display: grid;
		grid-template-columns: minmax(220px, 1fr) minmax(260px, auto);
		gap: var(--sp-3);
		align-items: center;
		margin-top: var(--sp-4);
		padding: var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 86%, var(--surface-subtle) 14%);
	}

	.state-copy {
		display: grid;
		gap: 3px;
	}

	.state-copy p {
		margin: 0;
		color: var(--text-secondary);
	}

	.state-label,
	.preview-export-label,
	.snapshot-warning {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.state-label {
		color: var(--text-primary);
	}

	.preview-export-label {
		color: var(--amber-dark);
	}

	.snapshot-warning {
		color: var(--danger-dark);
	}

	.persistent-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--sp-2);
	}

	.persistent-actions :global(.btn) {
		min-width: max-content;
		white-space: nowrap;
	}

	.review-filters {
		display: grid;
		grid-template-columns: minmax(160px, 220px) minmax(160px, 220px) 1fr;
		gap: var(--sp-3);
		align-items: end;
		margin-top: var(--sp-4);
	}

	.filter-field {
		display: grid;
		gap: var(--sp-1);
	}

	.filter-field span,
	.review-count,
	.slot-note-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.filter-field select {
		width: 100%;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-primary);
	}

	.filter-field select {
		min-height: 38px;
		padding: 7px 10px;
	}

	.filter-field select:focus-visible,
	.review-table-wrap:focus-visible,
	:global(.btn:focus-visible) {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	.review-count {
		justify-self: end;
		margin: 0 0 10px;
	}

	.review-table-wrap {
		margin-top: var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		overflow: auto;
		max-width: 100%;
		scrollbar-gutter: stable;
	}

	.review-table {
		width: 100%;
		min-width: 860px;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.review-table th,
	.review-table td {
		padding: 9px 10px;
		border-bottom: 1px solid var(--border-subtle);
		text-align: left;
		vertical-align: middle;
	}

	.review-table th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--surface-subtle);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.review-table tr:last-child td {
		border-bottom: 0;
	}

	.review-table tbody tr.sequence-weekend-holiday td {
		background: color-mix(in srgb, var(--amber-light) 28%, var(--surface-panel) 72%);
	}

	.date-cell {
		display: grid;
		gap: 2px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.sequence-label {
		width: max-content;
		max-width: 17ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--amber-dark);
	}

	.slot-cell,
	.assignee-field {
		display: grid;
		gap: 3px;
	}

	.assignee-field :global(.search-select) {
		min-width: 170px;
		width: 100%;
	}

	.slot-cell strong,
	.assignee-name {
		color: var(--text-primary);
		font-weight: var(--font-weight-medium);
	}

	.slot-cell span,
	.assignee-name {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.assignee-meta {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		margin-top: 3px;
	}

	.state-chip,
	.issue-chip {
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
		padding: 2px 7px;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
		color: var(--text-secondary);
	}

	.issue-warning {
		background: color-mix(in srgb, var(--amber-light) 78%, var(--surface-panel) 22%);
		color: var(--amber-dark);
	}

	.issue-conflict,
	.issue-unfilled {
		background: color-mix(in srgb, var(--danger-light) 82%, var(--surface-panel) 18%);
		color: var(--danger-dark);
	}

	.row-actions {
		display: grid;
		grid-template-columns: repeat(3, minmax(64px, 1fr));
		gap: var(--sp-2);
	}

	.row-actions :global(.btn) {
		width: 100%;
		min-width: 0;
		white-space: nowrap;
	}

	.assignment-details {
		position: relative;
		display: inline-flex;
	}

	.assignment-details summary {
		display: inline-grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border: 1px solid var(--border-default);
		border-radius: 999px;
		background: var(--surface-subtle);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: var(--font-weight-semibold);
		line-height: 1;
		cursor: pointer;
		list-style: none;
	}

	.assignment-details summary::-webkit-details-marker {
		display: none;
	}

	.assignment-details summary:hover,
	.assignment-details summary:focus-visible {
		border-color: var(--amber-dark);
		color: var(--amber-dark);
		outline: none;
	}

	.assignment-details summary:focus-visible {
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--amber-light) 70%, transparent);
	}

	.assignment-popover {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		z-index: 4;
		width: min(320px, calc(100vw - 48px));
		padding: var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		box-shadow: var(--shadow-lg);
	}

	.assignment-popover p {
		margin: 0;
		color: var(--text-secondary);
	}

	.empty-cell {
		padding: var(--sp-4);
		color: var(--text-secondary);
		text-align: center;
	}

	.note-section {
		margin-top: var(--sp-2);
	}

	.note-section p + p {
		margin-top: var(--sp-1);
	}

	.note-section-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.note-warning p {
		color: var(--amber-dark);
	}

	.note-conflict p {
		color: var(--danger-dark);
	}

	@media (max-width: 860px) {
		.run-action-state {
			position: static;
			grid-template-columns: 1fr;
		}

		.persistent-actions {
			justify-content: flex-start;
		}

		.review-filters {
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		}

		.review-count {
			justify-self: start;
			margin-bottom: 0;
		}

		.persistent-actions {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
			width: 100%;
		}

		.persistent-actions :global(.btn) {
			width: 100%;
			min-width: 0;
		}
	}

	@media (max-width: 560px) {
		.preview-card {
			padding: var(--sp-3);
		}

		.review-filters,
		.persistent-actions {
			grid-template-columns: 1fr;
		}

		.review-table {
			min-width: 760px;
		}
	}
</style>
