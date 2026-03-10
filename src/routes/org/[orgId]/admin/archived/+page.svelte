<script lang="ts">
	import { page } from '$app/stores';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	const orgId = $derived($page.params.orgId);

	let restoring = $state<string | null>(null);
	let permanentlyDeleting = $state<string | null>(null);
	let exporting = $state<string | null>(null);
	let confirmPermanentDelete = $state<{ id: string; name: string } | null>(null);

	function daysUntilAutoDelete(archivedAt: string, retentionMonths: number): number {
		const archiveDate = new Date(archivedAt);
		const deleteDate = new Date(archiveDate);
		deleteDate.setMonth(deleteDate.getMonth() + retentionMonths);
		return Math.max(0, Math.ceil((deleteDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatCountdown(days: number): string {
		if (days <= 0) return 'Overdue';
		if (days < 30) return `${days} days`;
		const months = Math.floor(days / 30);
		return `${months} month${months !== 1 ? 's' : ''}`;
	}

	async function handleRestore(id: string) {
		restoring = id;
		try {
			const res = await fetch(`/org/${orgId}/api/personnel`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'restore', id })
			});
			if (!res.ok) {
				const errData = await res.json();
				toastStore.error(errData.message ?? 'Failed to restore');
				return;
			}
			toastStore.success('Personnel restored to active status');
			await invalidateAll();
		} catch {
			toastStore.error('Failed to restore personnel');
		} finally {
			restoring = null;
		}
	}

	async function handlePermanentDelete(id: string) {
		permanentlyDeleting = id;
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/permanent`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error();
			toastStore.success('Personnel permanently deleted');
			confirmPermanentDelete = null;
			await invalidateAll();
		} catch {
			toastStore.error('Failed to permanently delete');
		} finally {
			permanentlyDeleting = null;
		}
	}

	async function handleExport(id: string, name: string) {
		exporting = id;
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/${id}/export`);
			if (!res.ok) throw new Error();
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${name}-records.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			toastStore.error('Failed to export records');
		} finally {
			exporting = null;
		}
	}
</script>

<div class="archived-page">
	<div class="page-header">
		<h2>Archived Personnel</h2>
		<p class="header-description">
			Archived personnel are retained for {data.retentionMonths} months before automatic permanent
			deletion.
		</p>
	</div>

	{#if data.archivedPersonnel.length === 0}
		<EmptyState message="No archived personnel." />
	{:else}
		<div class="table-wrapper">
			<table class="archived-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>MOS</th>
						<th>Group</th>
						<th>Archived</th>
						<th>Auto-Delete</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.archivedPersonnel as person (person.id)}
						{@const days = daysUntilAutoDelete(person.archivedAt, data.retentionMonths)}
						{@const countdownClass =
							days <= 0 ? 'overdue' : days < 30 ? 'critical' : days < 90 ? 'warning' : ''}
						<tr>
							<td class="name-cell">
								{person.rank}
								{person.lastName}, {person.firstName}
							</td>
							<td>{person.mos || '--'}</td>
							<td>{person.groupName || '--'}</td>
							<td>{formatDate(person.archivedAt)}</td>
							<td>
								<span class="countdown {countdownClass}">
									{formatCountdown(days)}
								</span>
							</td>
							<td class="actions-cell">
								<button
									class="btn btn-primary btn-sm"
									onclick={() => handleRestore(person.id)}
									disabled={restoring === person.id}
								>
									{#if restoring === person.id}<Spinner />{/if}
									Restore
								</button>
								<button
									class="btn btn-secondary btn-sm"
									onclick={() =>
										handleExport(person.id, `${person.rank}-${person.lastName}`)}
									disabled={exporting === person.id}
								>
									{#if exporting === person.id}<Spinner />{/if}
									Export
								</button>
								<button
									class="btn btn-danger btn-sm"
									onclick={() =>
										(confirmPermanentDelete = {
											id: person.id,
											name: `${person.rank} ${person.lastName}, ${person.firstName}`
										})}
								>
									Delete
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

{#if confirmPermanentDelete}
	<ConfirmDialog
		title="Permanently Delete Personnel"
		message="Are you sure you want to permanently delete {confirmPermanentDelete.name}? This action cannot be undone and all associated records will be lost."
		confirmLabel="Permanently Delete"
		variant="danger"
		onConfirm={() => handlePermanentDelete(confirmPermanentDelete!.id)}
		onCancel={() => (confirmPermanentDelete = null)}
	/>
{/if}

<style>
	.archived-page {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.page-header h2 {
		margin: 0 0 var(--spacing-xs) 0;
		font-size: var(--font-size-lg);
	}

	.header-description {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.table-wrapper {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.archived-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.archived-table th {
		text-align: left;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
		font-weight: 600;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
	}

	.archived-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
		vertical-align: middle;
	}

	.archived-table tbody tr:last-child td {
		border-bottom: none;
	}

	.archived-table tbody tr:hover {
		background: var(--color-surface-variant);
	}

	.name-cell {
		font-weight: 500;
		white-space: nowrap;
	}

	.actions-cell {
		white-space: nowrap;
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
	}

	.countdown {
		font-weight: 500;
	}

	.countdown.critical {
		color: var(--color-error);
	}

	.countdown.warning {
		color: var(--color-warning);
	}

	.countdown.overdue {
		color: var(--color-error);
		font-weight: 700;
	}
</style>
