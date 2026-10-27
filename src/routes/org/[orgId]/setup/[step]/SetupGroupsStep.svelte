<script lang="ts">
	import { SetupEditorNote, SetupStepFooter } from '$features/organization';
	import { groupsStore, type PersonnelPageContext } from '$features/personnel';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import SetupPersonnelWorkspace from './SetupPersonnelWorkspace.svelte';

	function members(ctx: PersonnelPageContext, groupId: string) {
		return ctx.allActivePersonnel.filter((person) => person.groupId === groupId).length;
	}

	const people = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`;
</script>

<div class="flex flex-col gap-10">
	<SetupEditorNote>
		This is the same Group manager as the Personnel page. Anything you change here is there later, and nothing is locked
		in.
	</SetupEditorNote>

	<section aria-labelledby="setup-groups-heading">
		<SetupPersonnelWorkspace subject="the Group manager">
			{#snippet children(ctx)}
				<PageShell.SectionHeader
					id="setup-groups-heading"
					title="Groups"
					detail={`${groupsStore.items.length} ${groupsStore.items.length === 1 ? 'group' : 'groups'}`}
					size="compact"
					ruled
				>
					{#snippet action()}
						{#if ctx.canManageGroups}
							<Button size="sm" onclick={() => ctx.openGroupEditor(groupsStore.items[0]?.id ?? null)}>
								Manage groups
							</Button>
						{/if}
					{/snippet}
				</PageShell.SectionHeader>
				{#if groupsStore.items.length === 0}
					<p class="border-b py-3 text-sm leading-5 text-muted-foreground">
						No Groups yet. Everyone sits in one roster until you add some.
					</p>
				{:else}
					<ul>
						{#each groupsStore.items as group (group.id)}
							<li class="flex items-center justify-between gap-4 border-b py-2.5">
								{#if ctx.canManageGroups}
									<button
										type="button"
										class="min-w-0 truncate rounded-sm text-left text-sm font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
										onclick={() => ctx.openGroupEditor(group.id)}
									>
										{group.name}
									</button>
								{:else}
									<span class="min-w-0 truncate text-sm font-semibold">{group.name}</span>
								{/if}
								<span class="shrink-0 font-mono text-xs text-muted-foreground">{people(members(ctx, group.id))}</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if !ctx.canManageGroups}
					<p class="pt-3 text-sm leading-5 text-muted-foreground">Your access does not include managing Groups.</p>
				{/if}
			{/snippet}
			{#snippet loading()}
				<div class="grid" aria-busy="true">
					<span class="sr-only">Loading Groups</span>
					<Skeleton class="mb-3 h-8 w-56" aria-hidden="true" />
					{#each { length: 4 }, row (row)}
						<Skeleton class="mt-2 h-8.5 w-full" aria-hidden="true" />
					{/each}
				</div>
			{/snippet}
		</SetupPersonnelWorkspace>
	</section>
</div>

<SetupStepFooter />
