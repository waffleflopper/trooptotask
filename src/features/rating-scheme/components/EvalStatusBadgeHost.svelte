<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import EvalStatusBadge from './EvalStatusBadge.svelte';

	let props: ComponentProps<typeof EvalStatusBadge> = $props();
</script>

<Tooltip.Provider>
	<EvalStatusBadge {...props} />
</Tooltip.Provider>
