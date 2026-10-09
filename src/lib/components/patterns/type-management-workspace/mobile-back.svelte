<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import type { ComponentProps } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = ComponentProps<typeof Button>;

	let { children, ...restProps }: Props = $props();
</script>

<div data-slot="type-management-workspace-mobile-back" class="lg:hidden">
	<Button variant="outline" size="sm" type="button" {...restProps}>
		<ArrowLeft aria-hidden="true" />
		{@render children?.()}
	</Button>
</div>
