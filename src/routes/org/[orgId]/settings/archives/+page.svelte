<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import ArchivedPersonnelSettingsSection from '../ArchivedPersonnelSettingsSection.svelte';
	import SettingsActivityRail from '../SettingsActivityRail.svelte';
	import { downloadBlob } from '../settingsDownloads';
	import { createSettingsWorkspaceState } from '../settingsWorkspaceState.svelte';

	let { data } = $props();

	const orgId = $derived($page.params.orgId);
	const settingsState = createSettingsWorkspaceState(() => data.workspace);
	const archivedPersonnelSection = $derived({
		rows: settingsState.archivedPersonnel.rows,
		retention: settingsState.archivedPersonnel.retention,
		commands: settingsState.archivedPersonnel.commands
	});
	const dataExportSection = $derived(settingsState.dataExport.section);
	let restoring = $state<string | null>(null);
	let exportingPerson = $state<string | null>(null);

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
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/permanent`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error();
			toastStore.success('Personnel permanently deleted');
			settingsState.archivedPersonnel.clearPermanentDeleteConfirmation();
			await invalidateAll();
		} catch {
			toastStore.error('Failed to permanently delete');
		}
	}

	async function handlePersonnelExport(id: string, name: string) {
		exportingPerson = id;
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/${id}/export`);
			if (!res.ok) throw new Error();
			const blob = await res.blob();
			downloadBlob(blob, `${name}-records.xlsx`);
		} catch {
			toastStore.error('Failed to export records');
		} finally {
			exportingPerson = null;
		}
	}
</script>

<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
	<ArchivedPersonnelSettingsSection
		section={archivedPersonnelSection}
		{restoring}
		{exportingPerson}
		onRestore={handleRestore}
		onExport={handlePersonnelExport}
		onConfirmPermanentDelete={(person) => settingsState.archivedPersonnel.openPermanentDeleteConfirmation(person)}
	/>
	<SettingsActivityRail orgId={data.orgUrlSegment} activity={dataExportSection.activity} lockedTab="approvals" />
</div>

{#if settingsState.archivedPersonnel.confirmPermanentDelete}
	<AppDialog.Root
		open={Boolean(settingsState.archivedPersonnel.confirmPermanentDelete)}
		onClose={() => settingsState.archivedPersonnel.clearPermanentDeleteConfirmation()}
	>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Permanently Delete Personnel</AppDialog.Title>
				<AppDialog.Description>
					Permanently delete {settingsState.archivedPersonnel.confirmPermanentDelete.name}. This action cannot be
					undone.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				<div class="grid gap-2">
					<Label for="confirmPermanentDeletePersonnel">Type the name to confirm</Label>
					<Input
						id="confirmPermanentDeletePersonnel"
						type="text"
						bind:value={settingsState.archivedPersonnel.permanentDeleteConfirmText}
						autocomplete="off"
					/>
				</div>
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button
					type="button"
					variant="outline"
					onclick={() => settingsState.archivedPersonnel.clearPermanentDeleteConfirmation()}>Cancel</Button
				>
				<Button
					type="button"
					variant="destructive"
					disabled={!settingsState.archivedPersonnel.permanentDeleteConfirmMatches}
					onclick={() => handlePermanentDelete(settingsState.archivedPersonnel.confirmPermanentDelete!.id)}
				>
					Permanently Delete
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
