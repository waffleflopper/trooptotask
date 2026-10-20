<script lang="ts">
	import { page } from '$app/state';
	import OrganizationError from '../+error.svelte';
	import WorkspaceAccessRestricted from '../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';
</script>

<!-- Only the report reaches this page; its one 403 is a member without the Critical Tasks view lane. -->
{#if page.status >= 500}
	<WorkspaceLoadError subject="Critical Tasks" />
{:else if page.status === 403}
	<WorkspaceAccessRestricted subject="Critical Tasks" />
{:else}
	<OrganizationError />
{/if}
