<script lang="ts">
	import { PACKET_EYEBROW, PACKET_ROW_COLUMNS } from './layout';
</script>

<div
	aria-hidden="true"
	data-slot="onboarding-packet-header"
	class={[
		'hidden items-center gap-4 border-b border-l-3 border-foreground border-l-transparent px-3.5 py-2.5 md:flex',
		PACKET_EYEBROW
	]}
>
	<span class={['grid min-w-0 flex-1 gap-4', PACKET_ROW_COLUMNS]}>
		<span>Soldier</span>
		<span>Template</span>
		<span>Dates</span>
		<span class="text-right">Took</span>
		<span class="text-right">Final</span>
		<span>Outcome</span>
	</span>
	<span class="size-4 shrink-0"></span>
</div>
