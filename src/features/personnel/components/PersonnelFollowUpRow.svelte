<script lang="ts">
	import { tick } from 'svelte';
	import * as InlineEditRow from '$lib/components/patterns/inline-edit-row';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import type { PersonnelFollowUp } from '../contracts';
	import { dueLabel, formatTimestampDayMonth } from '../logModel';
	import type { FollowUpEdit, FollowUpList } from '../workspace/followUpList.svelte';

	interface Props {
		row: PersonnelFollowUp;
		today: string;
		list: FollowUpList;
		editing: boolean;
		onEdit: () => void;
		onStopEditing: () => void;
	}

	let { row, today, list, editing, onEdit, onStopEditing }: Props = $props();

	let edit = $state<FollowUpEdit>({ title: '', notes: '', dueDate: '' });
	let pending = $state<'save' | 'archive' | null>(null);
	// A save or archive that finishes after its editor closed or reopened must not close the newer editor.
	let session = 0;
	$effect(() => () => session++);
	let titleButton = $state<HTMLElement | null>(null);

	const completed = $derived(row.status === 'completed');
	const due = $derived(dueLabel(row.dueDate, today));
	const error = $derived(list.rowErrors[row.id] ?? '');
	const detail = $derived.by(() => {
		if (completed) {
			const when = row.completedAt ? `Done ${formatTimestampDayMonth(row.completedAt)}` : 'Done';
			return row.completedBy ? `${when} · ${row.completedBy}` : when;
		}
		const excerpt = row.notes.split('\n')[0];
		const author = `${row.createdBy}, ${formatTimestampDayMonth(row.createdAt)}`;
		return excerpt ? `${excerpt} · ${author}` : author;
	});

	function startEdit() {
		session++;
		edit = { title: row.title, notes: row.notes, dueDate: row.dueDate ?? '' };
		onEdit();
	}

	async function stopEditing() {
		session++;
		onStopEditing();
		await tick();
		titleButton?.focus();
	}

	async function save() {
		if (pending) return;
		const mine = session;
		pending = 'save';
		const saved = await list.save(row.id, edit);
		pending = null;
		if (saved && mine === session && editing) await stopEditing();
	}

	async function archive() {
		if (pending) return;
		const mine = session;
		pending = 'archive';
		const archived = await list.archive(row.id);
		pending = null;
		if (archived && mine === session) onStopEditing();
	}

	const focusOnMount = (node: HTMLElement) => node.focus();
</script>

<div class="border-b border-border py-3" data-follow-up-id={row.id}>
	<InlineEditRow.Root
		{editing}
		label={`Edit follow-up ${row.title}`}
		{pending}
		{error}
		onSave={save}
		onCancel={stopEditing}
		onArchive={archive}
	>
		{#snippet display()}
			<div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
				<Checkbox
					class="mt-1"
					checked={completed}
					disabled={list.isBusy(row.id)}
					onCheckedChange={() => list.toggle(row.id)}
					aria-label={completed ? `Reopen ${row.title}` : `Complete ${row.title}`}
				/>
				<div class="grid min-w-0 gap-0.5">
					<InlineEditRow.Trigger bind:ref={titleButton} struck={completed} onclick={startEdit}>
						{row.title}
					</InlineEditRow.Trigger>
					<p class="truncate text-[13px] text-muted-foreground">{detail}</p>
				</div>
				{#if completed}
					<Button
						type="button"
						variant="link"
						size="sm"
						class="h-auto p-0 text-muted-foreground"
						disabled={list.isBusy(row.id)}
						onclick={() => list.toggle(row.id)}
					>
						Reopen
					</Button>
				{:else}
					<p class={cn('mt-0.5 font-mono text-xs', due.overdue ? 'text-destructive-text' : 'text-muted-foreground')}>
						{due.text}
					</p>
				{/if}
			</div>
			{#if error}
				<p role="alert" class="mt-2 pl-7 text-sm text-destructive-text">{error}</p>
			{/if}
		{/snippet}
		{#snippet editor()}
			<Input bind:value={edit.title} aria-label="Follow-up title" {@attach focusOnMount} />
			<Textarea bind:value={edit.notes} rows={2} aria-label="Follow-up notes" placeholder="Notes" />
		{/snippet}
		{#snippet lead()}
			<div class="flex items-center gap-2.5">
				<span class="text-sm text-muted-foreground">Due</span>
				<DatePicker bind:value={edit.dueDate} aria-label="Follow-up due date" placeholder="No due date" class="w-40" />
			</div>
		{/snippet}
	</InlineEditRow.Root>
</div>
