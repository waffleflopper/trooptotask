<script lang="ts">
	import { page } from '$app/state';
	import { getAppShellContext } from '$features/app-shell';
	import {
		calendarSettingsSaving,
		type CalendarWorkspaceRestricted,
		type CalendarWorkspaceResult
	} from '$features/calendar';
	import CalendarSettingsPage from '$features/calendar/components/CalendarSettingsPage.svelte';
	import { calendarWorkspaceHydrator } from '$features/calendar/calendarWorkspaceHydration.svelte';
	import { SetupEditorNote, SetupStepFooter } from '$features/organization';
	import type { RankCatalogEntry } from '$features/personnel/contracts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import SetupEditorLoadError from './SetupEditorLoadError.svelte';

	const org = getAppShellContext();
	const streamed = $derived(
		page.data.calendar as { data: Promise<CalendarWorkspaceResult | CalendarWorkspaceRestricted> } | undefined
	);
	const rankCatalog = $derived(
		(page.data.rankCatalog as { data: Promise<readonly RankCatalogEntry[]> } | undefined)?.data ?? Promise.resolve([])
	);

	let view = $state<'loading' | 'ready' | 'restricted' | 'failed'>('loading');
	let stale = $state(false);
	const saving = $derived(calendarSettingsSaving());

	// The same hydration the Calendar layout runs, so the settings editors read the stores they always read.
	$effect(() => {
		const source = streamed;
		let cancelled = false;
		const stop = hydrateStreamedWorkspace<CalendarWorkspaceResult | CalendarWorkspaceRestricted>({
			streamedWorkspace: source,
			fallbackMessage: 'Failed to load the calendar settings',
			hydrate: async (calendar) => {
				if ('access' in calendar) {
					calendarWorkspaceHydrator.restrict();
					if (!cancelled) view = 'restricted';
					return;
				}
				await calendarWorkspaceHydrator.hydrate(calendar.hydration);
				if (!cancelled) {
					view = 'ready';
					stale = false;
				}
			},
			onReject: () => {
				if (cancelled) return;
				if (view === 'ready') stale = true;
				else view = 'failed';
			}
		});
		return () => {
			cancelled = true;
			stop();
		};
	});
	$effect(() => () => calendarWorkspaceHydrator.reset());
</script>

<div class="flex flex-col gap-10">
	<SetupEditorNote>
		These are the same status and assignment editors as Calendar settings. Anything you change here is there later, and
		nothing is locked in.
	</SetupEditorNote>
	{#if view === 'ready'}
		{#if stale}
			<SetupEditorLoadError subject="Calendar settings" stale />
		{/if}
		<CalendarSettingsPage {org} {rankCatalog} embedded />
	{:else if view === 'failed'}
		<SetupEditorLoadError subject="Calendar settings" />
	{:else if view === 'restricted'}
		<p class="text-sm leading-5 text-muted-foreground">Your access does not include the Calendar.</p>
	{:else}
		<div aria-busy="true">
			<span class="sr-only">Loading Calendar settings</span>
			<Skeleton class="h-[600px] w-full rounded-md" aria-hidden="true" />
		</div>
	{/if}
</div>

<SetupStepFooter blocked={saving ? 'Saving your change…' : null} />
