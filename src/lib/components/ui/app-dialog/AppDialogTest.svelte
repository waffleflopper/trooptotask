<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { untrack } from 'svelte';

	let {
		initialOpen = true,
		closeBlocked = false
	}: {
		initialOpen?: boolean;
		closeBlocked?: boolean;
	} = $props();

	let open = $state(untrack(() => initialOpen));
	let busy = $state(untrack(() => closeBlocked));
	let closedCount = $state(0);
	let confirmedCount = $state(0);

	function close() {
		open = false;
		closedCount += 1;
	}
</script>

<button type="button" onclick={() => (open = true)}>Open test dialog</button>
<button type="button" onclick={() => (busy = false)}>Finish work</button>
<p data-testid="closed-count">{closedCount}</p>
<p data-testid="confirmed-count">{confirmedCount}</p>

{#if open}
	<AppDialog.Root bind:open closeBlocked={busy} onClose={close}>
		<AppDialog.Content closeBlocked={busy}>
			<AppDialog.Header>
				<AppDialog.Title>Shared dialog title</AppDialog.Title>
				<AppDialog.Description>Shared dialog description.</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				<p>Standard dialog body.</p>
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button variant="outline" onclick={close} disabled={busy}>Cancel</Button>
				<Button onclick={() => (confirmedCount += 1)} disabled={busy}>Confirm</Button>
				<Button onclick={() => (busy = true)} disabled={busy}>Save slowly</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
