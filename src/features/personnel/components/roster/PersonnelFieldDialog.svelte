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
	import type { PersonnelBulkField, PersonnelFieldChange } from '../../contracts';
	import type { Personnel } from '../../personnel.types';
	import type { RosterFieldSaveResult } from '../../rosterFieldSave';
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
		/** Saves the change for these People and reports what each batch did. */
		onsave: (change: PersonnelFieldChange, ids: string[]) => Promise<RosterFieldSaveResult>;
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
	let outcome = $state.raw<RosterFieldSaveResult | null>(null);

	const label = $derived(personnelBulkFieldLabel(field));
	const value = $derived(values[field].trim());
	const valid = $derived(field === 'ets' ? isDateOnly(value) : field === 'rank' ? rankCodes.includes(value) : !!value);
	const change = $derived<PersonnelFieldChange>({ field, value } as PersonnelFieldChange);
	const plan = $derived(planPersonnelFieldChange(people, change));
	const sent = $derived(plan.changing.map(({ person }) => person.id));

	type PersonOutcome = 'updated' | 'refused' | 'unavailable' | 'not-saved' | 'unconfirmed';
	const OUTCOME_BADGES = {
		updated: { text: 'Updated', variant: 'success' },
		refused: { text: 'No access', variant: 'danger' },
		unavailable: { text: 'No longer available', variant: 'warning' },
		'not-saved': { text: 'Not saved', variant: 'danger' },
		unconfirmed: { text: 'Not confirmed', variant: 'warning' }
	} as const satisfies Record<PersonOutcome, { text: string; variant: 'success' | 'danger' | 'warning' }>;

	function personOutcomes({ answered, interrupted }: RosterFieldSaveResult): ReadonlyMap<string, PersonOutcome> {
		const each = (ids: readonly string[], value: PersonOutcome) => ids.map((id) => [id, value] as const);
		return new Map([
			...each(answered.updatedIds, 'updated'),
			...each(answered.refusedIds, 'refused'),
			...each(answered.unavailableIds, 'unavailable'),
			...(interrupted
				? [...each(interrupted.failedIds, interrupted.outcome), ...each(interrupted.unsentIds, 'not-saved')]
				: [])
		]);
	}

	const outcomes = $derived<ReadonlyMap<string, PersonOutcome>>(outcome ? personOutcomes(outcome) : new Map());
	const updatedCount = $derived(outcome?.answered.updatedIds.length ?? 0);
	const unconfirmed = $derived(outcome?.interrupted?.outcome === 'unconfirmed');

	const saving = new PendingSave();
	const save = () =>
		saving.run(async () => {
			if (!valid || sent.length === 0) return;
			failure = null;
			const saved = plan;
			try {
				const result = await onsave(change, sent);
				const { answered, interrupted } = result;
				if (!interrupted && answered.updatedIds.length === sent.length) {
					ondone({ field: change.field, updated: answered.updatedIds.length, alreadySet: saved.alreadySet });
					return;
				}
				const nothingAnswered =
					answered.updatedIds.length + answered.refusedIds.length + answered.unavailableIds.length === 0;
				if (interrupted?.outcome === 'not-saved' && nothingAnswered) {
					failure = interrupted.message;
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
					<strong class="font-semibold">{count(updatedCount)}</strong> updated. {count(sent.length - updatedCount)} not.
				</p>
				{#if unconfirmed}
					<Alert.Root>
						<Alert.Description>
							Some changes could not be confirmed. Reload to see what saved before trying them again.
						</Alert.Description>
					</Alert.Root>
				{:else if outcome.interrupted}
					<Alert.Root variant="destructive">
						<Alert.Description>{outcome.interrupted.message}</Alert.Description>
					</Alert.Root>
				{/if}
				<ul class="max-h-72 divide-y overflow-y-auto rounded-md border text-sm" aria-label="Results">
					{#each plan.changing as { person } (person.id)}
						{@const status = OUTCOME_BADGES[outcomes.get(person.id) ?? 'unavailable']}
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
				{#if unconfirmed}
					<Button variant="outline" onclick={() => location.reload()}>Reload</Button>
				{/if}
				<Button onclick={onclose}>Close</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
