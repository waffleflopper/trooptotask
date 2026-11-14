<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	const org = getAppShellContext();
	import { Spinner } from '$lib/components/ui/spinner';
	import BulkStatusPage from '$features/calendar/components/BulkStatusPage.svelte';
	import type { CalendarWorkspaceResult, CalendarWorkspaceRestricted } from '$features/calendar';
	import { HeldWorkspace, workspaceScope } from '$lib/utils/heldWorkspace.svelte';
	import { materializeWorkspaceData } from '$lib/utils/streamedRouteData';

	let { data } = $props();
	const held = new HeldWorkspace<CalendarWorkspaceResult | CalendarWorkspaceRestricted>({
		source: () => data.calendar?.data,
		scope: () => workspaceScope(data.shell),
		fallbackMessage: 'Failed to load bulk status workspace'
	});
	const calendarBootstrap = $derived(held.value && !('access' in held.value) ? held.value : null);
	const resolvedData = $derived.by(() => materializeWorkspaceData(data, 'calendar', calendarBootstrap));

	const pageData = $derived.by(() => ({
		orgId: data.shell.org.id,
		orgName: data.shell.org.name,
		disabledFeatures: data.shell.org.disabledFeatures,
		calendar: resolvedData.calendar ? { data: resolvedData.calendar.data } : undefined
	}));
</script>

<svelte:head>
	<title>Bulk Status Operations - Troop to Task</title>
</svelte:head>

{#if held.current.status === 'failed'}
	<!-- The Calendar layout observes this same source and shows WorkspaceLoadError. -->
{:else if held.current.status === 'pending'}
	<section class="flex items-center justify-center gap-2 p-6 text-muted-foreground" aria-live="polite" role="status">
		<Spinner />
		<p class="m-0">Loading bulk status operations...</p>
	</section>
{:else}
	<BulkStatusPage {org} data={pageData} />
{/if}
