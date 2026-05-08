<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Minus from '@lucide/svelte/icons/minus';

	let {
		state,
		label
	}: {
		state: 'complete' | 'incomplete' | 'pending';
		label?: string;
	} = $props();
</script>

<span
	data-slot="onboarding-packet-status-icon"
	class="inline-flex size-5 items-center justify-center text-muted-foreground data-[state=complete]:text-success [&_svg]:size-4"
	data-state={state}
	aria-label={label}
>
	{#if state === 'complete'}
		<Check aria-hidden="true" />
	{:else if state === 'incomplete'}
		<X aria-hidden="true" />
	{:else}
		<Minus aria-hidden="true" />
	{/if}
</span>
