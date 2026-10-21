<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
</script>

<!-- One row at its loaded height and column widths; the consumer repeats it inside its list. -->
<div class="@container/attention-row border-b border-l-[3px] border-b-border border-l-border" aria-hidden="true">
	<div
		class="grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 pl-4 @2xl/attention-row:grid-cols-[84px_minmax(0,1fr)_96px_172px]"
	>
		<Skeleton class="h-3 w-16" />
		<div class="grid gap-1.5 @max-2xl/attention-row:order-3">
			<Skeleton class="h-4 w-[55%]" />
			<Skeleton class="h-3.5 w-[35%]" />
		</div>
		<Skeleton class="ml-auto h-3 w-14 @max-2xl/attention-row:order-2" />
		<Skeleton class="ml-auto h-8 w-7 @max-2xl/attention-row:order-4" />
	</div>
</div>
