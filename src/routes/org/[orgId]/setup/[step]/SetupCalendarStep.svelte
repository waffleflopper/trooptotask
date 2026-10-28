<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { getAppShellContext } from '$features/app-shell';
	import {
		calendarSettingsSaving,
		dailyAssignmentsStore,
		statusTypesStore,
		type CalendarWorkspaceRestricted,
		type CalendarWorkspaceResult
	} from '$features/calendar';
	import CalendarSettingsPage from '$features/calendar/components/CalendarSettingsPage.svelte';
	import { calendarWorkspaceHydrator } from '$features/calendar/calendarWorkspaceHydration.svelte';
	import { calendarAssignmentSuggestions, calendarStatusSuggestions } from '$features/calendar/contracts';
	import { getSetupFlow, SetupEditorNote, SetupStepFooter, SetupSuggestionPanel } from '$features/organization';
	import type { RankCatalogEntry } from '$features/personnel/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import SetupEditorLoadError from './SetupEditorLoadError.svelte';

	const org = getAppShellContext();
	const flow = getSetupFlow();
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

	// Statuses and assignments added here change setup's counts, so the Done page rereads them once the write lands.
	const sizes = $derived(
		view === 'ready' && !saving ? `${statusTypesStore.items.length}:${dailyAssignmentsStore.types.length}` : null
	);
	let seen: string | null = null;
	$effect(() => {
		if (sizes === null) return;
		if (seen !== null && seen !== sizes) void invalidate('app:organization-setup');
		seen = sizes;
	});

	type Pick = { id: string; name: string; color: string; catalog: 'status' | 'assignment' };
	// The endpoint needs status configure for any pick, and assignment configure for Staff Duty as well.
	const canStatuses = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.configureStatusTypes).allowed
	);
	const canAssignments = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes).allowed
	);
	const picks = $derived<Pick[]>(
		canStatuses
			? [
					...calendarStatusSuggestions.map((suggestion) => ({ ...suggestion, catalog: 'status' as const })),
					...(canAssignments
						? calendarAssignmentSuggestions.map((suggestion) => ({ ...suggestion, catalog: 'assignment' as const }))
						: [])
				]
			: []
	);
	const normalize = (name: string) => name.trim().toLowerCase();
	const savedNames = $derived({
		status: new Set(statusTypesStore.items.map((type) => normalize(type.name))),
		assignment: new Set(dailyAssignmentsStore.types.map((type) => normalize(type.name)))
	});
	const open = $derived(
		view === 'ready' ? picks.filter((pick) => !savedNames[pick.catalog].has(normalize(pick.name))) : []
	);
	const unpicked = new SvelteSet<string>();
	const toAdd = $derived(open.filter((pick) => !unpicked.has(pick.id)));
	// Setup's counts predict the rows a loading panel holds. Until they arrive it assumes a new unit, where every pick
	// shows.
	const placeholderRows = $derived.by(() => {
		const facts = flow.facts;
		if (!facts || facts.statusTypes.status !== 'ready' || facts.assignmentTypes.status !== 'ready') return picks.length;
		return Math.max(0, picks.length - facts.statusTypes.value - facts.assignmentTypes.value);
	});

	async function save() {
		const picked = toAdd;
		const result = await flow.addCalendarSuggestions({
			statusIds: picked.filter((pick) => pick.catalog === 'status').map((pick) => pick.id),
			assignmentIds: picked.filter((pick) => pick.catalog === 'assignment').map((pick) => pick.id)
		});
		if (!result) return;
		// A reread, not the reply's rows, so an editor change saved while this was pending isn't overwritten.
		await invalidate('app:calendar-data');
		if (result.failed.length > 0) {
			throw new Error(`${result.failed.map((item) => item.name).join(', ')} could not be added. Try again.`);
		}
	}

	const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	const footer = $derived.by(() => {
		if (saving) return { blocked: 'Saving your change…' };
		if (toAdd.length > 0) {
			const statuses = toAdd.filter((pick) => pick.catalog === 'status').length;
			const assignments = toAdd.length - statuses;
			const adds = [
				statuses && count(statuses, 'status', 'statuses'),
				assignments && count(assignments, 'assignment', 'assignments')
			];
			return {
				save,
				continueLabel: `Add ${toAdd.length} and continue`,
				note: `Adds ${adds.filter(Boolean).join(' and ')}`
			};
		}
		if (view === 'loading' && placeholderRows > 0) {
			return { continueLabel: `Add ${placeholderRows} and continue`, blocked: 'Checking your Calendar settings' };
		}
		return {};
	});
</script>

{#snippet pickDetail(pick: Pick)}
	<span class="flex shrink-0 items-center gap-2 font-mono text-xs leading-4 text-muted-foreground">
		{pick.catalog === 'status' ? 'Status' : 'Assignment'}
		<span class="size-3 rounded-sm" style:background-color={pick.color} aria-hidden="true"></span>
	</span>
{/snippet}

<div class="flex flex-col gap-10">
	<SetupEditorNote>
		These are the same status and assignment editors as Calendar settings. Anything you change here is there later, and
		nothing is locked in.
	</SetupEditorNote>
	{#if open.length > 0 || (view === 'loading' && placeholderRows > 0)}
		<SetupSuggestionPanel
			title="Common statuses and assignments"
			suggestions={open}
			{unpicked}
			loading={view === 'loading'}
			loadingLabel="Checking your Calendar settings"
			{placeholderRows}
			detail={pickDetail}
		>
			<p class="pt-1 text-sm leading-5 text-muted-foreground">
				Names and colors can be changed in the editors below, or in Calendar settings later.
			</p>
		</SetupSuggestionPanel>
	{/if}
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

<SetupStepFooter {...footer} />
