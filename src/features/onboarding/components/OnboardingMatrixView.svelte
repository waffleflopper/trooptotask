<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { buildPacketMatrix } from '../onboardingMatrix';
	import type { PersonnelOnboarding } from '../onboarding.types';
	import { STALL_DAYS, type Today } from '../onboardingStatus';
	import * as Popover from '$lib/components/ui/popover';
	import Check from '@lucide/svelte/icons/check';
	import OnboardingMatrixGrid from './OnboardingMatrixGrid.svelte';
	import OnboardingMatrixPopover from './OnboardingMatrixPopover.svelte';

	interface Props {
		ctx: OnboardingPageContext;
		/** The packets that pass the page's search and Group filter. */
		packets: PersonnelOnboarding[];
		today: Today;
	}

	let { ctx, packets, today }: Props = $props();

	const matrix = $derived(buildPacketMatrix(packets, ctx.templates, ctx.templateSteps, today));
	const rows = $derived(matrix.grids.flatMap((grid) => grid.rows));
	const manageable = $derived(rows.filter((row) => ctx.canManageOnboarding(row.summary.packet)).length);

	interface Target {
		packetId: string;
		columnId: string;
		anchor: HTMLElement | null;
	}

	let root = $state<HTMLElement>();
	let target = $state<Target | null>(null);
	/** Where focus returns when the popover closes. Kept outside state because closing clears the target. */
	let returnTo: { packetId: string; columnId: string } | null = null;

	const active = $derived.by(() => {
		if (!target) return null;
		for (const grid of matrix.grids) {
			const columnIndex = grid.columns.findIndex((column) => column.id === target!.columnId);
			const row = grid.rows.find((candidate) => candidate.summary.packet.id === target!.packetId);
			const cell = columnIndex < 0 || !row ? undefined : row.cells[columnIndex];
			if (row && cell && cell.kind !== 'missing') return { row, cell, packet: row.summary.packet };
		}
		return null;
	});

	// A search, Group filter or sync can take the cell away while its popover is open.
	$effect(() => {
		if (target && !active) target = null;
	});

	function cellElement(packetId: string, columnId: string): HTMLElement | null {
		return (
			root?.querySelector<HTMLElement>(
				`[data-slot="operational-matrix-cell"][data-row-id="${CSS.escape(packetId)}"][data-column-id="${CSS.escape(columnId)}"]`
			) ?? null
		);
	}

	function openCell(packetId: string, columnId: string) {
		returnTo = { packetId, columnId };
		target = { packetId, columnId, anchor: cellElement(packetId, columnId) };
	}

	function returnFocus(event: Event) {
		event.preventDefault();
		if (returnTo) cellElement(returnTo.packetId, returnTo.columnId)?.querySelector<HTMLElement>('button')?.focus();
	}

	function plural(count: number, one: string, many: string) {
		return `${count} ${count === 1 ? one : many}`;
	}
</script>

{#snippet legend()}
	<ul class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground" aria-label="Matrix key">
		<li class="flex items-center gap-1.5"><Check class="size-3.5" aria-hidden="true" />Done</li>
		<li class="flex items-center gap-1.5">
			<span aria-hidden="true" class="size-3.5 rounded-xs border-[1.5px] border-muted-foreground"></span>Open
		</li>
		<li class="flex items-center gap-1.5">
			<span aria-hidden="true" class="font-mono text-xs font-semibold text-foreground">2/3</span>Paperwork stage
		</li>
		<li class="flex items-center gap-1.5">
			<span aria-hidden="true" class="size-3.5 rounded-xs border-[1.5px] border-warning bg-warning-muted"></span>Stalled {STALL_DAYS}+
			days
		</li>
	</ul>
{/snippet}

<div class="grid gap-8" bind:this={root}>
	{#if rows.length > 0 && manageable < rows.length}
		<p class="text-sm text-muted-foreground">
			{manageable === 0
				? "View only. You can't change onboarding steps, so the cells open details only."
				: "Cells for Soldiers outside your groups open details only. You can't manage their onboarding."}
		</p>
	{/if}

	{#each matrix.grids as grid, index (grid.template.id)}
		<section class="grid gap-3" aria-labelledby={`onboarding-matrix-${grid.template.id}`}>
			<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
				<div class="flex flex-wrap items-baseline gap-x-3">
					<h2 id={`onboarding-matrix-${grid.template.id}`} class="font-heading text-xl font-semibold">
						{grid.template.name} packet
					</h2>
					<p class="font-mono text-xs text-muted-foreground">
						{plural(grid.rows.length, 'Soldier', 'Soldiers')} × {plural(grid.columns.length, 'step', 'steps')} · oldest first
					</p>
				</div>
				{#if index === 0}{@render legend()}{/if}
			</div>
			<OnboardingMatrixGrid {ctx} {grid} selected={target} onOpenCell={openCell} />
		</section>
	{/each}

	{#if matrix.withoutTemplate > 0}
		<p class="text-sm text-muted-foreground">
			{matrix.withoutTemplate === 1
				? '1 packet has no template. Open it in List view to assign one.'
				: `${matrix.withoutTemplate} packets have no template. Open them in List view to assign one.`}
		</p>
	{/if}
</div>

{#if active && target}
	{#key `${target.packetId}:${target.columnId}`}
		<Popover.Root open onOpenChange={(open) => !open && (target = null)}>
			<Popover.Content
				customAnchor={target.anchor}
				class="max-h-(--bits-popover-content-available-height) w-80 max-w-(--bits-popover-content-available-width) overflow-y-auto"
				align="start"
				collisionPadding={8}
				role="dialog"
				aria-label={`${ctx.getPersonName(active.packet.personnelId)}: ${active.cell.step.stepName}`}
				onCloseAutoFocus={returnFocus}
			>
				<OnboardingMatrixPopover
					{ctx}
					step={active.cell.step}
					surname={ctx.getPerson(active.packet.personnelId)?.lastName ?? ctx.getPersonName(active.packet.personnelId)}
					{today}
					canManage={ctx.canManageOnboarding(active.packet)}
				/>
			</Popover.Content>
		</Popover.Root>
	{/key}
{/if}
