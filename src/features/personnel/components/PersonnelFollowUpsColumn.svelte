<script lang="ts">
	import { untrack } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import * as InputGroup from '$lib/components/ui/input-group';
	import type { PersonnelFollowUp } from '../contracts';
	import { groupFollowUps } from '../logModel';
	import { FollowUpList } from '../workspace/followUpList.svelte';
	import PersonnelFollowUpRow from './PersonnelFollowUpRow.svelte';

	interface Props {
		orgId: string;
		personnelId: string;
		today: string;
		initial: PersonnelFollowUp[];
		focusAdd: boolean;
		editingKey: string | null;
		onEditingKey: (key: string | null) => void;
	}

	let { orgId, personnelId, today, initial, focusAdd, editingKey, onEditingKey }: Props = $props();

	const COMPLETED_PREVIEW = 2;
	const list = untrack(
		() => new FollowUpList(initial, { orgId, personnelId, fetch: (input, init) => fetch(input, init) })
	);
	const groups = $derived(groupFollowUps(list.rows, today));
	let showAllCompleted = $state(false);
	const completedShown = $derived(showAllCompleted ? groups.completed : groups.completed.slice(0, COMPLETED_PREVIEW));
	let titleInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (focusAdd) titleInput?.focus();
	});

	const keyOf = (id: string) => `follow-up:${id}`;
	const finishEdit = (key: string) => {
		if (editingKey === key) onEditingKey(null);
	};
</script>

<PageShell.SectionHeader
	eyebrow="Follow-ups"
	title={`${groups.open.length} open`}
	detail={groups.overdue > 0 ? `${groups.overdue} overdue` : undefined}
	detailTone="destructive"
/>

<form
	class="mt-3.5"
	onsubmit={(event) => {
		event.preventDefault();
		void list.draft.submit();
	}}
>
	<InputGroup.Root class="h-11">
		<InputGroup.Addon><PlusIcon aria-hidden="true" /></InputGroup.Addon>
		<InputGroup.Input
			bind:ref={titleInput}
			bind:value={list.draft.fields.title}
			aria-label="Follow-up title"
			aria-invalid={list.draft.fieldError('title') ? 'true' : undefined}
			aria-describedby={list.draft.fieldError('title') ? 'follow-up-quick-add-error' : undefined}
			placeholder="Add a follow-up…"
		/>
		<InputGroup.Addon align="inline-end">
			<DatePicker bind:value={list.draft.fields.dueDate} aria-label="Follow-up due date" placeholder="Due date" />
		</InputGroup.Addon>
	</InputGroup.Root>
	{#if list.draft.fieldError('title')}
		<Field.Error id="follow-up-quick-add-error" class="mt-2">{list.draft.fieldError('title')}</Field.Error>
	{/if}
	{#if list.draft.error}
		<Alert.Root variant="destructive" class="mt-2"><Alert.Description>{list.draft.error}</Alert.Description></Alert.Root
		>
	{/if}
</form>

<div class="mt-2">
	{#each groups.open as row (row.id)}
		<PersonnelFollowUpRow
			{row}
			{today}
			{list}
			editing={editingKey === keyOf(row.id)}
			onEdit={() => onEditingKey(keyOf(row.id))}
			onStopEditing={() => finishEdit(keyOf(row.id))}
		/>
	{:else}
		<p class="py-6 text-sm text-muted-foreground">No open follow-ups.</p>
	{/each}

	{#if groups.completed.length > 0}
		<div class="flex items-baseline justify-between gap-3 pt-5 pb-1">
			<h3 class="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				Completed · {groups.completed.length}
			</h3>
			{#if groups.completed.length > COMPLETED_PREVIEW}
				<Button
					type="button"
					variant="link"
					size="sm"
					class="h-auto p-0"
					aria-expanded={showAllCompleted}
					onclick={() => (showAllCompleted = !showAllCompleted)}
				>
					{showAllCompleted ? 'Show fewer' : 'Show all'}
				</Button>
			{/if}
		</div>
		{#each completedShown as row (row.id)}
			<PersonnelFollowUpRow
				{row}
				{today}
				{list}
				editing={editingKey === keyOf(row.id)}
				onEdit={() => onEditingKey(keyOf(row.id))}
				onStopEditing={() => finishEdit(keyOf(row.id))}
			/>
		{/each}
	{/if}
</div>
