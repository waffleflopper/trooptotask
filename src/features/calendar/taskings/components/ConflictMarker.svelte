<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { conflictLabel } from '../taskingRowModel';

	let { people }: { people: number } = $props();
</script>

<!-- A conflict asks someone to look, so it is amber like other attention, never red. -->
<span
	class="inline-flex shrink-0 items-center gap-0.5 font-mono text-xs font-semibold text-accent-text"
	role="img"
	aria-label={conflictLabel(people)}
	title={conflictLabel(people)}
>
	<TriangleAlert class="size-3.5" aria-hidden="true" />{people}
</span>
