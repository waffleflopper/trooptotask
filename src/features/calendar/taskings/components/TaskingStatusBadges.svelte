<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { taskingAttention, type Tasking } from '../taskingModel';
	import { ATTENTION_BADGES, STATUS_BADGES } from './taskingLabels';

	let { tasking, today }: { tasking: Pick<Tasking, 'status' | 'suspenseOn'>; today: string } = $props();

	const status = $derived(STATUS_BADGES[tasking.status.kind]);
	const attention = $derived.by(() => {
		const kind = taskingAttention(tasking, today);
		return kind ? ATTENTION_BADGES[kind] : null;
	});
</script>

<span class="flex flex-wrap items-center gap-1.5">
	<Badge variant={status.variant}>{status.label}</Badge>
	{#if attention}<Badge variant={attention.variant}>{attention.label}</Badge>{/if}
</span>
