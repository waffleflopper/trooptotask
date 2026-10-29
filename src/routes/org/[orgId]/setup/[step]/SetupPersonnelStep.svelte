<script lang="ts">
	import { page } from '$app/state';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { getSetupFlow, SetupStepFooter } from '$features/organization';
	import {
		createPersonnelImportLane,
		groupsStore,
		retainImportDodIds,
		rosterStore,
		type PersonnelPageContext
	} from '$features/personnel';
	import type { PersonnelDodId } from '$features/personnel/contracts';
	import { ImportFlow } from '$lib/components/patterns/import-flow';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import SetupPersonnelWorkspace from './SetupPersonnelWorkspace.svelte';
	import SetupEditorLoadError from './SetupEditorLoadError.svelte';

	const flow = getSetupFlow();

	// The roster store is live after an import or an added person; the setup facts catch up on their next read.
	const activePeople = $derived.by(() => {
		if (rosterStore.orgId === page.data.orgId && !rosterStore.loading) {
			return rosterStore.items.filter((person) => !person.archivedAt).length;
		}
		return flow.facts?.activePeople.status === 'ready' ? flow.facts.activePeople.value : null;
	});

	const importIds = retainImportDodIds(() => ({ orgId: page.data.orgId, streamed: page.data.personnelImport }));

	function lane(ctx: PersonnelPageContext, dodIds: readonly PersonnelDodId[]) {
		const base = createPersonnelImportLane({
			orgId: ctx.orgId,
			orgUrlSegment: ctx.orgUrlSegment,
			personnel: ctx.allActivePersonnel,
			dodIds,
			groups: groupsStore.orgId === ctx.orgId ? groupsStore.items : [],
			rankCatalog: ctx.data.rankCatalog ?? [],
			canManageGroups: ctx.canManageGroups,
			allowUnassigned: ctx.allowUnassignedPersonnel
		});
		return {
			...base,
			exit: { href: flow.href(flow.next?.slug ?? 'done'), label: `Continue to ${flow.next?.title ?? 'Done'}` }
		};
	}

	/** Leaving with nobody on the roster, or before the count loads, records Later; people on it make the step Done. */
	async function save() {
		if (!activePeople) await flow.answer('personnel', 'later');
	}
</script>

<div class="flex flex-col gap-10">
	<SetupPersonnelWorkspace subject="the roster">
		{#snippet children(ctx)}
			{#if ctx.canAddPersonnel}
				<section
					class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b-2 border-foreground pb-4"
					aria-labelledby="setup-add-person-heading"
				>
					<div class="grid max-w-xl gap-1">
						<h2 id="setup-add-person-heading" class="font-heading text-[22px] leading-[26px] font-bold">
							A handful of people?
						</h2>
						<p class="text-sm leading-5">Add them one at a time. It's the same form as the Personnel page.</p>
					</div>
					<Button variant="outline" onclick={() => ctx.handleAdd()}>
						<PlusIcon data-icon="inline-start" aria-hidden="true" />
						Add a person
					</Button>
				</section>
			{/if}
			{#if ctx.canImportPersonnel}
				{#if importIds.current?.state === 'failed'}
					<SetupEditorLoadError subject="Personnel import" />
				{:else if importIds.current?.state !== 'denied'}
					{#if importIds.current?.state === 'ready' && importIds.current.stale}
						<SetupEditorLoadError subject="Personnel import" stale />
					{/if}
					<ImportFlow
						lane={importIds.current?.state === 'ready' ? lane(ctx, importIds.current.dodIds) : null}
						title="Import your roster"
						embedded
					/>
				{/if}
			{:else if !ctx.canAddPersonnel}
				<p class="text-sm leading-5 text-muted-foreground">Your access does not include adding people.</p>
			{/if}
		{/snippet}
		{#snippet loading()}
			<div class="@container grid gap-10" aria-busy="true">
				<span class="sr-only">Loading the roster</span>
				<Skeleton class="h-16 w-full" aria-hidden="true" />
				<div class="grid gap-6" aria-hidden="true">
					<Skeleton class="h-8 w-64" />
					<div class="grid gap-6 @min-[42rem]:grid-cols-[minmax(0,1fr)_20rem]">
						<Skeleton class="h-64 w-full" />
						<Skeleton class="h-64 w-full" />
					</div>
				</div>
			</div>
		{/snippet}
	</SetupPersonnelWorkspace>
</div>

<SetupStepFooter
	{save}
	note={activePeople === null ? undefined : `${activePeople} ${activePeople === 1 ? 'person' : 'people'} so far`}
/>
