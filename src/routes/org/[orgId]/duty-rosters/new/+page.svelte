<script lang="ts">
	import DutyRosterTemplateWorkspace from '$features/duty-roster/components/DutyRosterTemplateWorkspace.svelte';

	let { data, form } = $props();
</script>

<DutyRosterTemplateWorkspace {data} {form} />
