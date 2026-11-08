<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { SuggestionPanel } from '$lib/components/patterns/suggestion-panel';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { stillInOrganizationLifetime } from '$lib/stores/core';
	import { mergeById } from '$lib/utils/mergeById';
	import { calendarAssignmentSuggestions, calendarStatusSuggestions } from '../calendarSuggestions';
	import { postCalendarSuggestions } from '../calendarSuggestionsClient';
	import type { CalendarSuggestionsResult } from '../contracts';
	import { dailyAssignmentsStore } from '../stores/dailyAssignments.svelte';
	import { statusTypesStore } from '../stores/statusTypes.svelte';
	import { getCalendarTypeSetup, type CalendarTypeKind } from './calendarTypeSetup';

	let {
		kind,
		settingsLink = true,
		fallback
	}: {
		kind: CalendarTypeKind;
		/** Offer a way to build the types by hand, which the Calendar settings page itself has no use for. */
		settingsLink?: boolean;
		/** Shown when the viewer cannot configure this kind, or every suggestion already exists. */
		fallback: Snippet;
	} = $props();

	type Suggestion = { id: string; name: string; color: string };
	const normalize = (name: string) => name.trim().toLowerCase();

	const setup = getCalendarTypeSetup();
	const current = $derived(setup?.());
	const everything = $derived<readonly Suggestion[]>(
		kind === 'status' ? calendarStatusSuggestions : calendarAssignmentSuggestions
	);
	const savedNames = $derived(
		new Set(
			(kind === 'status' ? statusTypesStore.items : dailyAssignmentsStore.types).map((type) => normalize(type.name))
		)
	);
	const open = $derived(
		current?.canSetUp[kind] ? everything.filter((suggestion) => !savedNames.has(normalize(suggestion.name))) : []
	);
	const unpicked = new SvelteSet<string>();
	const toAdd = $derived(open.filter((suggestion) => !unpicked.has(suggestion.id)));

	const noun = $derived(kind === 'status' ? 'status types' : 'assignment types');
	const addLabel = $derived(
		kind === 'status'
			? `Add ${toAdd.length} ${toAdd.length === 1 ? 'status' : 'statuses'}`
			: `Add ${toAdd.length} assignment ${toAdd.length === 1 ? 'type' : 'types'}`
	);

	let alive = true;
	onDestroy(() => {
		alive = false;
	});
	let saving = $state(false);
	let failure = $state<string | null>(null);

	const catalogOrg = () => (kind === 'status' ? statusTypesStore.orgId : dailyAssignmentsStore.orgId);

	const catalogIds = () =>
		new Set((kind === 'status' ? statusTypesStore.items : dailyAssignmentsStore.types).map(({ id }) => id));

	// Adds only the rows the store had not seen when the save went out, so a type saved or deleted meanwhile stays as
	// the store has it.
	function adopt(result: CalendarSuggestionsResult, orgId: string, before: ReadonlySet<string>) {
		if (kind === 'status') {
			statusTypesStore.load(
				mergeById(
					statusTypesStore.items,
					result.statusTypes.filter(({ id }) => !before.has(id))
				),
				orgId
			);
		} else {
			dailyAssignmentsStore.load(
				mergeById(
					dailyAssignmentsStore.types,
					result.assignmentTypes.filter(({ id }) => !before.has(id))
				),
				dailyAssignmentsStore.assignments,
				orgId
			);
		}
	}

	async function add() {
		const orgUrlSegment = current?.orgUrlSegment;
		const orgId = catalogOrg();
		if (!orgUrlSegment || saving || toAdd.length === 0) return;
		const before = catalogIds();
		// The saved types belong in the shared store even when the picker closed during the save, but never in a later visit.
		const inLifetime = stillInOrganizationLifetime();
		const sameOrg = () => inLifetime() && setup?.().orgUrlSegment === orgUrlSegment && catalogOrg() === orgId;
		const stillHere = () => alive && sameOrg();
		const picked = new Set(toAdd.map((suggestion) => suggestion.id));
		saving = true;
		failure = null;
		try {
			const result = await postCalendarSuggestions(orgUrlSegment, {
				statusIds:
					kind === 'status' ? calendarStatusSuggestions.filter(({ id }) => picked.has(id)).map(({ id }) => id) : [],
				assignmentIds:
					kind === 'assignments'
						? calendarAssignmentSuggestions.filter(({ id }) => picked.has(id)).map(({ id }) => id)
						: []
			});
			// The reply carries the catalog just read back. Loading it keeps the open picker or dialog mounted, which a
			// calendar-data reload would replace with the page skeleton.
			if (orgId && sameOrg()) adopt(result, orgId, before);
			// A partial save leaves the catalog nonempty, which unmounts this offer, so the miss is told in a toast.
			if (sameOrg() && result.failed.length > 0)
				toastStore.error(`${result.failed.map((item) => item.name).join(', ')} could not be added. Try again.`);
		} catch (cause) {
			if (stillHere()) failure = cause instanceof Error ? cause.message : 'Could not add the types. Try again.';
		} finally {
			if (stillHere()) saving = false;
		}
	}
</script>

{#snippet swatch(suggestion: Suggestion)}
	<span class="size-3 shrink-0 rounded-sm" style:background-color={suggestion.color} aria-hidden="true"></span>
{/snippet}

{#if open.length === 0}
	{@render fallback()}
{:else}
	<div class="flex flex-col gap-3">
		<p class="text-sm text-muted-foreground">No {noun} yet. Start from the common ones.</p>
		<SuggestionPanel suggestions={open} {unpicked} detail={swatch}>
			{#if failure}
				<p role="alert" class="text-sm text-destructive-text">{failure}</p>
			{/if}
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<Button disabled={saving || toAdd.length === 0} aria-busy={saving} onclick={add}>
					{#if saving}<Spinner />{/if}
					{addLabel}
				</Button>
				{#if settingsLink && current}
					<Button
						variant="link"
						size="none"
						class="underline"
						href={`/org/${current.orgUrlSegment}/calendar/settings?section=${kind}`}
					>
						Set up {noun} yourself
					</Button>
				{/if}
			</div>
		</SuggestionPanel>
	</div>
{/if}
