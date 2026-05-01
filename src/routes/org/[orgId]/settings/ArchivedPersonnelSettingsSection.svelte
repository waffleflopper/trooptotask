<script lang="ts">
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { formatRosterDate, pluralize } from './settingsWorkspaceFormatters';

	type ArchivedPerson = {
		id: string;
		rank: string;
		firstName: string;
		lastName: string;
		mos: string | null;
		groupName: string | null;
		archivedAt: string;
	};

	let {
		archivedPersonnel,
		retentionMonths,
		restoring,
		exportingPerson,
		onRestore,
		onExport,
		onConfirmPermanentDelete
	}: {
		archivedPersonnel: ArchivedPerson[];
		retentionMonths: number;
		restoring: string | null;
		exportingPerson: string | null;
		onRestore: (id: string) => void;
		onExport: (id: string, name: string) => void;
		onConfirmPermanentDelete: (person: { id: string; name: string }) => void;
	} = $props();
</script>

<div class="archived-tab">
	<section class="ledger-section" aria-labelledby="archived-records-heading">
		<div class="ledger-heading">
			<span>01</span>
			<h3 id="archived-records-heading">Archived Records</h3>
			<p class="state-label">
				{archivedPersonnel.length}
				{pluralize('Record', archivedPersonnel.length)} · {retentionMonths} mo retention
			</p>
		</div>

		<div class="archived-records-table" role="region" aria-label="Archived personnel records">
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>MOS</th>
						<th>Group</th>
						<th>Archived</th>
						<th>Auto-delete</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each archivedPersonnel as row (row.id)}
						<tr>
							<td class="name-cell">{row.rank} {row.lastName}, {row.firstName}</td>
							<td>{row.mos || '--'}</td>
							<td>{row.groupName || '--'}</td>
							<td>{formatRosterDate(row.archivedAt)}</td>
							<td><span class="retention-pill">{retentionMonths} mo</span></td>
							<td>
								<div class="archived-actions">
									<button
										class="btn btn-primary btn-sm"
										onclick={() => onRestore(row.id)}
										disabled={restoring === row.id}
									>
										{#if restoring === row.id}<Spinner />{/if}
										Restore
									</button>
									<button
										class="member-action"
										onclick={() => onExport(row.id, `${row.rank}-${row.lastName}`)}
										disabled={exportingPerson === row.id}
									>
										{exportingPerson === row.id ? 'Exporting...' : 'Export'}
									</button>
									<button
										class="member-action member-action--danger"
										onclick={() =>
											onConfirmPermanentDelete({
												id: row.id,
												name: `${row.rank} ${row.lastName}, ${row.firstName}`
											})}
									>
										Delete
									</button>
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="archived-empty">No archived personnel records.</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
