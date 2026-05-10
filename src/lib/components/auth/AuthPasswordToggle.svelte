<script lang="ts">
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		visible: boolean;
		onclick: () => void;
	}

	let { visible, onclick }: Props = $props();
</script>

<Button
	type="button"
	variant="ghost"
	size="icon-sm"
	class="absolute top-1/2 right-1 -translate-y-1/2 border-0 text-muted-foreground shadow-none hover:text-foreground"
	{onclick}
	aria-label={visible ? 'Hide password' : 'Show password'}
>
	{#if visible}
		<EyeOffIcon aria-hidden="true" />
	{:else}
		<EyeIcon aria-hidden="true" />
	{/if}
</Button>
