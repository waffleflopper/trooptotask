<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	const statusOptions = [
		{ value: 'ready', label: 'Ready' },
		{ value: 'watch', label: 'Watch' },
		{ value: 'action', label: 'Action required' }
	];
	const people = [
		{ value: 'avery', label: 'Avery Brooks', description: 'HQ', group: 'HQ' },
		{ value: 'maya', label: 'Maya Chen', description: 'A Co', group: 'Line companies' },
		{ value: 'jon', label: 'Jon Bell', description: 'B Co', group: 'Line companies', disabled: true }
	];
	const filters = [
		{ value: 'hq', label: 'HQ', group: 'Staff' },
		{ value: 'a-co', label: 'A Co', group: 'Line companies' },
		{ value: 'b-co', label: 'B Co', group: 'Line companies' }
	];

	let title = $state('Initial task');
	let notes = $state('Short');
	let nativeStatus = $state('ready');
	let selectedStatus = $state('ready');
	let selectedPerson = $state('');
	let selectedFilters = $state<string[]>(['hq']);
	let checked = $state(false);

	const notesError = $derived(notes.trim().length < 6 ? 'Notes are too short.' : '');
	const selectedStatusLabel = $derived(
		statusOptions.find((option) => option.value === selectedStatus)?.label ?? 'Status'
	);
</script>

<Field.Root>
	<Field.Label for="task-title">Task title <span aria-hidden="true">*</span></Field.Label>
	<Field.Control>
		<Input id="task-title" name="title" bind:value={title} required />
	</Field.Control>
	<Field.Description>Use the official task name.</Field.Description>
</Field.Root>

<Field.Root data-invalid={notesError ? true : undefined}>
	<Field.Label for="task-notes">Notes</Field.Label>
	<Field.Control>
		<Textarea id="task-notes" bind:value={notes} />
	</Field.Control>
	{#if notesError}
		<Field.Error>{notesError}</Field.Error>
	{/if}
</Field.Root>

<Field.Root>
	<Field.Label for="native-status">Native status</Field.Label>
	<Field.Control>
		<NativeSelect id="native-status" name="nativeStatus" bind:value={nativeStatus}>
			{#each statusOptions as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</NativeSelect>
	</Field.Control>
	<Field.Description id="native-status-help">Matches the unit status board.</Field.Description>
</Field.Root>

<Field.Root>
	<Field.Label id="custom-status-label">Custom status</Field.Label>
	<Field.Control>
		<Select.Root type="single" bind:value={selectedStatus}>
			<Select.Trigger aria-labelledby="custom-status-label">{selectedStatusLabel}</Select.Trigger>
			<Select.Content>
				{#each statusOptions as option (option.value)}
					<Select.Item value={option.value} label={option.label} />
				{/each}
			</Select.Content>
		</Select.Root>
	</Field.Control>
	<Field.Error>Choose a reviewed status.</Field.Error>
</Field.Root>

<Field.Root>
	<Field.Label id="person-label">Person</Field.Label>
	<Field.Control>
		<Combobox.Root items={people} name="personId" bind:value={selectedPerson} label="Person">
			<Combobox.Trigger clearable aria-labelledby="person-label">
				{selectedPerson
					? (people.find((person) => person.value === selectedPerson)?.label ?? selectedPerson)
					: 'Search personnel'}
			</Combobox.Trigger>
			<Combobox.Content>
				<Combobox.Search placeholder="Search people" />
				<Combobox.Empty>No people found.</Combobox.Empty>
				<Combobox.List>
					{#snippet children(value, option)}
						<Combobox.Item {value} label={option.label} description={option.description} />
					{/snippet}
				</Combobox.List>
			</Combobox.Content>
		</Combobox.Root>
	</Field.Control>
	<Field.Description>Search by last name.</Field.Description>
</Field.Root>

<div role="group" aria-label="Shared form filters">
	<Combobox.Root items={filters} multiple name="groupIds" bind:value={selectedFilters} label="Groups">
		<Combobox.Chips>
			<Combobox.Value>
				{#snippet children(values)}
					<span data-testid="selected-count">{values.length} selected</span>
					{#each values as filterValue (filterValue)}
						{@const filter = filters.find((option) => option.value === filterValue)}
						<Combobox.Chip value={filterValue}>{filter?.label ?? filterValue}</Combobox.Chip>
					{/each}
					<Combobox.ChipsInput placeholder="Groups" aria-label="Groups" />
				{/snippet}
			</Combobox.Value>
		</Combobox.Chips>
		<Combobox.Content>
			<Combobox.Empty>No groups found.</Combobox.Empty>
			<Combobox.List>
				{#snippet children(value, option)}
					<Combobox.Item {value} label={option.label} />
				{/snippet}
			</Combobox.List>
		</Combobox.Content>
	</Combobox.Root>
</div>

<Combobox.Root items={people} loading loadingText="Loading personnel..." label="Loading people">
	<Combobox.Trigger aria-label="Loading people">Search personnel</Combobox.Trigger>
	<Combobox.Content>
		<Combobox.List />
	</Combobox.Content>
</Combobox.Root>

<Field.Group>
	<Field.Root orientation="horizontal">
		<Checkbox id="include-archive" bind:checked />
		<Field.Label for="include-archive">Include archived records</Field.Label>
	</Field.Root>
	<Field.Root>
		<Field.Label for="disabled-input">Disabled field</Field.Label>
		<Field.Control>
			<Input id="disabled-input" value="Unavailable" disabled />
		</Field.Control>
	</Field.Root>
</Field.Group>

<output aria-label="Current values">
	{title}|{notes}|{nativeStatus}|{selectedStatus}|{selectedPerson}|{selectedFilters.join(',')}|{checked}
</output>
