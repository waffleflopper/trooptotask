<script lang="ts">
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import type { RosterQuickEdit } from './quickEdit.svelte';

	interface Props {
		edit: RosterQuickEdit;
	}

	let { edit }: Props = $props();

	const prompt = $derived(edit.prompt);
	const who = $derived.by(() => {
		const opening = edit.session?.opening;
		return opening ? `${opening.rank} ${opening.lastName}, ${opening.firstName}` : 'this Person';
	});
</script>

{#if prompt?.kind === 'discard'}
	<ConfirmDialog
		title="Discard changes?"
		message="Your unsaved changes to {who} will be lost."
		confirmLabel="Discard"
		variant="default"
		onConfirm={() => edit.decideDiscard(true)}
		onCancel={() => edit.decideDiscard(false)}
	/>
{:else if prompt?.kind === 'data-sheet'}
	<ConfirmDialog
		title="Save changes first?"
		message="You changed {who}. The Data sheet opens the saved record, so save these changes first or discard them."
		confirmLabel="Save and open"
		alternateLabel="Discard and open"
		variant="default"
		onConfirm={() => edit.decideDataSheet('save')}
		onAlternate={() => edit.decideDataSheet('discard')}
		onCancel={() => edit.decideDataSheet('cancel')}
	/>
{:else if prompt?.kind === 'leave'}
	<ConfirmDialog
		title="Save changes first?"
		message="You changed {who}. Save these changes before leaving, or discard them."
		confirmLabel="Save and leave"
		alternateLabel="Discard and leave"
		variant="default"
		onConfirm={() => edit.decideLeave('save')}
		onAlternate={() => edit.decideLeave('discard')}
		onCancel={() => edit.decideLeave('cancel')}
	/>
{/if}
