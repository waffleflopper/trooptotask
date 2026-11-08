<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { isDateOnly } from '$lib/utils/dates';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import type { PersonnelBulkField, PersonnelFieldBulkResult, PersonnelFieldChange } from '../../contracts';
	import type { Personnel } from '../../personnel.types';
	import {
		PERSONNEL_BULK_FIELDS,
		personnelBulkFieldLabel,
		personnelFieldDisplay,
		planPersonnelFieldChange
	} from '../../personnelFieldChange';

	interface Props {
		/** The selected People the viewer can edit, as they were when the dialog opened. */
		people: readonly Personnel[];
		/** Selected People the viewer cannot edit. */
		notEditable: number;
		/** The Organization's active rank codes. */
		rankCodes: readonly string[];
		/** Saves the change for these People. Rejects with a message to show when nothing could be confirmed. */
		onsave: (change: PersonnelFieldChange, ids: string[]) => Promise<PersonnelFieldBulkResult>;
		/** Everyone sent was updated. The caller reports it and closes the dialog. */
		ondone: (summary: { field: PersonnelBulkField; updated: number; alreadySet: number }) => void;
		onclose: () => void;
	}

	let { people, notEditable, rankCodes, onsave, ondone, onclose }: Props = $props();

	const count = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
	const nameOf = (person: Personnel) => `${person.rank} ${person.lastName}, ${person.firstName}`;

	let step = $state<'choose' | 'review' | 'result'>('choose');
	let field = $state<PersonnelBulkField>('rank');
	let values = $state<Record<PersonnelBulkField, string>>({ rank: '', mos: '', clinicRole: '', ets: '' });
	let failure = $state<string | null>(null);
	let outcome = $state.raw<PersonnelFieldBulkResult | null>(null);

	const label = $derived(personnelBulkFieldLabel(field));
	const value = $derived(values[field].trim());
	const valid = $derived(field === 'ets' ? isDateOnly(value) : field === 'rank' ? rankCodes.includes(value) : !!value);
	const change = $derived<PersonnelFieldChange>({ field, value } as PersonnelFieldChange);
	const plan = $derived(planPersonnelFieldChange(people, change));
	const sent = $derived(plan.changing.map(({ person }) => person.id));

	const outcomeLabel = (id: string) => {
		if (outcome?.updatedIds.includes(id)) return { text: 'Updated', variant: 'success' } as const;
		if (outcome?.refusedIds.includes(id)) return { text: 'No access', variant: 'danger' } as const;
		return { text: 'No longer available', variant: 'warning' } as const;
	};

	const saving = new PendingSave();
	const save = () =>
		saving.run(async () => {
			if (!valid || sent.length === 0) return;
			failure = null;
			const saved = plan;
			try {
				const result = await onsave(change, sent);
				if (result.updatedIds.length === sent.length) {
					ondone({ field: change.field, updated: result.updatedIds.length, alreadySet: saved.alreadySet });
					return;
				}
				outcome = result;
				step = 'result';
			} catch (caught) {
				failure = caught instanceof Error ? caught.message : 'Unable to save the change.';
			}
		});
</script>

<AppDialog.Root open busy={saving.pending} onClose={onclose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>
				{step === 'choose'
					? 'Set field'
					: step === 'review'
						? `Set ${label} for ${count(plan.changing.length)}`
						: 'Result'}
			</AppDialog.Title>
			<AppDialog.Description>
				{#if step === 'choose'}
					Give {count(people.length)} the same value. You review each change before it is saved.
				{:else if step === 'review'}
					Check each change, then save.
				{:else}
					Some changes were not saved.
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid content-start gap-4">
			{#if step === 'choose'}
				<Field.Root>
					<Field.Label for="bulk-field">Field</Field.Label>
					<NativeSelect id="bulk-field" bind:value={field} class="w-full">
						{#each PERSONNEL_BULK_FIELDS as entry (entry.field)}
							<option value={entry.field}>{entry.label}</option>
						{/each}
					</NativeSelect>
				</Field.Root>
				<Field.Root>
					<Field.Label for="bulk-value">New {label}</Field.Label>
					{#if field === 'rank'}
						<NativeSelect id="bulk-value" bind:value={values.rank} class="w-full">
							<option value="" disabled>Choose a rank</option>
							{#each rankCodes as code (code)}
								<option value={code}>{code}</option>
							{/each}
						</NativeSelect>
					{:else if field === 'ets'}
						<DatePicker id="bulk-value" bind:value={values.ets} placeholder="Select date" class="w-full" />
					{:else}
						<Input id="bulk-value" bind:value={values[field]} maxlength={100} autocomplete="off" />
					{/if}
				</Field.Root>
				{#if notEditable > 0}
					<p class="text-sm text-muted-foreground">
						{count(notEditable)} you cannot edit will be left out.
					</p>
				{/if}
			{:else if step === 'review'}
				<p class="text-sm" role="status">
					<strong class="font-semibold">{count(plan.changing.length)}</strong> will change.
					{#if plan.alreadySet > 0}{count(plan.alreadySet)} already {plan.alreadySet === 1 ? 'has' : 'have'} this value.{/if}
					{#if notEditable > 0}{count(notEditable)} you cannot edit will be left out.{/if}
				</p>
				{#if failure}
					<Alert.Root variant="destructive">
						<Alert.Description>{failure}</Alert.Description>
					</Alert.Root>
				{/if}
				{#if plan.changing.length > 0}
					<ul class="max-h-72 divide-y overflow-y-auto rounded-md border text-sm" aria-label="Changes to review">
						{#each plan.changing as { person, from } (person.id)}
							<li class="grid gap-0.5 px-3 py-2">
								<span class="font-medium">{nameOf(person)}</span>
								<span class="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
									<span>{personnelFieldDisplay(field, from)}</span>
									<ArrowRightIcon class="size-3.5 shrink-0" aria-label="to" />
									<span class="font-medium text-foreground">{personnelFieldDisplay(field, value)}</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if outcome}
				<p class="text-sm" role="status">
					<strong class="font-semibold">{count(outcome.updatedIds.length)}</strong> updated. {count(
						sent.length - outcome.updatedIds.length
					)} not.
				</p>
				<ul class="max-h-72 divide-y overflow-y-auto rounded-md border text-sm" aria-label="Results">
					{#each plan.changing as { person } (person.id)}
						{@const status = outcomeLabel(person.id)}
						<li class="flex items-center justify-between gap-3 px-3 py-2">
							<span class="min-w-0 font-medium">{nameOf(person)}</span>
							<Badge variant={status.variant}>{status.text}</Badge>
						</li>
					{/each}
				</ul>
			{/if}
		</AppDialog.Body>
		<AppDialog.Footer>
			{#if step === 'choose'}
				<Button variant="outline" onclick={onclose}>Cancel</Button>
				<Button disabled={!valid || people.length === 0} onclick={() => (step = 'review')}>Review changes</Button>
			{:else if step === 'review'}
				<Button variant="outline" disabled={saving.pending} onclick={() => (step = 'choose')}>Back</Button>
				<Button disabled={sent.length === 0 || saving.pending} onclick={save}>
					{#if saving.pending}<Spinner />{/if}
					Save {plan.changing.length === 0 ? '' : count(plan.changing.length)}
				</Button>
			{:else}
				<Button onclick={onclose}>Close</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
