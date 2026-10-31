<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Table from '$lib/components/ui/table';
	import { cn } from '$lib/utils.js';
	import { formatDate, formatDayMonth } from '$lib/utils/dates';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { dailyAssignmentsStore } from '../../stores/dailyAssignments.svelte';
	import {
		DA6_DEPENDENCY,
		addDays,
		da6Href,
		dayOfMonth,
		headerDate,
		lastDayOf,
		remarkText,
		weekdayShort,
		type Da6Setup,
		type Da6SetupForm
	} from '../../utils/da6View';
	import Da6Fields from './Da6Fields.svelte';

	interface Props {
		orgName: string;
		orgUrlSegment: string;
		/** Null while the form loads. */
		setup: Da6Setup | null;
	}

	let { orgName, orgUrlSegment, setup }: Props = $props();

	const form = $derived(setup?.form ?? null);
	const editable = $derived(form?.state === 'editable');
	const shortName = $derived(setup?.roster.shortName ?? '');
	const da6 = $derived(setup ? da6Href(orgUrlSegment, setup.roster.id) : '');

	const keyOf = (personId: string, track: string) => `${personId}:${track}`;
	const savedValues = (current: Da6SetupForm) =>
		Object.fromEntries(current.numbers.map(({ personId, track, count }) => [keyOf(personId, track), `${count}`]));

	// Typed values belong to the form they were typed on, so a reload after a refusal keeps them on the same form.
	// Once the numbers are part of the record, the record shows instead.
	let edits = $state.raw<{ formId: string; values: Record<string, string> } | null>(null);
	const values = $derived(form ? (editable && edits?.formId === form.id ? edits.values : savedValues(form)) : {});
	let refusal = $state.raw<{ formId: string; message: string } | null>(null);
	const TRACK_LABEL = { all: '', weekday: 'weekday ', weekend: 'weekend and holiday ' } as const;
	const saving = new PendingSave();

	const fields = $derived([
		{ label: 'Nature of duty', value: setup?.roster.name ?? '' },
		{ label: 'Organization', value: orgName },
		{ label: 'From', value: form ? headerDate(form.from) : '' },
		{ label: 'To', value: 'Open' }
	]);
	const rest = $derived.by(() => {
		const last = form?.columns.at(-1)?.date;
		if (!last || last === lastDayOf(last.slice(0, 7))) return null;
		return `${formatDayMonth(addDays(last, 1))} – ${formatDayMonth(lastDayOf(last.slice(0, 7)))}`;
	});

	function setValue(current: Da6SetupForm, key: string, value: string) {
		edits = { formId: current.id, values: { ...values, [key]: value.replace(/\D/g, '').slice(0, 4) } };
	}

	// Tab moves down the column, then to the top of the next one, so a person reads straight down the paper form.
	function moveDown(event: KeyboardEvent, current: Da6SetupForm, row: number, column: number) {
		if (event.key !== 'Tab') return;
		const step = event.shiftKey ? -1 : 1;
		let nextRow = row + step;
		let nextColumn = column;
		if (nextRow < 0 || nextRow >= current.rows.length) {
			nextColumn += step;
			nextRow = step > 0 ? 0 : current.rows.length - 1;
		}
		const target = document.getElementById(`starting-number-${nextRow}-${nextColumn}`);
		if (!target) return;
		event.preventDefault();
		target.focus();
	}

	function leave() {
		void goto(resolve(da6 as '/'), { replace: true });
	}

	async function save(current: Da6SetupForm, roster: Da6Setup['roster']) {
		const path = page.url.pathname;
		const numbers = current.columns.flatMap(({ track }) =>
			current.rows.flatMap(({ personId }) => {
				const value = values[keyOf(personId, track)]?.trim();
				return [{ personId, track, count: value ? Number(value) : null }];
			})
		);
		const result = await dailyAssignmentsStore.saveStartingNumbers({
			typeId: roster.id,
			formId: current.id,
			today: formatDate(new Date()),
			numbers
		});
		// Someone who left setup mode while the save ran stays where they went.
		if (page.url.pathname !== path || page.url.searchParams.get('setup') !== '1' || form !== current) return;
		if (result.status === 'saved') leave();
		else if (result.status === 'refused') {
			refusal = { formId: current.id, message: result.message };
			await invalidate(DA6_DEPENDENCY);
		}
	}
</script>

<div class="mx-auto flex max-w-[1600px] min-w-0 flex-col gap-4 px-4 py-4 sm:px-6 sm:pb-6" data-da6-setup>
	{#snippet aside()}
		{#if !setup}
			<Skeleton class="h-8 w-64 rounded-lg" aria-hidden="true" />
		{:else if form && editable}
			<Button variant="outline" size="sm" disabled={saving.pending} onclick={leave}>
				{form.numbers.length ? 'Cancel' : 'Skip, start everyone even'}
			</Button>
			<Button size="sm" disabled={saving.pending} onclick={() => saving.run(() => save(form, setup.roster))}>
				{#if saving.pending}<Spinner />{/if}
				Save starting numbers
			</Button>
		{:else}
			<Button variant="outline" size="sm" href={da6}>Open DA 6</Button>
		{/if}
	{/snippet}
	<PageShell.Header
		eyebrow="Calendar · Duty roster"
		title={setup ? `DA 6 · ${setup.roster.name}` : 'DA 6'}
		variant="display"
		{aside}
	/>

	{#if !setup}
		<div class="grid gap-3" role="status" aria-live="polite">
			<p class="sr-only">Loading the DA 6</p>
			<Skeleton class="h-20 w-full rounded-lg" aria-hidden="true" />
			<Skeleton class="h-96 w-full rounded-lg" aria-hidden="true" />
		</div>
	{:else if !form}
		<Empty.Root class="min-h-64 border bg-card">
			<Empty.Header>
				<h2 class="text-lg font-semibold">No open DA 6</h2>
				<Empty.Description>{setup.roster.name} has no open form to copy numbers into.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<Alert.Root variant="warning" role="note" class="gap-1 px-4 py-3">
			{#if editable}
				<Alert.Title class="font-semibold"
					>Carrying over a paper DA 6? Copy the last numbers into the first columns.</Alert.Title
				>
				<Alert.Description>
					Names are in the same order as your paper form, so you can read straight down it. Tab moves down the column.
					Blank boxes start at the roster's lowest number. You can change these until the first {shortName} on this roster
					is pulled. After that they're part of the record.
				</Alert.Description>
			{:else}
				<Alert.Title class="font-semibold">These starting numbers are part of the record.</Alert.Title>
				<Alert.Description>
					{form.state === 'carried'
						? 'This DA 6 carried everyone’s count over from the last form when the roster rules changed. Carried numbers don’t change.'
						: `The first ${shortName} on this DA 6 has been pulled, so the numbers it started from don’t change.`}
				</Alert.Description>
			{/if}
		</Alert.Root>

		{#if refusal?.formId === form.id}
			<Alert.Root variant="destructive">
				<Alert.Title>Starting numbers not saved</Alert.Title>
				<Alert.Description>{refusal.message}</Alert.Description>
			</Alert.Root>
		{/if}

		<section
			class="min-w-0 overflow-hidden rounded-lg border bg-card text-card-foreground"
			aria-label={`DA 6 starting numbers, ${setup.roster.name}`}
		>
			<Da6Fields {fields} />
			<Table.Root
				scrollRegionLabel={`${setup.roster.name} starting numbers`}
				class="w-max min-w-full border-separate border-spacing-0 text-sm"
			>
				<caption class="sr-only">
					Each person's number going into the first duty day on each count. A blank box starts at the roster's lowest
					number.
				</caption>
				<thead>
					<tr>
						<th
							scope="col"
							class="sticky left-0 z-20 w-14 min-w-14 border-b border-b-foreground bg-card px-2 pb-1.5 text-left align-bottom font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
						>
							Grade
						</th>
						<th
							scope="col"
							class="sticky left-14 z-20 w-32 min-w-32 border-r border-b border-b-foreground bg-card px-2 pb-1.5 text-left align-bottom font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
						>
							Name
						</th>
						{#each form.columns as column, index (column.track)}
							<th
								scope="col"
								class={cn(
									'w-16 min-w-16 border-b border-b-foreground bg-warning-muted/40 px-1 pt-1.5 pb-1 text-center align-bottom font-mono leading-none',
									index === form.columns.length - 1 ? 'border-r-2 border-r-foreground' : 'border-r',
									column.track === 'weekend' && 'text-destructive-text'
								)}
							>
								<span class="block text-[10px] uppercase">{weekdayShort(column.date)}</span>
								<span class="font-heading text-base font-semibold">{dayOfMonth(column.date)}</span>
								<span class="sr-only">
									{formatDayMonth(column.date)}, {column.track === 'weekend'
										? 'weekend and holiday count'
										: column.track === 'weekday'
											? 'weekday count'
											: 'count'}
								</span>
							</th>
						{/each}
						<th
							scope="col"
							class="min-w-48 border-b border-b-foreground bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(2.25rem-1px),var(--border)_calc(2.25rem-1px),var(--border)_2.25rem)] px-3 pb-1.5 text-left align-bottom font-mono text-[10px] font-normal tracking-[0.08em] text-muted-foreground uppercase"
						>
							{rest ? `${rest} · ` : ''}Fills in as duty is pulled
						</th>
					</tr>
				</thead>
				<tbody>
					{#each form.rows as person, row (person.personId)}
						<tr>
							<th
								scope="row"
								class="sticky left-0 z-10 border-b bg-card px-2 text-left font-mono text-[11px] font-normal text-muted-foreground"
							>
								{person.rank}
							</th>
							<th scope="row" class="sticky left-14 z-10 truncate border-r border-b bg-card px-2 text-left font-normal">
								{person.lastName}
							</th>
							{#each form.columns as column, index (column.track)}
								{@const key = keyOf(person.personId, column.track)}
								<td
									class={cn(
										'h-10 border-b bg-warning-muted/40 px-2 text-center font-mono text-sm tabular-nums',
										index === form.columns.length - 1 ? 'border-r-2 border-r-foreground' : 'border-r',
										column.track === 'weekend' && 'text-destructive-text'
									)}
								>
									{#if editable}
										<Input
											id={`starting-number-${row}-${index}`}
											inputmode="numeric"
											autocomplete="off"
											maxlength={4}
											class={cn(
												'mx-auto h-7 w-11 px-1 text-center font-mono tabular-nums',
												column.track === 'weekend' && 'text-destructive-text'
											)}
											aria-label={`${person.rank} ${person.lastName}, ${TRACK_LABEL[column.track]}starting number`}
											value={values[key] ?? ''}
											oninput={(event) => {
												setValue(form, key, event.currentTarget.value);
												event.currentTarget.value = values[key] ?? '';
											}}
											onkeydown={(event) => moveDown(event, form, row, index)}
											disabled={saving.pending}
										/>
									{:else}
										<span data-starting-number={values[key] ?? ''}>{values[key] ?? ''}</span>
										{#if !values[key]}<span class="sr-only">Started at the roster's lowest number</span>{/if}
									{/if}
								</td>
							{/each}
							<td
								aria-hidden="true"
								class="border-b bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(2.25rem-1px),var(--border)_calc(2.25rem-1px),var(--border)_2.25rem)]"
							></td>
						</tr>
					{/each}
				</tbody>
			</Table.Root>
			<footer class="flex flex-col gap-4 border-t bg-card-alt px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
				<div class="flex flex-col gap-1 text-sm">
					{#if form.weekendMode === 'separate'}
						<p>Red is the weekend &amp; holiday count, kept separately because this roster uses a separate count.</p>
					{/if}
					{#if editable}
						<p class="text-muted-foreground">
							Someone marked A on your paper form? Enter the number they're holding. Their leave already lives in
							TroopToTask statuses.
						</p>
					{/if}
				</div>
				<div class="min-w-0 lg:max-w-[50%]">
					<h3 class="font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Remarks</h3>
					{#if form.remarks.length}
						<ol class="text-sm">
							{#each form.remarks as remark, index (index)}
								<li>({index + 1}) {remarkText(remark, form.from)}</li>
							{/each}
						</ol>
					{:else}
						<p class="text-sm text-muted-foreground">None.</p>
					{/if}
				</div>
			</footer>
		</section>
	{/if}
</div>
