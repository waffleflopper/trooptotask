<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { Personnel } from '$features/personnel/contracts';
	import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
	import type { TrainingStatusInfo } from '$features/training/utils/trainingStatus';
	import { getColumnIntervalLabel, getStatusLine } from '$features/training/utils/cellDisplayText';
	import { Button } from '$lib/components/ui/button';
	import TrainingRecordForm from './TrainingRecordForm.svelte';

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

	function saved(isUpdate: boolean) {
		toast.success(isUpdate ? 'Training record updated' : 'Training record saved');
		onClose();
	}

	const statusLine = $derived(getStatusLine(statusInfo, training, type));

	const toneClass = {
		danger: 'text-danger-foreground',
		warning: 'text-warning-foreground',
		muted: 'text-muted-foreground'
	};
</script>

<TrainingRecordForm {person} {type} {training} {orgId} {today} {isCurrent} {onSave} onSaved={saved}>
	{#snippet header()}
		<div class="grid gap-1">
			<div class="flex items-baseline justify-between gap-3 font-mono text-[0.6875rem] tracking-[0.08em] uppercase">
				<span class="min-w-0 truncate text-muted-foreground">Record · {type.name}</span>
				<span class="shrink-0 text-muted-foreground">{getColumnIntervalLabel(type)}</span>
			</div>
			<p class="font-heading text-base leading-tight font-semibold">
				{person.rank}
				{person.lastName}, {person.firstName}
			</p>
			<p class={['text-xs', toneClass[statusLine.tone]]}>{statusLine.text}</p>
		</div>
	{/snippet}
	{#snippet footer()}
		{#if onOpenRecord}
			<div class="border-t border-border pt-2">
				<Button type="button" variant="ghost" size="xs" onclick={() => onOpenRecord(person)}>Open record</Button>
			</div>
		{/if}
	{/snippet}
</TrainingRecordForm>
