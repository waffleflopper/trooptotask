<script lang="ts">
	import { page } from '$app/state';
	import OrganizationError from '../+error.svelte';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';
</script>

{#if page.status >= 500}
	<WorkspaceLoadError subject="Critical Tasks" />
{:else}
	<OrganizationError />
{/if}
