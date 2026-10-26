<script lang="ts" module>
	export type RecordSection = 'needs-action' | 'current' | 'not-required' | 'exempt';
</script>

<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import type { Personnel } from '$features/personnel/contracts';
	import type { PersonnelTraining } from '$features/training/training.types';
	import {
		getCellDisplayText,
		getColumnIntervalLabel,
		getStatusLine,
		neverExpires
	} from '$features/training/utils/cellDisplayText';
	import type { RecordSheetItem } from '$features/training/utils/trainingRecordSheetModel';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import TrainingRecordForm from './TrainingRecordForm.svelte';

	interface Props {
		item: RecordSheetItem;
		section: RecordSection;
		person: Personnel;
		orgId: string;
		asOf: string;
		expanded: boolean;
		/** Open to fix the stored record, not to renew it. */
		correcting: boolean;
		/** A save is in flight somewhere in the sheet. */
		busy: boolean;
		/** Whether this person may exempt Soldiers from types, which edits the type itself. */
		canExempt: boolean;
		/** True while the sheet is still on this Soldier and this item is still open. */
		isCurrent: () => boolean;
		onToggle: () => void;
		onEdit: () => void;
		onToday: () => void;
		onExempt: (exempt: boolean) => void;
		onDelete: () => void;
		onSave: (data: Omit<PersonnelTraining, 'id'>) => void | Promise<void>;
		onDirtyChange: (dirty: boolean) => void;
	}

	let {
		item,
		section,
		person,
		orgId,
		asOf,
		expanded,
		correcting,
		busy,
		canExempt,
		isCurrent,
		onToggle,
		onEdit,
		onToday,
		onExempt,
		onDelete,
		onSave,
		onDirtyChange
	}: Props = $props();

	const { type, record, statusInfo } = $derived(item);
	const isExempt = $derived(section === 'exempt');
	const statusLine = $derived(getStatusLine(statusInfo, record, type));
	const canExemptHere = $derived(canExempt && type.canBeExempted && section !== 'not-required');
	const hasMenu = $derived(isExempt ? canExempt : true);
	const toneClass = {
		danger: 'text-danger-foreground',
		warning: 'text-warning-foreground',
		muted: 'text-muted-foreground'
	};
	const markerClass = $derived(
		{
			expired: 'bg-destructive',
			'not-completed': 'border-2 border-destructive',
			'warning-orange': 'border-2 border-warning',
			'warning-yellow': 'border-2 border-warning'
		}[statusInfo.status as string] ?? ''
	);
	const doneDate = $derived(record?.completionDate ? formatDayMonthYear(record.completionDate) : '—');
	const untilText = $derived(neverExpires(type) ? 'Never' : getCellDisplayText(statusInfo, record, type));
	const tint = $derived(
		expanded && section === 'needs-action'
			? statusInfo.status === 'warning-orange' || statusInfo.status === 'warning-yellow'
				? 'border-l-2 border-warning bg-warning/10'
				: 'border-l-2 border-destructive bg-destructive/5'
			: ''
	);
</script>

<li class={['border-b border-border last:border-b-0', tint]} data-record-item={type.id} data-section={section}>
	<div class="flex items-center gap-2 py-2.5">
		<button
			type="button"
			class="flex min-w-0 flex-1 items-center gap-3 rounded-sm px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
			aria-expanded={expanded}
			onclick={onToggle}
		>
			<span class="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
				{#if section === 'needs-action'}
					<span class={['size-3 rounded-[2px]', markerClass]}></span>
				{:else if section === 'current'}
					<CheckIcon class="size-4 text-muted-foreground" />
				{:else}
					<MinusIcon class="size-4 text-muted-foreground" />
				{/if}
			</span>
			<span class="grid min-w-0 gap-0.5">
				<span class={['text-[0.9375rem] break-words', section === 'not-required' && 'text-muted-foreground']}>
					{type.name}
				</span>
				{#if section === 'needs-action'}
					<span class={['font-mono text-xs', toneClass[statusLine.tone]]}>{statusLine.text}</span>
				{:else if section === 'not-required' && item.reason}
					<span class="font-mono text-xs text-muted-foreground">{item.reason}</span>
				{/if}
			</span>
			{#if expanded && section === 'needs-action'}
				<span class="ml-auto shrink-0 font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
					{getColumnIntervalLabel(type)}
				</span>
			{/if}
		</button>

		{#if section === 'needs-action' && !expanded}
			<Button
				variant="outline"
				size="sm"
				disabled={busy}
				data-today-button
				aria-label={item.renewal === 'cardDate' ? `Enter the card date for ${type.name}` : `Record ${type.name} today`}
				onclick={item.renewal === 'cardDate' ? onToggle : onToday}
			>
				{item.renewal === 'cardDate' ? 'Enter date' : 'Today'}
			</Button>
		{:else if section === 'current'}
			<span class="shrink-0 font-mono text-xs text-muted-foreground">{doneDate}</span>
			<span class="w-14 shrink-0 text-right font-mono text-xs">{untilText}</span>
		{:else if isExempt}
			<span class="shrink-0 font-mono text-xs text-muted-foreground uppercase">Exempt</span>
		{/if}

		{#if hasMenu}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							disabled={busy}
							aria-label={`More actions for ${type.name}`}
						>
							<EllipsisIcon />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-44">
					{#if isExempt}
						<DropdownMenu.Item onSelect={() => onExempt(false)}>Unexempt</DropdownMenu.Item>
					{:else}
						{#if canExemptHere}
							<DropdownMenu.Item onSelect={() => onExempt(true)}>Exempt</DropdownMenu.Item>
						{/if}
						<DropdownMenu.Item onSelect={onEdit}>{record ? 'Edit' : 'Add record'}</DropdownMenu.Item>
						{#if record}
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive" onSelect={onDelete}>Delete</DropdownMenu.Item>
						{/if}
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</div>

	{#if expanded}
		<div class="pr-1 pb-3 pl-8">
			{#key correcting}
				<TrainingRecordForm
					{person}
					{type}
					training={record}
					{orgId}
					today={asOf}
					{isCurrent}
					{busy}
					keepRecordedDate={correcting}
					{onSave}
					{onDirtyChange}
				/>
			{/key}
		</div>
	{/if}
</li>
