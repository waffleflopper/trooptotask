<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AvailabilityEntry } from '$features/calendar/calendar.types';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import PersonStatusModal from '$features/calendar/components/PersonStatusModal.svelte';

	interface Props {
		person: Personnel;
		canEdit: boolean;
	}

	let { person, canEdit }: Props = $props();

	let showStatusModal = $state(false);
	let editingStatus = $state<AvailabilityEntry | undefined>(undefined);

	// Helper to get local date string (YYYY-MM-DD) without timezone issues
	function getLocalDateStr(date: Date = new Date()): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	// Get all statuses for this person (reactive via store.list)
	const personStatuses = $derived(
		availabilityStore.list.filter((e) => e.personnelId === person.id)
	);

	// Get current status (active today)
	const currentStatus = $derived.by(() => {
		const todayStr = getLocalDateStr();
		return personStatuses.find(
			(entry) => entry.startDate <= todayStr && entry.endDate >= todayStr
		);
	});

	// Get upcoming statuses for next 3 months (excluding current)
	const upcomingStatuses = $derived.by(() => {
		const today = new Date();
		const threeMonthsOut = new Date(today);
		threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);

		const todayStr = getLocalDateStr(today);
		const futureStr = getLocalDateStr(threeMonthsOut);

		const current = currentStatus;

		return personStatuses
			.filter((entry) => {
				// Exclude the current status from upcoming
				if (current && entry.id === current.id) return false;
				// Include if end date is today or later AND start date is within 3 months
				return entry.endDate >= todayStr && entry.startDate <= futureStr;
			})
			.sort((a, b) => a.startDate.localeCompare(b.startDate));
	});

	function getStatusTypeName(statusTypeId: string): string {
		const type = statusTypesStore.getById(statusTypeId);
		return type?.name ?? 'Unknown';
	}

	function getStatusTypeColor(statusTypeId: string): string {
		const type = statusTypesStore.getById(statusTypeId);
		return type?.color ?? '#6b7280';
	}

	function getStatusTypeTextColor(statusTypeId: string): string {
		const type = statusTypesStore.getById(statusTypeId);
		return type?.textColor ?? '#ffffff';
	}

	function formatDateRange(startDate: string, endDate: string): string {
		const start = new Date(startDate + 'T00:00:00');
		const end = new Date(endDate + 'T00:00:00');
		const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const endStr = end.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});

		if (startDate === endDate) {
			return startStr + ', ' + start.getFullYear();
		}
		return `${startStr} - ${endStr}`;
	}

	function openNewStatus() {
		editingStatus = undefined;
		showStatusModal = true;
	}

	function openEditStatus(entry: AvailabilityEntry) {
		editingStatus = entry;
		showStatusModal = true;
	}

	function closeStatusModal() {
		showStatusModal = false;
		editingStatus = undefined;
	}
</script>

<div class="leader-card">
	<div class="leader-card-header">
		<h3>Status</h3>
		{#if canEdit}
			<button class="btn btn-sm btn-primary" onclick={openNewStatus}>+ Add</button>
		{/if}
	</div>
	<div class="leader-card-body">
		<!-- Current Status -->
		<div class="current-status-section">
			<h3>Current Status</h3>
			{#if currentStatus}
				<button
					class="current-status-card"
					onclick={() => canEdit && openEditStatus(currentStatus)}
					disabled={!canEdit}
					style="--status-color: {getStatusTypeColor(currentStatus.statusTypeId)}"
				>
					<span
						class="current-status-badge"
						style="background-color: {getStatusTypeColor(
							currentStatus.statusTypeId
						)}; color: {getStatusTypeTextColor(currentStatus.statusTypeId)}"
					>
						{getStatusTypeName(currentStatus.statusTypeId)}
					</span>
					<span class="current-status-dates">
						{formatDateRange(currentStatus.startDate, currentStatus.endDate)}
					</span>
				</button>
			{:else}
				<div class="no-current-status">
					<span>Available / Present for Duty</span>
				</div>
			{/if}
		</div>

		<!-- Upcoming Statuses -->
		<div class="upcoming-statuses-section">
			<div class="statuses-header">
				<h3>Upcoming (Next 3 Months)</h3>
				<span class="status-count"
					>{upcomingStatuses.length}
					{upcomingStatuses.length === 1 ? 'status' : 'statuses'}</span
				>
			</div>

			{#if upcomingStatuses.length > 0}
				<div class="statuses-list">
					{#each upcomingStatuses as entry (entry.id)}
						<button
							class="status-card"
							onclick={() => canEdit && openEditStatus(entry)}
							disabled={!canEdit}
						>
							<div class="status-card-header">
								<span
									class="status-type-badge"
									style="background-color: {getStatusTypeColor(
										entry.statusTypeId
									)}; color: {getStatusTypeTextColor(entry.statusTypeId)}"
								>
									{getStatusTypeName(entry.statusTypeId)}
								</span>
							</div>
							<div class="status-dates">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
									<line x1="16" y1="2" x2="16" y2="6" />
									<line x1="8" y1="2" x2="8" y2="6" />
									<line x1="3" y1="10" x2="21" y2="10" />
								</svg>
								{formatDateRange(entry.startDate, entry.endDate)}
							</div>
						</button>
					{/each}
				</div>
			{:else}
				<div class="empty-state small">
					<p>No upcoming statuses scheduled.</p>
				</div>
			{/if}
		</div>
	</div>
</div>

{#if showStatusModal}
	<PersonStatusModal {person} existingEntry={editingStatus} onClose={closeStatusModal} />
{/if}

<style>
	.current-status-section {
		margin-bottom: var(--spacing-xl);
	}

	.current-status-section h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--spacing-sm);
	}

	.current-status-card {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border: 2px solid var(--status-color);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
	}

	.current-status-card:hover:not(:disabled) {
		box-shadow: var(--shadow-2);
	}

	.current-status-card:disabled {
		cursor: default;
	}

	.current-status-badge {
		padding: var(--spacing-xs) var(--spacing-md);
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: var(--font-size-base);
	}

	.current-status-dates {
		font-size: var(--font-size-base);
		color: var(--color-text);
	}

	.no-current-status {
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-bg);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
		color: var(--color-text-muted);
		font-style: italic;
	}

	.upcoming-statuses-section {
		border-top: 1px solid var(--color-border);
		padding-top: var(--spacing-lg);
	}

	.statuses-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.statuses-header h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	.status-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.statuses-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.status-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.status-card:hover:not(:disabled) {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-2);
	}

	.status-card:disabled {
		cursor: default;
	}

	.status-card-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.status-type-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.status-dates {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.status-dates svg {
		width: 16px;
		height: 16px;
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
	}

	.empty-state.small {
		padding: var(--spacing-lg);
	}

	.empty-state.small p {
		margin: 0;
	}
</style>
