<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatRosterDate, pluralize } from './settingsWorkspaceFormatters';
	import type {
		OrganizationSettingsWorkspace,
		SettingsArchivedPersonnelRow
	} from './organizationSettingsWorkspaceModel';

	let {
		section,
		restoring,
		exportingPerson,
		onRestore,
		onExport,
		onConfirmPermanentDelete
	}: {
		section: OrganizationSettingsWorkspace['sections']['archivedPersonnel'];
		restoring: string | null;
		exportingPerson: string | null;
		onRestore: (id: string) => void;
		onExport: (id: string, name: string) => void;
		onConfirmPermanentDelete: (person: SettingsArchivedPersonnelRow) => void;
	} = $props();

	const archivedPersonnel = $derived(section.rows);
</script>

<div class="grid gap-4">
	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="archived-records-heading"
	>
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h3 id="archived-records-heading" class="text-lg font-semibold tracking-tight">Archived Records</h3>
				<p class="text-sm text-muted-foreground">
					Records pending automatic deletion. Restore, export, or purge early.
				</p>
			</div>
			<Badge variant="outline">
				{archivedPersonnel.length}
				{pluralize('Record', archivedPersonnel.length)} · {section.retention.months} mo retention
			</Badge>
		</div>

		<div class="overflow-x-auto rounded-md border" role="region" aria-label="Archived personnel records">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>MOS</Table.Head>
						<Table.Head>Group</Table.Head>
						<Table.Head>Archived</Table.Head>
						<Table.Head>Auto-delete</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each archivedPersonnel as row (row.id)}
						<Table.Row>
							<Table.Cell class="font-medium">{row.rank} {row.lastName}, {row.firstName}</Table.Cell>
							<Table.Cell>{row.mos || '--'}</Table.Cell>
							<Table.Cell>{row.groupName || '--'}</Table.Cell>
							<Table.Cell>{formatRosterDate(row.archivedAt)}</Table.Cell>
							<Table.Cell><Badge variant="outline">{section.retention.months} mo</Badge></Table.Cell>
							<Table.Cell>
								<div class="flex justify-end gap-2">
									<Button
										size="sm"
										onclick={() => onRestore(row.id)}
										disabled={!section.commands.canRestore || restoring === row.id}
									>
										{#if restoring === row.id}<Spinner />{/if}
										Restore
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() => onExport(row.id, row.exportFileStem)}
										disabled={!section.commands.canExport || exportingPerson === row.id}
									>
										{exportingPerson === row.id ? 'Exporting...' : 'Export'}
									</Button>
									<Button
										variant="destructive"
										size="sm"
										onclick={() => onConfirmPermanentDelete(row)}
										disabled={!section.commands.canPermanentlyDelete}
									>
										Delete
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={6} class="text-center text-muted-foreground"
								>No archived personnel records.</Table.Cell
							>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</section>
</div>
