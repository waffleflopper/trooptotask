<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { buildGroupTree, type Group, type Personnel, type RankCatalogEntry } from '$features/personnel/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { stillInOrganizationLifetime } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { generateRosterPdf } from '../rosterPdf';
	import type { SignInRoster } from '../sign-in-rosters.types';
	import NewRosterView from './NewRosterView.svelte';
	import RosterListView from './RosterListView.svelte';
	import { NewRoster } from './newRoster.svelte';
	import { RosterList } from './rosterList.svelte';

	interface Props {
		orgId: string;
		orgName: string;
		personnel: Personnel[];
		groups: Group[];
		pinnedGroupIds: readonly string[];
		rankCatalog?: RankCatalogEntry[];
		canEdit: boolean;
		onClose: () => void;
	}

	let {
		orgId,
		orgName,
		personnel,
		groups,
		pinnedGroupIds,
		rankCatalog = undefined,
		canEdit,
		onClose
	}: Props = $props();

	const tree = $derived(buildGroupTree(groups, { pinnedIds: pinnedGroupIds }));
	const list = new RosterList(untrack(() => orgId));
	let draft = $state.raw<NewRoster | null>(null);
	let confirmDiscard = $state(false);
	let confirmDeleteRoster = $state<SignInRoster | null>(null);
	let disposed = false;

	onMount(() => {
		void list.load(true);
		return () => {
			disposed = true;
			list.dispose();
			draft?.dispose();
		};
	});

	function openNew() {
		draft = new NewRoster({
			orgId: untrack(() => orgId),
			personnel: () => personnel,
			tree: () => tree,
			rankCatalog: () => rankCatalog
		});
	}

	function leaveNew() {
		draft?.dispose();
		draft = null;
		confirmDiscard = false;
	}

	function back() {
		if (draft?.dirty) confirmDiscard = true;
		else leaveNew();
	}

	async function saveAndPrint() {
		const saving = draft;
		const saved = await saving?.save();
		if (!saved || draft !== saving) return;
		leaveNew();
		void list.load(true);
		await reprint(saved);
	}

	async function reprint(roster: SignInRoster) {
		const inOrganization = stillInOrganizationLifetime();
		try {
			await generateRosterPdf(roster, tree, groups);
		} catch (err) {
			if (!disposed && inOrganization())
				toastStore.error(err instanceof Error ? err.message : 'Failed to generate PDF');
		}
	}

	async function deleteRoster(roster: SignInRoster) {
		if (await list.deleteRoster(roster)) confirmDeleteRoster = null;
	}
</script>

<AppDialog.Root open voice="editorial" busy={list.busy || !!draft?.saving} closeBlocked={!!draft?.dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		{#if draft}
			<NewRosterView {draft} {personnel} {groups} {tree} {rankCatalog} onBack={back} onSave={saveAndPrint} />
		{:else}
			<RosterListView
				{list}
				{orgName}
				{canEdit}
				onNew={openNew}
				onReprint={reprint}
				onDelete={(roster) => (confirmDeleteRoster = roster)}
			/>
		{/if}
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmDiscard}
	<ConfirmDialog
		title="Discard this roster?"
		message="The title and filters you entered will be lost."
		confirmLabel="Discard"
		cancelLabel="Keep editing"
		onConfirm={leaveNew}
		onCancel={() => (confirmDiscard = false)}
	/>
{/if}

{#if confirmDeleteRoster}
	<ConfirmDialog
		title="Delete Roster"
		message={`Delete "${confirmDeleteRoster.title}"? This removes the saved roster record.`}
		confirmLabel="Delete"
		onConfirm={() => deleteRoster(confirmDeleteRoster!)}
		onCancel={() => {
			confirmDeleteRoster = null;
			list.deleteError = '';
		}}
	>
		{#if list.deleteError}
			<Alert.Root variant="destructive"><Alert.Description>{list.deleteError}</Alert.Description></Alert.Root>
		{/if}
	</ConfirmDialog>
{/if}
