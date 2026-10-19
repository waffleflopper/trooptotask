<script lang="ts">
	import { untrack } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import type { PersonnelFollowUp } from '../contracts';
	import { groupFollowUps } from '../logModel';
	import { FollowUpList } from '../workspace/followUpList.svelte';
	import PersonnelFollowUpRow from './PersonnelFollowUpRow.svelte';

	interface Props {
		orgId: string;
		personnelId: string;
		today: string;
		logHref: string;
		initial: PersonnelFollowUp[];
	}

	let { orgId, personnelId, today, logHref, initial }: Props = $props();

	const SHOWN = 3;
	const list = untrack(
		() => new FollowUpList(initial, { orgId, personnelId, fetch: (input, init) => fetch(input, init) })
	);
	// The rows shown when the section opens stay in place, so a row completed here stays struck
	// through with Reopen instead of vanishing under the leader's pointer. The next open rows fill in below.
	const pinnedIds = untrack(() =>
		groupFollowUps(initial, today)
			.open.slice(0, SHOWN)
			.map((row) => row.id)
	);
	const groups = $derived(groupFollowUps(list.rows, today));
	const shown = $derived.by(() => {
		const pinned = pinnedIds.flatMap((id) => list.rows.find((row) => row.id === id) ?? []);
		const stillOpen = pinned.filter((row) => row.status === 'open').length;
		const fill = groups.open.filter((row) => !pinnedIds.includes(row.id)).slice(0, SHOWN - stillOpen);
		return [...pinned, ...fill];
	});
	let editingId = $state<string | null>(null);
</script>

<PageShell.SectionHeader
	size="compact"
	title="Open follow-ups"
	detail={groups.open.length > 0
		? `${groups.open.length} open${groups.overdue > 0 ? ` · ${groups.overdue} overdue` : ''}`
		: undefined}
>
	{#snippet action()}
		<a href={logHref} class="text-sm underline underline-offset-2">Open log</a>
	{/snippet}
</PageShell.SectionHeader>

<div class="border-t border-border">
	{#each shown as row (row.id)}
		<PersonnelFollowUpRow
			{row}
			{today}
			{list}
			editing={editingId === row.id}
			onEdit={() => (editingId = row.id)}
			onStopEditing={() => {
				if (editingId === row.id) editingId = null;
			}}
		/>
	{:else}
		<p class="py-4 text-sm text-muted-foreground">No open follow-ups.</p>
	{/each}
</div>
