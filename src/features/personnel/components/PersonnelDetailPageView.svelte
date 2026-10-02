<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import PersonnelDetailContent from './PersonnelDetailContent.svelte';

	let props: ComponentProps<typeof PersonnelDetailContent> = $props();
</script>

{#key `${props.orgId}:${props.person.id}`}
	<PersonnelDetailContent {...props} />
{/key}
