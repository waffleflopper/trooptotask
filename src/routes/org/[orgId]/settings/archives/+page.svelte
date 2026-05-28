<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import ArchivedPersonnelSettingsSection from '../ArchivedPersonnelSettingsSection.svelte';
	import { downloadBlob } from '../settingsDownloads';
	import { createSettingsArchivedPersonnelState } from '../settingsWorkspaceState.svelte';

	let { data }: PageProps = $props();

	const orgId = $derived($page.params.orgId);
	const archivedPersonnelState = createSettingsArchivedPersonnelState(
		() => data.archivesSettings.sections.archivedPersonnel
	);
	const archivedPersonnelSection = $derived({
		rows: archivedPersonnelState.rows,
		retention: archivedPersonnelState.retention,
		commands: archivedPersonnelState.commands
	});
	let restoring = $state<string | null>(null);
	let exportingPerson = $state<string | null>(null);
	let permanentlyDeletingPerson = $state<string | null>(null);

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
		if (permanentlyDeletingPerson === id) return;
		permanentlyDeletingPerson = id;
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/permanent`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error();
			toastStore.success('Personnel permanently deleted');
			archivedPersonnelState.clearPermanentDeleteConfirmation();
			await invalidateAll();
		} catch {
			toastStore.error('Failed to permanently delete');
		} finally {
			permanentlyDeletingPerson = null;
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

<ArchivedPersonnelSettingsSection
	section={archivedPersonnelSection}
	{restoring}
	{exportingPerson}
	onRestore={handleRestore}
	onExport={handlePersonnelExport}
	onConfirmPermanentDelete={(person) => archivedPersonnelState.openPermanentDeleteConfirmation(person)}
/>

{#if archivedPersonnelState.confirmPermanentDelete}
	<AppDialog.Root
		open={Boolean(archivedPersonnelState.confirmPermanentDelete)}
		onClose={() => archivedPersonnelState.clearPermanentDeleteConfirmation()}
	>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Permanently Delete Personnel</AppDialog.Title>
				<AppDialog.Description>
					Permanently delete {archivedPersonnelState.confirmPermanentDelete.name}. This action cannot be undone.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				<div class="grid gap-2">
					<Label for="confirmPermanentDeletePersonnel">Type the name to confirm</Label>
					<Input
						id="confirmPermanentDeletePersonnel"
						type="text"
						bind:value={archivedPersonnelState.permanentDeleteConfirmText}
						autocomplete="off"
					/>
				</div>
			</AppDialog.Body>
			<AppDialog.Footer>
				{@const deleteInFlight = permanentlyDeletingPerson === archivedPersonnelState.confirmPermanentDelete.id}
				<Button
					type="button"
					variant="outline"
					disabled={deleteInFlight}
					onclick={() => archivedPersonnelState.clearPermanentDeleteConfirmation()}>Cancel</Button
				>
				<Button
					type="button"
					variant="destructive"
					disabled={deleteInFlight || !archivedPersonnelState.permanentDeleteConfirmMatches}
					onclick={() => handlePermanentDelete(archivedPersonnelState.confirmPermanentDelete!.id)}
				>
					{deleteInFlight ? 'Deleting...' : 'Permanently Delete'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
