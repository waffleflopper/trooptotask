<script lang="ts">
	import { page } from '$app/state';
	import {
		calendarWorkspaceHydrator,
		setCalendarWorkspaceReady
	} from '$features/calendar/calendarWorkspaceHydration.svelte';
	import {
		CalendarWorkspaceSkeleton,
		type CalendarWorkspaceResult,
		type CalendarWorkspaceRestricted
	} from '$features/calendar';
	import { HeldWorkspace, workspaceScope } from '$lib/utils/heldWorkspace.svelte';
	import WorkspaceAccessRestricted from '../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	const held = new HeldWorkspace<CalendarWorkspaceResult | CalendarWorkspaceRestricted>({
		source: () => data.calendar?.data,
		scope: () => workspaceScope(data.shell),
		fallbackMessage: 'Failed to hydrate calendar workspace',
		hydrate: (calendar) =>
			'access' in calendar
				? calendarWorkspaceHydrator.restrict()
				: calendarWorkspaceHydrator.hydrate(calendar.hydration),
		abandon: () => calendarWorkspaceHydrator.reset()
	});
	const workspace = $derived(held.current);
	setCalendarWorkspaceReady(() => workspace.status === 'ready');
</script>

{#if workspace.status === 'failed'}
	<WorkspaceLoadError subject="Calendar" />
{:else if workspace.status === 'ready' && 'access' in workspace.value}
	<WorkspaceAccessRestricted lane="calendar" level="view" />
{:else if workspace.status !== 'pending' || page.data.ownsWorkspaceLoading}
	{#if workspace.status === 'ready' && workspace.refresh === 'failed'}
		<WorkspaceLoadError subject="Calendar" stale />
	{/if}
	{@render children()}
{:else}
	<CalendarWorkspaceSkeleton shape={page.route?.id === '/org/[orgId]/calendar' ? 'grid' : 'page'} />
{/if}
