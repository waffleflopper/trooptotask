<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import { Badge as UiBadge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { useDataTableSelection } from '$lib/components/ui/data-table';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { validateDateRange } from '$features/calendar/utils/availabilityMutation';
	import RosterPicker from './RosterPicker.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		statusTypes: StatusType[];
		/** Applies the status to the given people and resolves with the personnel ids that were inserted. */
		onApply: (
			personnelIds: string[],
			statusTypeId: string,
			startDate: string,
			endDate: string,
			note: string | null
		) => Promise<string[]>;
		onComplete: () => void;
	}

	let { personnelByGroup, statusTypes, onApply, onComplete }: Props = $props();

	const todayStr = formatDate(new Date());
	let selectedStatusId = $state('');
	let startDate = $state(todayStr);
	let endDate = $state(todayStr);
	let isSubmitting = $state(false);
	let note = $state('');
	let step = $state<'select' | 'confirm'>('select');

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));
	const selection = useDataTableSelection<Personnel>({ rows: () => allPersonnel, rowKey: (p) => p.id });

	// ---- Validation ----
	const range = $derived(validateDateRange(startDate, endDate));
	const isValid = $derived(!!selectedStatusId && range.valid && selection.selectedCount > 0);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));
	const selectedPersonnel = $derived(
		[...selection.selectedRows].sort(
			(a, b) => (a.groupName || '').localeCompare(b.groupName || '') || a.lastName.localeCompare(b.lastName)
		)
	);

	$effect(() => {
		if (!selectedStatusId && statusTypes.length > 0) {
			selectedStatusId = statusTypes[0].id;
		}
	});

	function formatDateDisplay(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function handleReview() {
		if (!isValid) return;
		step = 'confirm';
	}

	function handleBack() {
		step = 'select';
	}

	async function handleSubmit() {
		if (!isValid || isSubmitting) return;
		isSubmitting = true;
		try {
			const selected = [...selection.selectedRows];
			const ids = selected.map((p) => p.id);
			const insertedIds = await onApply(ids, selectedStatusId, startDate, endDate, note.trim() || null);
			if (insertedIds.length === 0) {
				toastStore.error('Failed to apply status');
				return;
			}
			if (insertedIds.length < ids.length) {
				// Keep the failed subset selected so the operator can retry just those people.
				const insertedSet = new Set(insertedIds);
				const failed = selected.filter((p) => !insertedSet.has(p.id));
				selection.clear();
				for (const p of failed) selection.toggleRow(p, 0, true);
				toastStore.error(
					`Applied status to ${insertedIds.length} of ${ids.length} people — the ${failed.length} who failed are still selected so you can retry`
				);
			} else {
				toastStore.success(`Applied status to ${insertedIds.length} ${insertedIds.length === 1 ? 'person' : 'people'}`);
				selection.clear();
			}
			step = 'select';
			onComplete();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="bulk-add-panel">
	{#if step === 'select'}
		<div class="bulk-workspace">
			<aside class="controls-column">
				<section class="controls-card">
					<div class="pane-heading">
						<span class="pane-eyebrow">Step 1</span>
						<h2 class="pane-title">Define the status change</h2>
						<p class="pane-copy">Set the status and date range first, then choose who it should apply to.</p>
					</div>

					<div class="config-grid">
						<Field.Root>
							<Field.Label for="statusType">Status Type</Field.Label>
							<NativeSelect id="statusType" bind:value={selectedStatusId}>
								{#each statusTypes as status (status.id)}
									<option value={status.id}>{status.name}</option>
								{/each}
							</NativeSelect>
							{#if selectedStatus}
								<div class="status-summary-support">
									<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
									<span class="status-summary-hint">Selected status</span>
								</div>
							{/if}
						</Field.Root>

						<div class="date-grid">
							<Field.Root>
								<Field.Label for="startDate">Start Date</Field.Label>
								<DatePicker id="startDate" bind:value={startDate} placeholder="Select start date" />
							</Field.Root>

							<Field.Root>
								<Field.Label for="endDate">End Date</Field.Label>
								<DatePicker id="endDate" bind:value={endDate} placeholder="Select end date" />
								{#if range.dayCount > 0}
									<div class="status-summary-support">
										<span class="day-count-number">{range.dayCount}</span>
										<span class="status-summary-hint">{range.dayCount === 1 ? 'day selected' : 'days selected'}</span>
									</div>
								{/if}
							</Field.Root>
						</div>

						{#if range.error}
							<div id="date-error" class="date-error" role="alert">{range.error}</div>
						{/if}

						<Field.Root>
							<Field.Label for="bulkNote">Note</Field.Label>
							<Input
								id="bulkNote"
								type="text"
								bind:value={note}
								maxlength={200}
								placeholder="Optional note (e.g., JRTC rotation)"
							/>
						</Field.Root>
					</div>

					<div class="summary-card" aria-live="polite">
						<h3 class="summary-heading">Ready to apply</h3>
						{#if selection.selectedCount > 0 && selectedStatus && !range.error}
							<div class="summary-line">
								<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
								<span class="summary-copy">
									<strong>{selection.selectedCount}</strong>
									{selection.selectedCount === 1 ? 'person' : 'people'}
									selected
								</span>
							</div>
							<p class="summary-copy">
								{#if startDate === endDate}
									{formatDateDisplay(startDate)}
								{:else}
									{formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
								{/if}
							</p>
						{:else if selection.selectedCount === 0}
							<p class="summary-copy muted">Choose at least one person from the list to enable the bulk update.</p>
						{:else if range.error}
							<p class="summary-copy error">{range.error}</p>
						{/if}
					</div>

					<Button class="apply-button" disabled={!isValid} onclick={handleReview}>Review & Confirm</Button>
				</section>
			</aside>

			<section class="selection-column">
				<RosterPicker {personnelByGroup} {selection} />
			</section>
		</div>
	{:else}
		<div class="confirm-stage">
			<section class="confirm-card">
				<div class="pane-heading confirm-heading">
					<span class="pane-eyebrow">Review</span>
					<h2 class="pane-title">Confirm status change</h2>
					<p class="pane-copy">
						Review exactly who will be affected before applying. Nothing changes until you confirm.
					</p>
				</div>

				<div class="confirm-criteria">
					{#if selectedStatus}
						<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
					{/if}
					<UiBadge variant="outline"
						>{selection.selectedCount} {selection.selectedCount === 1 ? 'person' : 'people'}</UiBadge
					>
					<UiBadge variant="outline">
						{startDate === endDate
							? formatDateDisplay(startDate)
							: `${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`}
					</UiBadge>
					{#if note.trim()}
						<UiBadge variant="outline">Note: {note.trim()}</UiBadge>
					{/if}
				</div>

				<div class="confirm-content">
					<div class="personnel-list">
						{#each selectedPersonnel as person (person.id)}
							<div class="personnel-item">
								<span class="person-rank">{person.rank}</span>
								<span class="person-name">{person.lastName}, {person.firstName}</span>
								{#if person.groupName}
									<span class="person-group">{person.groupName}</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<div class="confirm-footer">
					<Button variant="outline" onclick={handleBack} disabled={isSubmitting}>Back</Button>
					<div class="confirm-footer-fill"></div>
					<Button disabled={isSubmitting} onclick={handleSubmit}>
						{#if isSubmitting}
							<Spinner />
							Applying...
						{:else}
							Confirm Apply
						{/if}
					</Button>
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	.bulk-add-panel {
		padding: 0;
	}

	.bulk-workspace {
		display: grid;
		grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
		gap: 1.5rem;
		align-items: start;
	}

	.controls-column,
	.selection-column {
		min-width: 0;
	}

	.controls-column {
		align-self: start;
		position: sticky;
		top: calc(var(--app-shell-header-height, 56px) + 1.5rem);
	}

	.controls-card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.5rem;
	}

	.pane-heading {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.pane-eyebrow {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.pane-title {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.25rem;
		font-weight: 400;
		line-height: 1.1;
	}

	.pane-copy {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.config-grid {
		display: grid;
		gap: 1rem;
	}

	.date-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		align-items: start;
	}

	.day-count-number {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--accent);
	}

	.date-error {
		color: var(--destructive);
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--destructive) 12%, transparent);
		border-radius: var(--radius);
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: var(--radius);
		background: var(--muted);
		border: 1px solid var(--border);
	}

	.summary-heading {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-foreground);
	}

	.summary-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.summary-copy {
		font-size: 0.75rem;
		color: var(--foreground);
	}

	.summary-copy strong {
		font-weight: 700;
	}

	.summary-copy.muted {
		color: var(--muted-foreground);
	}

	.summary-copy.error {
		color: var(--destructive);
	}

	.person-rank {
		font-weight: 600;
		color: var(--accent);
	}

	/* Confirm stage */
	.confirm-stage {
		padding: 0.5rem 0;
	}

	.confirm-card {
		max-width: 980px;
		margin: 0 auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		overflow: hidden;
	}

	.confirm-heading {
		padding: 1.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--muted);
	}

	.confirm-criteria {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--muted);
	}

	.confirm-content {
		padding: 1.5rem;
		min-height: 120px;
	}

	.personnel-list {
		max-height: 320px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.personnel-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.personnel-item:last-child {
		border-bottom: none;
	}

	.person-name {
		flex: 1;
		font-weight: 500;
	}

	.person-group {
		color: var(--muted-foreground);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.confirm-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--border);
		background: var(--card);
	}

	.confirm-footer-fill {
		flex: 1;
	}

	@media (max-width: 1100px) {
		.bulk-add-panel {
			padding: 0;
		}

		.bulk-workspace {
			grid-template-columns: 1fr;
		}

		.controls-column {
			position: static;
		}
	}

	@media (max-width: 640px) {
		.controls-card {
			padding: 1rem;
		}

		.date-grid {
			grid-template-columns: 1fr;
		}

		.confirm-heading,
		.confirm-content,
		.confirm-criteria,
		.confirm-footer {
			padding-left: 1rem;
			padding-right: 1rem;
		}

		.confirm-footer {
			align-items: flex-start;
		}

		.personnel-item {
			flex-wrap: wrap;
			gap: 0.25rem;
		}
	}
</style>
