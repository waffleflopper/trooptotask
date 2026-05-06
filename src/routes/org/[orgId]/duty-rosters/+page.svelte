<script lang="ts">
	import DutyRosterRoutePage from './DutyRosterRoutePage.svelte';

	let { data, form } = $props();
</script>

<DutyRosterRoutePage {data} {form} />
