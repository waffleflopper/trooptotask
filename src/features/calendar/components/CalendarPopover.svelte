<script lang="ts">
	import { untrack } from 'svelte';
	import type { StatusType } from '$features/calendar/contracts';
	import type {
		AvailabilityEditorRequest,
		CalendarPopover
	} from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { AvailabilityChange } from '$features/calendar/utils/availabilityMutation';
	import { describeSpan, shortRangeLabel, spanDays, type AvailabilitySpan } from '$features/calendar/utils/barLayout';
	import { toDayNumber } from '$features/calendar/utils/dayNumber';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';

	type BarPopover = Exclude<CalendarPopover, { kind: 'duty' }>;

	interface Props {
		popover: BarPopover;
		statusTypes: readonly StatusType[];
		spans: readonly AvailabilitySpan[];
		canEdit: boolean;
		/** True when the anchor is the entry's own month-view bar, which carries the resize grips. */
		resizable: boolean;
		saving: boolean;
		onSave: (change: AvailabilityChange) => unknown;
		onEdit: (request: AvailabilityEditorRequest) => void;
		onOpenEntry: (entryId: string) => void;
		onClose: () => void;
	}

	let { popover, statusTypes, spans, canEdit, resizable, saving, onSave, onEdit, onOpenEntry, onClose }: Props =
		$props();

	const personName = $derived(`${popover.person.rank} ${popover.person.lastName}`);

	/** Fixed when the popover opens, so a reorder from another session cannot redirect a key. */
	const shortcuts = untrack(() => statusTypes.slice(0, 9).map((status) => status.id));

	const quickAdd = $derived.by(() => {
		if (popover.kind !== 'quick-add') return null;
		const start = toDayNumber(popover.startDate);
		const end = toDayNumber(popover.endDate);
		return { ...popover, range: shortRangeLabel(start, end), days: end - start + 1 };
	});

	const entry = $derived(
		popover.kind === 'entry' ? spans.find((span) => span.entry.id === popover.entryId) : undefined
	);
	const overflow = $derived(
		popover.kind === 'overflow' ? spans.filter((span) => popover.entryIds.includes(span.entry.id)) : []
	);
	const entryEditable = $derived(canEdit && !!entry && !entry.entry.id.startsWith('temp-'));

	let confirmingRemove = $state(false);

	$effect(() => {
		if (popover.kind === 'entry' && !entry) onClose();
	});

	// Scrolling can virtualize the anchor's row away after the rows re-render, so check on the next frame.
	$effect(() => {
		const closeIfDetached = () =>
			requestAnimationFrame(() => {
				if (!popover.anchor.isConnected) onClose();
			});
		document.addEventListener('scroll', closeIfDetached, { capture: true, passive: true });
		return () => document.removeEventListener('scroll', closeIfDetached, { capture: true });
	});

	const label = $derived.by(() => {
		if (quickAdd) return `Add status, ${quickAdd.range}`;
		if (entry) return `${entry.status.name}, ${personName}`;
		return `${overflow.length} more entries, ${personName}`;
	});

	function create(statusTypeId: string) {
		if (!quickAdd || saving) return;
		const change: AvailabilityChange = {
			kind: 'create',
			record: {
				personnelId: quickAdd.person.id,
				statusTypeId,
				startDate: quickAdd.startDate,
				endDate: quickAdd.endDate,
				note: null
			}
		};
		onClose();
		onSave(change);
	}

	function pressShortcut(event: KeyboardEvent) {
		if (!quickAdd || !/^[1-9]$/.test(event.key)) return;
		if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		const statusTypeId = shortcuts[Number(event.key) - 1];
		if (!statusTypeId || !statusTypes.some((status) => status.id === statusTypeId)) return;
		event.preventDefault();
		create(statusTypeId);
	}

	function remove() {
		if (!entry || saving) return;
		const change: AvailabilityChange = { kind: 'remove', entry: entry.entry };
		onClose();
		onSave(change);
	}

	function returnFocus(event: Event) {
		event.preventDefault();
		if (popover.anchor.isConnected) popover.anchor.focus();
	}

	// The anchor's own presses (a resize handle, or the bar again) must not close the popover.
	function keepForAnchor(event: PointerEvent) {
		if (event.target instanceof Node && popover.anchor.contains(event.target)) event.preventDefault();
	}
</script>

<Popover.Root open onOpenChange={(open) => !open && onClose()}>
	<Popover.Content
		customAnchor={popover.anchor}
		align="start"
		collisionPadding={8}
		class="w-[340px] max-w-(--bits-popover-content-available-width) gap-0 p-0"
		role="dialog"
		aria-label={label}
		onCloseAutoFocus={returnFocus}
		onInteractOutside={keepForAnchor}
		onkeydown={pressShortcut}
	>
		{#if quickAdd}
			<Popover.Header class="px-3 pt-3 pb-2">
				<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
					Add status · {quickAdd.range}
				</p>
				<Popover.Title class="font-body text-base leading-snug font-semibold">
					{quickAdd.person.rank}
					{quickAdd.person.lastName}, {quickAdd.person.firstName} · {quickAdd.days}
					{quickAdd.days === 1 ? 'day' : 'days'}
				</Popover.Title>
			</Popover.Header>
			{#if statusTypes.length === 0}
				<p class="px-3 pb-3 text-sm text-muted-foreground">No status types yet. Add one in Calendar settings.</p>
			{:else}
				<ul class="flex max-h-72 flex-col overflow-y-auto px-1.5 pb-1.5" aria-label="Status types">
					{#each statusTypes as status (status.id)}
						{@const key = shortcuts.indexOf(status.id) + 1}
						<li>
							<Button
								variant="ghost"
								class="w-full justify-start gap-2 px-1.5"
								disabled={saving}
								aria-keyshortcuts={key > 0 ? String(key) : undefined}
								onclick={() => create(status.id)}
							>
								<span class="size-2.5 shrink-0 rounded-[2px]" style:background-color={status.color}></span>
								<span class="min-w-0 flex-1 truncate text-left">{status.name}</span>
								{#if key > 0}
									<kbd class="font-mono text-[10px] text-muted-foreground" aria-hidden="true">{key}</kbd>
								{/if}
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="flex items-center border-t px-1.5 py-1.5">
				<Button
					variant="ghost"
					class="min-w-0 flex-1 justify-start px-1.5 text-muted-foreground"
					onclick={() =>
						onEdit({
							kind: 'create',
							person: quickAdd.person,
							startDate: quickAdd.startDate,
							endDate: quickAdd.endDate
						})}
				>
					Add a note or edit dates…
				</Button>
				<kbd class="px-1.5 font-mono text-[10px] text-muted-foreground" aria-hidden="true">Esc</kbd>
			</div>
		{:else if entry}
			<Popover.Header class="gap-1 px-3.5 pt-3.5 pb-3">
				<p class="flex items-start gap-1.5 font-mono text-[10px] tracking-[0.08em] uppercase">
					<span class="mt-0.5 size-2.5 shrink-0 rounded-[2px]" style:background-color={entry.status.color}></span>
					<span class="min-w-0">
						<span class="font-semibold">{entry.status.name}</span>
						<span class="text-muted-foreground">· {personName}</span>
					</span>
				</p>
				<Popover.Title class="font-body text-base leading-snug font-semibold">
					{shortRangeLabel(entry.start, entry.end)} · {spanDays(entry)}
					{spanDays(entry) === 1 ? 'day' : 'days'}
				</Popover.Title>
				{#if entry.entry.note}
					<p class="font-body text-sm text-muted-foreground">{entry.entry.note}</p>
				{/if}
			</Popover.Header>
			{#if entryEditable}
				<div class="flex items-center gap-2 border-t px-3.5 py-2.5">
					{#if confirmingRemove}
						<p class="min-w-0 flex-1 text-sm">
							Remove {entry.status.name}, {shortRangeLabel(entry.start, entry.end)}?
						</p>
						<Button variant="destructive" size="sm" disabled={saving} onclick={remove}>Remove</Button>
						<Button variant="outline" size="sm" onclick={() => (confirmingRemove = false)}>Cancel</Button>
					{:else}
						<Button
							variant="outline"
							size="sm"
							onclick={() => onEdit({ kind: 'edit', person: popover.person, entry: entry.entry })}
						>
							Edit details
						</Button>
						<Button variant="destructive" size="sm" disabled={saving} onclick={() => (confirmingRemove = true)}>
							Remove
						</Button>
						{#if resizable}
							<span class="ml-auto font-mono text-[10px] tracking-wider text-muted-foreground uppercase max-sm:hidden">
								Drag ends to resize
							</span>
						{/if}
					{/if}
				</div>
			{/if}
		{:else}
			<Popover.Header class="px-3 pt-3 pb-2">
				<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
					{personName}
				</p>
				<Popover.Title class="font-body text-base leading-snug font-semibold">
					{overflow.length} more entries
				</Popover.Title>
			</Popover.Header>
			<ul class="flex flex-col px-1.5 pb-1.5">
				{#each overflow as span (span.entry.id)}
					<li>
						<Button
							variant="ghost"
							class="h-auto w-full justify-start gap-2 px-1.5 py-1.5 text-left whitespace-normal"
							aria-haspopup="dialog"
							onclick={() => onOpenEntry(span.entry.id)}
						>
							<span class="size-2.5 shrink-0 rounded-[2px]" style:background-color={span.status.color}></span>
							<span class="min-w-0 flex-1">{describeSpan(span)}</span>
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</Popover.Content>
</Popover.Root>
