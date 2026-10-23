<script lang="ts">
	import { tick } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { Answer } from './types';
	import type { RailQuestion } from './rowModel';

	const RADIO_LIMIT = 6;

	let {
		question,
		creating,
		noun,
		onAnswer,
		onCreate
	}: {
		question: RailQuestion;
		creating: boolean;
		noun: string;
		onAnswer: (answer: Answer | null) => void;
		onCreate: (name: string) => Promise<{ refused: string } | null>;
	} = $props();

	const uid = $props.id();
	const id = `rail-${uid}`;
	const accepts = $derived(question.accepts);
	const options = $derived.by(() => {
		if (accepts.kind !== 'pick') return [];
		const suggested = accepts.options.find((option) => option.id === accepts.suggested);
		return suggested ? [suggested, ...accepts.options.filter((option) => option !== suggested)] : accepts.options;
	});
	const skipOnly = $derived(accepts.kind === 'pick' && options.length === 0);
	let choice = $derived(accepts.kind === 'pick' ? (accepts.suggested ?? '') : '');
	let createName = $derived(question.subject);
	let createOpen = $state(false);
	let createError = $state<string | null>(null);
	let card = $state<HTMLElement | null>(null);
	let createInput = $state<HTMLInputElement | null>(null);

	async function settle(answer: Answer | null) {
		onAnswer(answer);
		await tick();
		card?.focus();
	}

	const answered = $derived.by(() => {
		const answer = question.answer;
		if (!answer) return null;
		if (answer.kind === 'skip') return 'Skipped';
		if (answer.kind === 'fill') return answer.value;
		const option = options.find((item) => item.id === answer.optionId);
		return option ? [option.label, option.hint].filter(Boolean).join(' · ') : null;
	});

	function apply() {
		if (!choice) return;
		void settle(accepts.kind === 'pick' ? { kind: 'pick', optionId: choice } : { kind: 'fill', value: choice });
	}

	async function openCreate() {
		createOpen = true;
		await tick();
		createInput?.focus();
	}

	async function closeCreate() {
		createOpen = false;
		await tick();
		card?.focus();
	}

	async function create() {
		createError = null;
		const result = await onCreate(createName.trim());
		if (result) {
			createError = result.refused;
			return;
		}
		await closeCreate();
	}

	const rows = $derived(`${question.rowCount} ${question.rowCount === 1 ? 'row' : 'rows'}`);
</script>

<section
	bind:this={card}
	tabindex="-1"
	data-question-key={question.key}
	data-rail-open={question.answer ? undefined : true}
	class="grid grid-cols-1 gap-3 rounded-md border bg-card p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
	aria-labelledby="{id}-title"
>
	<header class="grid gap-0.5">
		<h3 id="{id}-title" class="text-sm font-semibold">{question.title}</h3>
		<p class="text-sm">
			<span class="font-mono">"{question.subject}"</span>
			<span class="text-muted-foreground">· {rows}</span>
		</p>
	</header>

	{#if answered !== null && question.answer}
		<div class="flex items-center gap-2 text-sm">
			<CheckIcon class="size-4 text-success-foreground" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate">{answered}</span>
			<Button variant="ghost" size="xs" onclick={() => void settle(null)}>Change</Button>
		</div>
	{:else}
		{#if accepts.kind === 'fill'}
			<DatePicker aria-label="Date for {question.subject}" bind:value={choice} />
		{:else if options.length > RADIO_LIMIT}
			<Combobox.Root
				items={options.map((option) => ({ value: option.id, label: option.label, description: option.hint }))}
				bind:value={choice}
				label="Read {question.subject} as"
				autoHighlight
			>
				<Combobox.Trigger placeholder="Choose a {noun}" aria-label="Read {question.subject} as" />
				<Combobox.Content>
					<Combobox.Search placeholder="Search" />
					<Combobox.Empty>No match.</Combobox.Empty>
					<Combobox.List />
				</Combobox.Content>
			</Combobox.Root>
		{:else if !skipOnly}
			<RadioGroup.Root bind:value={choice} aria-labelledby="{id}-title" class="gap-2">
				{#each options as option (option.id)}
					<div class="flex items-start gap-2">
						<RadioGroup.Item id="{id}-{option.id}" value={option.id} class="mt-0.5" />
						<label for="{id}-{option.id}" class="grid min-w-0 text-sm">
							<span class="truncate">{option.label}</span>
							{#if option.hint}<span class="truncate text-xs text-muted-foreground">{option.hint}</span>{/if}
						</label>
					</div>
				{/each}
			</RadioGroup.Root>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			{#if !skipOnly}
				<Button size="sm" disabled={!choice} onclick={apply}>Apply to {rows}</Button>
			{/if}
			<Button variant={skipOnly ? 'outline' : 'ghost'} size="sm" onclick={() => void settle({ kind: 'skip' })}>
				{question.skipLabel ?? `Skip ${rows}`}
			</Button>
		</div>
		{#if accepts.kind === 'pick' && accepts.canCreate}
			{#if createOpen}
				<form
					class="grid gap-2 border-t pt-3"
					onsubmit={(event) => {
						event.preventDefault();
						void create();
					}}
				>
					<label for="{id}-create" class="text-xs text-muted-foreground">New {noun} name</label>
					<Input
						id="{id}-create"
						bind:ref={createInput}
						bind:value={createName}
						aria-invalid={createError ? true : undefined}
					/>
					{#if createError}<p class="text-xs text-danger-foreground" role="alert">{createError}</p>{/if}
					<div class="flex gap-2">
						<Button type="submit" size="sm" variant="outline" disabled={creating || !createName.trim()}>
							{#if creating}<Spinner class="size-3.5" />{/if}
							Create {noun}
						</Button>
						<Button variant="ghost" size="sm" onclick={() => void closeCreate()}>Cancel</Button>
					</div>
				</form>
			{:else}
				<Button variant="outline" size="sm" class="justify-self-start" onclick={() => void openCreate()}>
					<PlusIcon data-icon="inline-start" /> Create "{question.subject}"
				</Button>
			{/if}
		{/if}
	{/if}
</section>
