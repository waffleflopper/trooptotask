<script lang="ts">
	import type { StatusType } from '$features/calendar/contracts';
	import StatusBar from '../calendar-bars/StatusBar.svelte';

	let { value }: { value: { status: StatusType; text: string } } = $props();
</script>

<StatusBar
	status={value.status}
	label={{ kind: 'one-day', text: value.text }}
	size="compact"
	class="h-4 w-8 shrink-0 justify-center"
	aria-hidden="true"
/>
