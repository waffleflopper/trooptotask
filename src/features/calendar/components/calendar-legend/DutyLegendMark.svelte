<script lang="ts">
	import AssignmentCodeChip from '../AssignmentCodeChip.svelte';

	let { value }: { value: { code: string; color: string } } = $props();
</script>

<AssignmentCodeChip code={value.code} color={value.color} />
