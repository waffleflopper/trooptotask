<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { untrack } from 'svelte';

	let {
		initialOpen = true,
		closeBlocked = false,
		longBody = false
	}: {
		initialOpen?: boolean;
		closeBlocked?: boolean;
		longBody?: boolean;
	} = $props();

	let open = $state(untrack(() => initialOpen));
	let closedCount = $state(0);
	let confirmedCount = $state(0);

	function close() {
		open = false;
		closedCount += 1;
	}
</script>

<button type="button" onclick={() => (open = true)}>Open test dialog</button>
<p data-testid="closed-count">{closedCount}</p>
<p data-testid="confirmed-count">{confirmedCount}</p>

{#if open}
	<AppDialog.Root bind:open {closeBlocked} onClose={close}>
		<AppDialog.Content {closeBlocked}>
			<AppDialog.Header>
				<AppDialog.Title>Shared dialog title</AppDialog.Title>
				<AppDialog.Description>Shared dialog description.</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body data-testid="dialog-body">
				{#if longBody}
					{#each Array.from({ length: 20 }) as _, index (index)}
						<p>Scrollable body row {index + 1}</p>
					{/each}
				{:else}
					<p>Standard dialog body.</p>
				{/if}
			</AppDialog.Body>
			<AppDialog.Footer data-testid="dialog-footer">
				<Button variant="outline" onclick={close} disabled={closeBlocked}>Cancel</Button>
				<Button onclick={() => (confirmedCount += 1)} disabled={closeBlocked}>Confirm</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
