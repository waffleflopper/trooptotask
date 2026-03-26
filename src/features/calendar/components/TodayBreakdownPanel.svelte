<script lang="ts">
	import type { Personnel, AvailabilityEntry, StatusType, AssignmentType, DailyAssignment } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import { computeTodayBreakdownData } from '$features/calendar/utils/todayBreakdownData';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		expanded: boolean;
		onToggle: () => void;
		personnelByGroup: GroupData[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
	}

	let { expanded, onToggle, personnelByGroup, availabilityEntries, statusTypes, assignmentTypes, assignments }: Props =
		$props();

	const today = $derived(formatDate(new Date()));

	const data = $derived(
		computeTodayBreakdownData(today, personnelByGroup, availabilityEntries, statusTypes, assignmentTypes, assignments)
	);
</script>

<div class="breakdown-panel" data-testid="today-breakdown-panel" role="region" aria-label="Today's summary">
	<button
		class="toggle-bar"
		data-testid="today-breakdown-summary-toggle"
		onclick={onToggle}
		aria-expanded={expanded}
		aria-controls="today-breakdown-body"
	>
		<span class="toggle-label">Today's Summary</span>
		<span class="toggle-meta">
			{data.presentCount}/{data.totalCount} present
		</span>
		<svg
			class="toggle-chevron"
			class:expanded
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<polyline points="6 9 12 15 18 9" />
		</svg>
	</button>

	<div
		id="today-breakdown-body"
		class="panel-body"
		data-testid="today-breakdown-body"
		class:expanded
		aria-hidden={!expanded}
	>
		<div class="panel-inner">
			<!-- Status counts -->
			<div class="section">
				<span class="section-label">Status:</span>
				<div class="chip-list">
					{#each data.statusCounts as { statusType, count } (statusType.id)}
						<span class="chip status-chip">
							<span class="status-dot" style:background-color={statusType.color}></span>
							{statusType.name}
							<span class="chip-count">{count}</span>
						</span>
					{/each}
					{#if data.statusCounts.length === 0}
						<span class="empty-note">All personnel present</span>
					{/if}
				</div>
			</div>

			<!-- Assignment coverage -->
			{#if data.assignmentCoverage.length > 0}
				<div class="section">
					<span class="section-label">Duty:</span>
					<div class="chip-list">
						{#each data.assignmentCoverage as coverage (coverage.type.id)}
							<span class="chip" class:chip-unassigned={!coverage.isAssigned}>
								<strong>{coverage.type.shortName}:</strong>
								{coverage.isAssigned ? coverage.assigneeName : 'Unassigned'}
							</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Gaps / warnings -->
			{#if data.gaps.length > 0}
				<div class="section gaps-section">
					{#each data.gaps as gap (gap)}
						<span class="gap-flag">
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
								<line x1="12" y1="9" x2="12" y2="13" />
								<line x1="12" y1="17" x2="12.01" y2="17" />
							</svg>
							{gap}
						</span>
					{/each}
				</div>
			{/if}

			<!-- Group strength -->
			{#if data.groupStrength.length > 1}
				<div class="section">
					<span class="section-label">Strength:</span>
					<div class="chip-list">
						{#each data.groupStrength as { group, present, total } (group)}
							<span class="chip" class:chip-warning={present < total}>
								{group}: {present}/{total}
							</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	/* ---- Container ---- */
	.breakdown-panel {
		border-bottom: 1px solid var(--color-border);
	}

	/* ---- Toggle bar ---- */
	.toggle-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		width: 100%;
		height: 32px;
		padding: 0 var(--spacing-lg);
		background: var(--color-surface);
		border: none;
		border-bottom: 1px solid var(--color-border);
		cursor: pointer;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		transition: background var(--transition-fast);
	}

	.toggle-bar:hover {
		background: var(--color-surface-variant);
	}

	.toggle-label {
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-muted);
		user-select: none;
	}

	.toggle-meta {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.toggle-chevron {
		margin-left: auto;
		color: var(--color-text-disabled);
		transition: transform var(--transition-fast);
		transform: rotate(-90deg);
	}

	.toggle-chevron.expanded {
		transform: rotate(0deg);
	}

	/* ---- Expandable body ---- */
	.panel-body {
		display: grid;
		grid-template-rows: 0fr;
		opacity: 0;
		transition:
			grid-template-rows var(--transition-normal),
			opacity var(--transition-normal);
	}

	.panel-body.expanded {
		grid-template-rows: 1fr;
		opacity: 1;
	}

	.panel-inner {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-surface);
	}

	/* ---- Section rows ---- */
	.section {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.section-label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.chip-list {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--spacing-xs);
	}

	/* ---- Chips (follows Badge pattern) ---- */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		white-space: nowrap;
	}

	.chip strong {
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}

	.chip-count {
		font-weight: var(--font-weight-semibold);
	}

	.status-dot {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.chip-unassigned {
		color: var(--color-text-muted);
		border-style: dashed;
		font-style: italic;
	}

	.chip-warning {
		color: var(--color-warning);
		border-color: var(--color-warning-light);
		background: rgba(255, 152, 0, var(--opacity-subtle));
	}

	/* ---- Gaps / flags ---- */
	.gaps-section {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--spacing-xs);
	}

	.gap-flag {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--color-warning);
	}

	.gap-flag svg {
		flex-shrink: 0;
	}

	.empty-note {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* ---- Responsive ---- */
	@media (max-width: 640px) {
		.toggle-bar {
			padding: 0 var(--spacing-md);
		}

		.panel-inner {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.section {
			flex-direction: column;
			gap: var(--spacing-xs);
		}
	}
</style>
