<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CornerDownLeftIcon from '@lucide/svelte/icons/corner-down-left';
	import type { Personnel } from '$features/personnel/contracts';
	import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
	import { calculateExpirationDate, type TrainingStatusInfo } from '$features/training/utils/trainingStatus';
	import { getColumnIntervalLabel } from '$features/training/utils/cellDisplayText';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		person: Personnel;
		type: TrainingType;
		training: PersonnelTraining | undefined;
		statusInfo: TrainingStatusInfo;
		orgId: string;
		/** The Organization's calendar day: the default completion date. */
		today: string;
		/** True while the popover is still open on this person and type. */
		isCurrent: () => boolean;
		onSave: (data: Omit<PersonnelTraining, 'id'>) => void | Promise<void>;
		onOpenRecord?: (person: Personnel) => void;
		onClose: () => void;
	}

	let { person, type, training, statusInfo, orgId, today, isCurrent, onSave, onOpenRecord, onClose }: Props = $props();

	const uid = $props.id();
	const startOrgId = untrack(() => orgId);
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const stillHere = () => !disposed && orgId === startOrgId && isCurrent();

	const kind = $derived(type.expirationDateOnly ? 'cardDate' : type.expirationMonths === null ? 'never' : 'months');
	let date = $state(untrack(() => (type.expirationDateOnly ? '' : today)));
	let notes = $state('');
	let certificateUrl = $state('');
	let showExtras = $state(false);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);

	const expirationDate = $derived(
		kind === 'cardDate' ? date || null : kind === 'months' ? calculateExpirationDate(date, type.expirationMonths) : null
	);
	const canSave = $derived(date !== '' && !saving);

	const statusLine = $derived.by(() => {
		const { status, daysUntilExpiration: days } = statusInfo;
		const until = training?.expirationDate ? formatDayMonthYear(training.expirationDate) : null;
		const dayCount = Math.abs(days ?? 0);
		const dayLabel = `${dayCount} ${dayCount === 1 ? 'day' : 'days'}`;
		switch (status) {
			case 'expired':
				return { tone: 'danger', text: until ? `Expired ${until} · ${dayLabel} ago` : 'Expired' };
			case 'warning-orange':
			case 'warning-yellow':
				return { tone: 'warning', text: until ? `Expires ${until} · ${dayLabel} left` : `${dayLabel} left` };
			case 'current':
				return { tone: 'muted', text: until ? `Current until ${until}` : 'Current · never expires' };
			case 'not-completed':
				return { tone: 'danger', text: 'No record' };
			case 'not-required':
				return { tone: 'muted', text: 'Not required for this Soldier' };
			case 'exempt':
				return { tone: 'muted', text: 'Exempt' };
		}
	});

	const preview = $derived.by(() => {
		if (kind === 'never') return date ? { ok: true, text: 'Never expires' } : null;
		if (!expirationDate) return null;
		const label = formatDayMonthYear(expirationDate);
		return expirationDate >= today
			? { ok: true, text: `Current until ${label}` }
			: { ok: false, text: `Expired ${label}` };
	});

	const toneClass = {
		danger: 'text-danger-foreground',
		warning: 'text-warning-foreground',
		muted: 'text-muted-foreground'
	};

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!canSave || !stillHere()) return;
		const isUpdate = !!training;
		saving = true;
		saveError = null;
		try {
			await onSave({
				personnelId: person.id,
				trainingTypeId: type.id,
				completionDate: kind === 'cardDate' ? null : date,
				expirationDate,
				notes: notes.trim() || null,
				certificateUrl: certificateUrl.trim() || null
			});
			if (!stillHere()) return;
			toast.success(isUpdate ? 'Training record updated' : 'Training record saved');
			onClose();
		} catch (error) {
			if (stillHere()) saveError = error instanceof Error && error.message.trim() ? error.message : 'Could not save.';
		} finally {
			if (stillHere()) {
				saving = false;
				if (saveError) {
					await tick();
					if (stillHere()) formElement?.querySelector<HTMLElement>('button[type="submit"]')?.focus();
				}
			}
		}
	}
</script>

<form bind:this={formElement} class="grid gap-3" onsubmit={save}>
	<div class="grid gap-1">
		<div class="flex items-baseline justify-between gap-3 font-mono text-[0.6875rem] tracking-[0.08em] uppercase">
			<span class="min-w-0 truncate text-muted-foreground">Record · {type.name}</span>
			<span class="shrink-0 text-muted-foreground">{getColumnIntervalLabel(type)}</span>
		</div>
		<p class="font-heading text-base leading-tight font-semibold">
			{person.rank}
			{person.lastName}, {person.firstName}
		</p>
		<p class={['text-xs', toneClass[statusLine.tone as keyof typeof toneClass]]}>{statusLine.text}</p>
	</div>

	<Field.Root class="gap-1.5 border-t border-border pt-3">
		<div class="flex items-center justify-between gap-2">
			<Field.Label for="{uid}-date" class="font-mono text-[0.6875rem] tracking-[0.08em] uppercase">
				{kind === 'cardDate' ? 'Expires on' : 'Completed'}
			</Field.Label>
			{#if kind !== 'cardDate' && date === today}
				<span class="font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">Today</span>
			{/if}
		</div>
		<Input id="{uid}-date" type="date" bind:value={date} disabled={saving} required />
		{#if preview}
			<p class={['flex items-center gap-1.5 text-sm', preview.ok ? 'text-foreground' : 'text-danger-foreground']}>
				{#if preview.ok}<CheckIcon class="size-3.5 text-success-foreground" aria-hidden="true" />{/if}
				{preview.text}
			</p>
		{:else if kind === 'cardDate'}
			<p class="text-sm text-muted-foreground">Enter the date shown on the card.</p>
		{/if}
	</Field.Root>

	{#if showExtras}
		<Field.Root class="gap-1.5">
			<Field.Label for="{uid}-notes" class="text-xs">Notes</Field.Label>
			<Textarea id="{uid}-notes" rows={2} bind:value={notes} disabled={saving} />
		</Field.Root>
		<Field.Root class="gap-1.5">
			<Field.Label for="{uid}-certificate" class="text-xs">Certificate URL</Field.Label>
			<Input
				id="{uid}-certificate"
				type="url"
				placeholder="https://..."
				bind:value={certificateUrl}
				disabled={saving}
			/>
		</Field.Root>
	{/if}

	{#if saveError}
		<Alert.Root variant="destructive">
			<Alert.Title>Training record was not saved</Alert.Title>
			<Alert.Description>{saveError}</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="flex items-center justify-between gap-3">
		{#if showExtras}
			<span></span>
		{:else}
			<Button type="button" variant="link" size="none" class="text-sm" onclick={() => (showExtras = true)}>
				Add a note or certificate link…
			</Button>
		{/if}
		<Button type="submit" disabled={!canSave}>
			{saving ? 'Saving...' : 'Save'}
			<CornerDownLeftIcon aria-hidden="true" />
		</Button>
	</div>

	{#if onOpenRecord}
		<div class="border-t border-border pt-2">
			<Button type="button" variant="ghost" size="xs" onclick={() => onOpenRecord(person)}>Open record</Button>
		</div>
	{/if}
</form>
