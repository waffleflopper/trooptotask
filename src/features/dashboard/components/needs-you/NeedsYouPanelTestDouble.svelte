<script lang="ts">
	import type { NeedsYouPanelProps } from '../../sections/needsYou';

	let { save, saving, failure, close, command }: NeedsYouPanelProps & { command: () => Promise<void> } = $props();
</script>

<section aria-label="Test panel">
	{#if failure}<p>Panel says: {failure}</p>{/if}
	<button type="button" data-needs-you-submit disabled={saving} onclick={() => save(command).catch(() => {})}
		>Save panel</button
	>
	<button type="button" onclick={close}>Close panel</button>
</section>
