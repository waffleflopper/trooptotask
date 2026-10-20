<script lang="ts" module>
	import type { ReadinessItemStatus } from '$lib/domain/readinessItem';

	export interface ReadinessItemRow {
		id: string;
		status: ReadinessItemStatus;
		name: string;
		detail: string;
		recordedOn: string | null;
		expiresOn: string | null;
	}

	export const readinessItemStatusVisuals: Record<ReadinessItemStatus, { label: string; rule: string; text: string }> =
		{
			expired: { label: 'Expired', rule: 'border-l-destructive', text: 'text-danger-foreground' },
			missing: { label: 'Missing', rule: 'border-l-destructive', text: 'text-danger-foreground' },
			expiring: { label: 'Expiring', rule: 'border-l-warning', text: 'text-warning-foreground' },
			current: { label: 'Current', rule: 'border-l-transparent', text: 'text-success-foreground' }
		};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { isReadinessProblem } from '$lib/domain/readinessItem';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { cn } from '$lib/utils.js';
	import { formatDayMonthYear } from '$lib/utils/dates';

	let {
		eyebrow,
		note,
		action,
		itemLabel,
		recordedLabel,
		rows,
		emptyMessage,
		onOpen,
		footerEnd,
		currentPreview = 4
	}: {
		eyebrow: string;
		note: string;
		action?: Snippet;
		itemLabel: string;
		recordedLabel: string;
		/** Ranked: problems first, then current by soonest expiry. */
		rows: ReadinessItemRow[];
		emptyMessage: string;
		onOpen: (id: string) => void;
		footerEnd?: Snippet;
		currentPreview?: number;
	} = $props();

	let showAllCurrent = $state(false);

	const problems = $derived(rows.filter((row) => isReadinessProblem(row.status)));
	const current = $derived(rows.filter((row) => !isReadinessProblem(row.status)));
	const ready = $derived(rows.filter((row) => row.status === 'current' || row.status === 'expiring').length);
	const hiddenCount = $derived(showAllCurrent ? 0 : Math.max(0, current.length - currentPreview));
	const shownCurrent = $derived(showAllCurrent ? current : current.slice(0, currentPreview));
	const canToggle = $derived(current.length > currentPreview);
	const labelClass =
		'font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase';
</script>

<section class="flex flex-col gap-3.5" aria-label={eyebrow}>
	<header class="flex items-end justify-between gap-4">
		<div class="flex flex-col gap-0.5">
			<h2 class={labelClass}>{eyebrow}</h2>
			<p class="flex flex-wrap items-baseline gap-x-2.5">
				<span class="font-heading text-[34px] leading-9 font-bold text-foreground">{ready} of {rows.length} ready</span>
				<span class="text-sm text-muted-foreground">{note}</span>
			</p>
		</div>
		{@render action?.()}
	</header>

	<div class="overflow-clip rounded-md border">
		<Table.Root>
			<Table.Header class="bg-muted">
				<Table.Row class="border-l-[3px] border-l-transparent hover:bg-transparent">
					<Table.Head class={cn('h-auto w-20 py-2 pr-0 pl-3.5', labelClass)}>Status</Table.Head>
					<Table.Head class={cn('h-auto py-2 pl-4', labelClass)}>{itemLabel}</Table.Head>
					<Table.Head class={cn('h-auto w-[126px] py-2 pl-4', labelClass)}>{recordedLabel}</Table.Head>
					<Table.Head class={cn('h-auto w-[126px] py-2 pl-4', labelClass)}>Expires</Table.Head>
					<Table.Head class="h-auto w-10 py-2 pr-3.5 pl-4"><span class="sr-only">Open</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each problems as row (row.id)}
					{@render itemRow(row)}
				{/each}
				{#if current.length > 0}
					<Table.Row class="border-l-[3px] border-l-transparent bg-muted hover:bg-muted">
						<Table.Head colspan={5} scope="colgroup" class="h-auto py-2 pl-3.5 font-normal">
							<span class={labelClass}>Current · {current.length}</span>
							<span class="ml-2.5 text-[13px] leading-[18px] text-muted-foreground">soonest expiry first</span>
						</Table.Head>
					</Table.Row>
				{/if}
				{#each shownCurrent as row (row.id)}
					{@render itemRow(row)}
				{/each}
				{#if rows.length === 0}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={5} class="px-4 py-3 text-sm whitespace-normal text-muted-foreground">
							{emptyMessage}
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
		{#if canToggle || footerEnd}
			<div class="flex items-center justify-between gap-4 border-t py-2.5 pr-3.5 pl-[17px] text-sm">
				{#if canToggle}
					<Button
						variant="link"
						size="none"
						class="font-medium text-foreground underline underline-offset-4"
						aria-expanded={showAllCurrent}
						onclick={() => (showAllCurrent = !showAllCurrent)}
					>
						{showAllCurrent ? 'Show fewer current' : `Show ${hiddenCount} more current`}
					</Button>
				{:else}
					<span></span>
				{/if}
				{@render footerEnd?.()}
			</div>
		{/if}
	</div>
</section>

{#snippet itemRow(row: ReadinessItemRow)}
	{@const visual = readinessItemStatusVisuals[row.status]}
	{@const problem = isReadinessProblem(row.status)}
	<Table.Row class={cn('relative border-l-[3px]', visual.rule)}>
		<Table.Cell
			class={cn('w-20 pr-0 pl-3.5 text-sm', problem ? 'py-3 font-semibold' : 'py-[9px] font-medium', visual.text)}
		>
			{visual.label}
		</Table.Cell>
		<Table.Cell class="pl-4 whitespace-normal">
			<span class={cn('block text-[15px] leading-5 text-foreground', problem ? 'font-semibold' : 'font-medium')}>
				{row.name}
			</span>
			<span class="mt-0.5 block text-[13px] leading-[18px] text-muted-foreground">{row.detail}</span>
		</Table.Cell>
		<Table.Cell class="pl-4 text-[13px] leading-[18px] text-secondary-foreground">
			{row.recordedOn ? formatDayMonthYear(row.recordedOn) : '—'}
		</Table.Cell>
		<Table.Cell
			class={cn(
				'pl-4 text-[13px] leading-[18px]',
				!row.expiresOn
					? 'text-muted-foreground'
					: problem
						? cn('font-medium', visual.text)
						: 'text-secondary-foreground'
			)}
		>
			{row.expiresOn ? formatDayMonthYear(row.expiresOn) : '—'}
		</Table.Cell>
		<Table.Cell class="pr-3.5 pl-4">
			<!-- The stretched ::after makes the whole row the button. A pressed translate would make the button
			     its containing block, shrinking the target between press and release so the click is lost. -->
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-muted-foreground after:absolute after:inset-0 active:not-aria-[haspopup]:translate-none"
				aria-label={`Open ${row.name}`}
				onclick={() => onOpen(row.id)}
			>
				<EllipsisIcon class="size-4" />
			</Button>
		</Table.Cell>
	</Table.Row>
{/snippet}
