<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { getSetupFlow, SetupEditorNote, SetupStepFooter } from '$features/organization';
	import { GroupStructureEditor, groupsStore, type PersonnelPageContext } from '$features/personnel';
	import { buildGroupTree } from '$features/personnel/contracts';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import SetupPersonnelWorkspace from './SetupPersonnelWorkspace.svelte';

	const tree = $derived(buildGroupTree(groupsStore.items));
	const memberCounts = (ctx: PersonnelPageContext) =>
		tree.subtreeCounts(ctx.allActivePersonnel, (person) => person.groupId);
	const indent = ['', 'pl-5', 'pl-10'];

	const people = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`;
	const groupCount = (count: number) => `${count} ${count === 1 ? 'group' : 'groups'}`;

	const flow = getSetupFlow();
	const EXAMPLES = [
		{ name: 'HQ Section', bar: 'w-16' },
		{ name: '1st Platoon', bar: 'w-24' },
		{ name: '2nd Platoon', bar: 'w-21' },
		{ name: 'Maintenance Section', bar: 'w-12' }
	];
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
					detail={groupCount(groupsStore.items.length)}
					size="compact"
					ruled
				>
					{#snippet action()}
						{#if ctx.canManageGroups && groupsStore.items.length > 0}
							<Button size="sm" onclick={() => ctx.openGroupEditor(tree.roots[0]?.id ?? null)}>
								Manage groups
							</Button>
						{/if}
					{/snippet}
				</PageShell.SectionHeader>
				{#if groupsStore.items.length === 0}
					<div class="@container flex items-center gap-12 border-b pt-9 pb-8 max-sm:pt-6">
						<div class="grid flex-1 gap-3">
							<h3 class="font-heading text-[28px] leading-[30px] font-bold">Split the roster the way you run it</h3>
							<p class="max-w-100 text-[15px] leading-[22px] text-muted-foreground">
								Add a Group for each platoon or section. People go into them when you add your roster in the Personnel
								step.
							</p>
							{#if ctx.canManageGroups}
								<div class="flex items-center gap-5 pt-2 max-sm:flex-col max-sm:items-stretch max-sm:gap-4">
									<Button size="lg" onclick={() => ctx.openGroupEditor(null)}>
										<PlusIcon data-icon="inline-start" aria-hidden="true" />
										Add your Groups
									</Button>
									<Button
										variant="link"
										size="none"
										class="text-sm font-normal underline"
										onclick={() => flow.continue()}
									>
										Skip, keep one roster
									</Button>
								</div>
							{/if}
						</div>
						<div class="w-85 shrink-0 @max-2xl:hidden">
							<p
								id="setup-groups-examples"
								class="pb-2.5 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
							>
								For example
							</p>
							<ul aria-labelledby="setup-groups-examples">
								{#each EXAMPLES as example (example.name)}
									<li
										class="flex h-10 items-center gap-2.5 border-t border-dashed border-muted-foreground/40 px-3 last:border-b"
									>
										<span
											class="flex-1 font-heading text-[17px] leading-5 font-bold tracking-[0.02em] text-muted-foreground uppercase"
										>
											{example.name}
										</span>
										<span class="h-1.5 shrink-0 rounded-[3px] bg-border {example.bar}" aria-hidden="true"></span>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				{:else if ctx.canManageGroups}
					<div class="border-b">
						<GroupStructureEditor {ctx} />
					</div>
				{:else}
					{@const counts = memberCounts(ctx)}
					<ul aria-label="Groups">
						{#each tree.ordered as group (group.id)}
							<li class="flex items-center justify-between gap-4 border-b py-2.5 {indent[group.level] ?? 'pl-10'}">
								<span class="min-w-0 truncate text-sm font-semibold">{group.name}</span>
								<span class="shrink-0 font-mono text-xs text-muted-foreground">{people(counts.get(group.id) ?? 0)}</span
								>
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

<SetupStepFooter
	note={groupsStore.items.length === 0
		? '0 groups · everyone in one roster'
		: `${groupCount(groupsStore.items.length)} · changes save as you make them`}
/>
