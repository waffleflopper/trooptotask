<script lang="ts">
	import { tick } from 'svelte';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import { formatWeekdayDayMonth } from '../../logModel';
	import {
		dueChipLabel,
		dueDatePresets,
		selectedPreset,
		type AlreadyOpen,
		type ComposerEntry,
		type ComposerKind
	} from '../../rosterComposer';
	import { followUpDraftSpec, leaderNoteDraftSpec } from '../../workspace/personnelArtifactDraftSpecs';

	interface Props {
		/** Who the entry is for: a name now, a count when the bulk bar passes many people. */
		heading: string;
		/** The viewer's day; due presets count from it. */
		today: string;
		alreadyOpen: AlreadyOpen;
		/** Writes the entry. A rejection keeps the composer open and shows its message. */
		onsave: (entry: ComposerEntry) => Promise<void>;
		onclose: () => void;
	}

	let { heading, today, alreadyOpen, onsave, onclose }: Props = $props();

	let kind = $state<ComposerKind>('follow-up');
	let title = $state('');
	let details = $state('');
	let due = $state('');
	let noteText = $state('');
	let saving = $state(false);
	let failure = $state('');
	let issue = $state('');
	let confirmingDiscard = $state(false);
	let titleField = $state<HTMLInputElement | null>(null);
	let noteField = $state<HTMLTextAreaElement | null>(null);
	let keepEditing = $state<HTMLButtonElement | null>(null);

	const presets = $derived(dueDatePresets(today));
	const activePreset = $derived(selectedPreset(presets, due || null));
	const typed = $derived(kind === 'follow-up' ? title.trim() || details.trim() : noteText.trim());
	const anyText = $derived(Boolean(title.trim() || details.trim() || noteText.trim()));

	$effect(() => {
		void kind;
		void tick().then(() => (kind === 'follow-up' ? titleField : noteField)?.focus());
	});

	/** Closes now when nothing was typed, else asks first. False while it waits on the answer or on a save. */
	export function requestClose(): boolean {
		if (saving) return false;
		if (!anyText) {
			onclose();
			return true;
		}
		confirmingDiscard = true;
		void tick().then(() => keepEditing?.focus());
		return false;
	}

	function chooseDue(date: string): void {
		due = due === date ? '' : date;
	}

	async function save(): Promise<void> {
		if (saving || confirmingDiscard) return;
		const invalid =
			kind === 'follow-up'
				? followUpDraftSpec.validate({ title, notes: details, dueDate: due })
				: leaderNoteDraftSpec.validate({ text: noteText });
		issue = invalid?.message ?? '';
		if (invalid) return;
		failure = '';
		saving = true;
		try {
			await onsave(
				kind === 'follow-up'
					? { kind, title: title.trim(), notes: details.trim(), dueDate: due || null }
					: { kind, text: noteText.trim() }
			);
		} catch (caught) {
			failure = caught instanceof Error ? caught.message : 'Unable to save.';
		} finally {
			saving = false;
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		void save();
	}
</script>

<!-- A form, so Enter in the title saves; Cmd/Ctrl+Enter saves from any field. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	class="flex flex-col"
	novalidate
	onsubmit={(event) => {
		event.preventDefault();
		void save();
	}}
	onkeydown={handleKeydown}
>
	<header class="flex items-center justify-between gap-3 border-b px-4 pt-3.5 pb-3">
		<div class="grid min-w-0 gap-0.5">
			<span class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Add to log</span>
			<span class="truncate font-heading text-xl leading-6 font-bold uppercase">{heading}</span>
		</div>
		<SegmentedFilter.Root
			label="Entry type"
			bind:value={kind}
			options={[
				{ value: 'note', label: 'Note' },
				{ value: 'follow-up', label: 'Follow-up' }
			]}
		/>
	</header>

	<div class="grid gap-2.5 px-4 py-3.5">
		{#if kind === 'follow-up'}
			<Field.Root data-invalid={issue ? true : undefined}>
				<Field.Label for="roster-composer-title" class="sr-only">Follow-up title</Field.Label>
				<Input
					id="roster-composer-title"
					bind:ref={titleField}
					bind:value={title}
					placeholder="What needs to happen?"
					maxlength={200}
					autocomplete="off"
					oninput={() => (issue = '')}
				/>
				{#if issue}<Field.Error>{issue}</Field.Error>{/if}
			</Field.Root>
			<Field.Root>
				<Field.Label for="roster-composer-details" class="sr-only">Details</Field.Label>
				<Textarea
					id="roster-composer-details"
					bind:value={details}
					placeholder="Details (optional)"
					rows={2}
					maxlength={2000}
				/>
			</Field.Root>
			<div class="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby="roster-composer-due">
				<span id="roster-composer-due" class="w-9 shrink-0 text-sm text-muted-foreground">Due</span>
				{#each presets as preset (preset.key)}
					{@const active = activePreset === preset.key}
					<Button
						type="button"
						size="sm"
						variant={active ? 'default' : 'outline'}
						class="font-mono text-xs"
						aria-pressed={active}
						title={formatWeekdayDayMonth(preset.date)}
						onclick={() => chooseDue(preset.date)}
					>
						{dueChipLabel(preset)}
					</Button>
				{/each}
				{#if due && !activePreset}
					<Button
						type="button"
						size="sm"
						class="font-mono text-xs"
						aria-pressed="true"
						title="Clear the due date"
						onclick={() => (due = '')}
					>
						{formatWeekdayDayMonth(due)}
					</Button>
				{/if}
				<DatePicker iconOnly aria-label="Choose a due date" bind:value={due} />
			</div>
			{#if alreadyOpen.kind !== 'none'}
				<div class="flex items-baseline gap-x-1.5 pt-1 text-[13px] leading-[18px]">
					<span class="shrink-0 font-mono text-[11px] tracking-[0.06em] uppercase">Already open</span>
					{#if alreadyOpen.kind === 'pending'}
						<Skeleton class="h-3 w-40 self-center" />
					{:else}
						<span class="min-w-0 text-muted-foreground">{alreadyOpen.title} · {alreadyOpen.due}</span>
						{#if alreadyOpen.overdue}<span class="shrink-0 text-danger-foreground">· overdue</span>{/if}
						{#if alreadyOpen.more > 0}<span class="shrink-0 text-muted-foreground">· +{alreadyOpen.more} more</span
							>{/if}
					{/if}
				</div>
			{/if}
		{:else}
			<Field.Root data-invalid={issue ? true : undefined}>
				<Field.Label for="roster-composer-note" class="sr-only">Note</Field.Label>
				<Textarea
					id="roster-composer-note"
					bind:ref={noteField}
					bind:value={noteText}
					placeholder="What did you observe?"
					rows={4}
					maxlength={4000}
					oninput={() => (issue = '')}
				/>
				{#if issue}<Field.Error>{issue}</Field.Error>{/if}
			</Field.Root>
		{/if}
		{#if failure}
			<Field.Error>{failure}</Field.Error>
		{/if}
	</div>

	<footer class="flex items-center justify-between gap-3 rounded-b-lg border-t bg-muted px-4 pt-2.5 pb-3">
		{#if confirmingDiscard}
			<span class="text-sm" role="alert">Discard what you typed?</span>
			<span class="flex gap-1.5">
				<Button
					type="button"
					size="sm"
					variant="outline"
					bind:ref={keepEditing}
					onclick={() => (confirmingDiscard = false)}>Keep editing</Button
				>
				<Button type="button" size="sm" variant="destructive" onclick={onclose}>Discard</Button>
			</span>
		{:else}
			<span class="font-mono text-[11px] text-muted-foreground max-sm:hidden">⌘↵ save · Esc close</span>
			<span class="flex gap-1.5 max-sm:ml-auto">
				<Button type="button" size="sm" variant="outline" disabled={saving} onclick={requestClose}>Cancel</Button>
				<Button type="submit" size="sm" disabled={saving || !typed}>
					{saving ? 'Saving…' : kind === 'follow-up' ? 'Add follow-up' : 'Add note'}
				</Button>
			</span>
		{/if}
	</footer>
</form>
