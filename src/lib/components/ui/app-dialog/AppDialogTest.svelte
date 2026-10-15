<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { untrack } from 'svelte';

	let {
		initialOpen = true,
		initialBusy = false,
		presentation
	}: {
		initialOpen?: boolean;
		initialBusy?: boolean;
		presentation?: 'dialog' | 'sheet';
	} = $props();

	let open = $state(untrack(() => initialOpen));
	let busy = $state(untrack(() => initialBusy));
	let draft = $state('');
	let closedCount = $state(0);
	let confirmedCount = $state(0);
	let submitted = $state(false);

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
	<AppDialog.Root bind:open {busy} closeBlocked={draft !== ''} onClose={close}>
		<AppDialog.Content {presentation}>
			<AppDialog.Header>
				<AppDialog.Title>Shared dialog title</AppDialog.Title>
				<AppDialog.Description>Shared dialog description.</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				<p>Standard dialog body.</p>
				<input aria-label="Draft" bind:value={draft} />
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button variant="outline" onclick={close} disabled={busy}>Cancel</Button>
				<Button onclick={() => (confirmedCount += 1)} disabled={busy}>Confirm</Button>
				<Button onclick={() => (busy = true)} disabled={busy}>Save slowly</Button>
				<Button onclick={() => (submitted = true)} disabled={submitted}>Submit once</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
