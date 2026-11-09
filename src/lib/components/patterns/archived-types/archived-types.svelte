<script lang="ts" module>
	export type ArchivedTypeRow = { id: string; name: string; archivedAt: string };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { CatalogUsageView } from '$lib/stores/core/catalogUsage.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';

	let {
		title,
		types,
		usage,
		recordNoun,
		onOpen,
		onRestore,
		onDelete,
		leading
	}: {
		/** The section's name, such as "Archived training types". The count follows it. */
		title: string;
		types: ArchivedTypeRow[];
		/** How many records each type has. A type can be deleted only once this says none. */
		usage: CatalogUsageView;
		/** What the counted records are called, such as `{ one: 'record', many: 'records' }`. */
		recordNoun: { one: string; many: string };
		/** Called each time the section opens, so the counts are read fresh. */
		onOpen: () => void;
		/** Restores the type. The owner reports a failure; the row is busy until this settles. */
		onRestore: (id: string) => Promise<void>;
		/** Asks to delete a type that has no records. The owner confirms and deletes. */
		onDelete: (id: string) => void;
		/** What marks the row, such as the type's color. */
		leading?: Snippet<[ArchivedTypeRow]>;
	} = $props();

	const headingId = $props.id();
	let open = $state(false);
	let restoringId = $state<string | null>(null);

	function toggle(next: boolean) {
		open = next;
		if (next) onOpen();
	}

	async function restore(id: string) {
		if (restoringId) return;
		restoringId = id;
		try {
			await onRestore(id);
		} finally {
			restoringId = null;
		}
	}

	function countText(count: number): string {
		return `${count} ${count === 1 ? recordNoun.one : recordNoun.many}`;
	}
</script>

<Collapsible.Root {open} onOpenChange={toggle} class="rounded-md border">
	<Collapsible.Trigger
		class="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-start font-mono text-xs font-semibold tracking-widest uppercase outline-none focus-visible:underline"
	>
		<ChevronRight aria-hidden="true" class="size-4 shrink-0 transition-transform {open ? 'rotate-90' : ''}" />
		<span id={headingId}>{title}</span>
		<span class="text-muted-foreground">{types.length}</span>
	</Collapsible.Trigger>
	<Collapsible.Content>
		<div class="border-t">
			{#if usage.status === 'error'}
				<Alert.Root variant="destructive" role="alert" class="m-3 w-auto">
					<Alert.Description class="flex flex-wrap items-center gap-x-3 gap-y-1 text-current">
						<span>Could not load how many {recordNoun.many} each type has. Restore still works.</span>
						<Button variant="outline" size="sm" onclick={onOpen}>Try again</Button>
					</Alert.Description>
				</Alert.Root>
			{/if}
			<ul class="divide-y" aria-labelledby={headingId}>
				{#each types as type (type.id)}
					{@const count = usage.countFor(type.id)}
					<li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
						{@render leading?.(type)}
						<div class="flex min-w-32 flex-1 flex-col">
							<span class="truncate text-sm font-medium">{type.name}</span>
							<span
								class="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
							>
								Archived {formatDisplayDate(type.archivedAt)}
								{#if usage.status === 'loading' || usage.status === 'idle'}
									· <Skeleton class="h-3 w-16" aria-hidden="true" />
								{:else if count !== null}
									· {countText(count)}
								{/if}
							</span>
						</div>
						<div class="ml-auto flex shrink-0 items-center gap-2">
							{#if count === 0}
								<Button
									variant="ghost-destructive"
									size="sm"
									disabled={restoringId !== null}
									aria-label="Delete {type.name}"
									onclick={() => onDelete(type.id)}
								>
									Delete
								</Button>
							{/if}
							<Button
								variant="outline"
								size="sm"
								disabled={restoringId !== null}
								aria-label="Restore {type.name}"
								onclick={() => restore(type.id)}
							>
								{#if restoringId === type.id}<Spinner />{/if}Restore
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</Collapsible.Content>
</Collapsible.Root>
