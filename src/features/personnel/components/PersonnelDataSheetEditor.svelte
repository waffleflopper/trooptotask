<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick, untrack } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import * as Alert from '$lib/components/ui/alert';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toastStore } from '$lib/stores/toast.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import type { Group, OrganizationRankCatalogEntry } from '../contracts';
	import {
		BLOOD_TYPES,
		EMERGENCY_RELATIONSHIPS,
		MARITAL_STATUSES,
		educationSummary,
		lossWindowHint,
		optionsKeeping,
		vehicleSummary,
		type DataSheetField
	} from '../dataSheetModel';
	import type { Personnel } from '../personnel.types';
	import type { PersonnelExtendedInfo } from '../personnelExtendedInfo.types';
	import { DataSheetDraft } from '../workspace/dataSheetDraft.svelte';
	import { getDataSheetEditSession } from '../workspace/dataSheetEditSession.svelte';

	interface Props {
		orgId: string;
		orgUrlSegment: string;
		person: Personnel;
		info: PersonnelExtendedInfo | null;
		groups: Group[];
		rankCatalog: OrganizationRankCatalogEntry[];
		lossWarningWindowDays: number | null;
		today: string;
	}

	let { orgId, orgUrlSegment, person, info, groups, rankCatalog, lossWarningWindowDays, today }: Props = $props();

	const DETAIL_KEYS = ['app:personnel-detail-header', 'app:personnel-detail-data-sheet'];

	const draft = new DataSheetDraft(untrack(() => ({ orgId, person, info })));
	const session = getDataSheetEditSession();
	const values = draft.values;

	const viewPath = $derived(`/org/${orgUrlSegment}/personnel/${person.slug}/data-sheet` as const);

	const rankOptions = $derived(
		optionsKeeping(
			rankCatalog.filter((entry) => entry.state === 'active').map((entry) => entry.code),
			draft.saved.rank
		).map((code) => ({ value: code, label: code }))
	);
	const groupOptions = $derived([
		{ value: '', label: 'No Group Assigned' },
		...groups.map((group) => ({ value: group.id, label: group.name }))
	]);
	const bloodTypes = $derived(optionsKeeping(BLOOD_TYPES, draft.saved.bloodType));
	const relationships = $derived(optionsKeeping(EMERGENCY_RELATIONSHIPS, draft.saved.emergencyContactRelationship));
	const maritalStatuses = $derived(optionsKeeping(MARITAL_STATUSES, draft.saved.maritalStatus));

	const etsHint = $derived(lossWindowHint(draft.saved.ets, values.ets, today, lossWarningWindowDays));
	const derosHint = $derived(lossWindowHint(draft.saved.deros, values.deros, today, lossWarningWindowDays));

	let educationOpen = $state(false);
	let vehicleOpen = $state(false);
	let leaving = false;
	let discardTarget = $state.raw<{ url: URL; delta?: number } | null>(null);
	let form: HTMLFormElement | undefined = $state();

	function revealRejectedField() {
		const field = draft.rejection?.field;
		if (field === 'civilianEducation' || field === 'militaryEducation') educationOpen = true;
		if (field === 'vehicleMakeModel' || field === 'vehicleColor' || field === 'vehiclePlate') vehicleOpen = true;
	}

	const changed = (...fields: DataSheetField[]) => fields.some(draft.isChanged);
	const error = (...fields: DataSheetField[]) => fields.map(draft.errorFor).find(Boolean);
	const invalid = (field: DataSheetField) => (draft.errorFor(field) ? true : undefined);
	const describedBy = (id: string, ...fields: DataSheetField[]) => (error(...fields) ? `${id}-error` : undefined);

	async function leave(target: { url: URL; delta?: number }) {
		leaving = true;
		if (target.delta) history.go(target.delta);
		else await goto(resolve((target.url.pathname + target.url.search) as '/'), { replaceState: true });
	}

	function requestCancel() {
		if (draft.saving) return;
		const target = { url: new URL(viewPath, location.origin) };
		if (draft.changeCount === 0) void leave(target);
		else discardTarget = target;
	}

	async function save() {
		const saved = await draft.save();
		if (!saved) {
			revealRejectedField();
			await tick();
			form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}
		leaving = true;
		toastStore.success('Data sheet saved');
		await goto(resolve(`/org/${orgUrlSegment}/personnel/${saved.person.slug}/data-sheet`), {
			replaceState: true,
			invalidate: DETAIL_KEYS
		});
	}

	beforeNavigate((navigation) => {
		if (leaving || draft.changeCount === 0) return;
		navigation.cancel();
		if (navigation.willUnload || !navigation.to) return;
		discardTarget = {
			url: navigation.to.url,
			delta: navigation.type === 'popstate' ? navigation.delta : undefined
		};
	});

	onMount(() => session.attach(draft, { save: () => void save(), cancel: requestCancel }));

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented || discardTarget) return;
		requestCancel();
	}

	function addChild() {
		values.children.push({ name: '', age: '' });
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<form bind:this={form} class="grid items-start gap-x-16 gap-y-10 lg:grid-cols-2">
	<fieldset class="contents" disabled={draft.saving}>
		<div class="grid gap-10">
			<PageShell.FactSection title="Identity">
				<PageShell.FactRow label="Rank" labelFor="sheet-rank" changed={changed('rank')} error={error('rank')}>
					<Combobox.Root items={rankOptions} bind:value={values.rank} label="Rank" autoHighlight>
						<Combobox.Trigger id="sheet-rank" placeholder="Select rank..." aria-label="Rank" class="w-32" />
						<Combobox.Content>
							<Combobox.Search placeholder="Select rank..." />
							<Combobox.Empty>No ranks found.</Combobox.Empty>
							<Combobox.List />
						</Combobox.Content>
					</Combobox.Root>
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Name"
					labelFor="sheet-first-name"
					changed={changed('firstName', 'lastName')}
					error={error('firstName', 'lastName')}
				>
					<div class="grid grid-cols-2 gap-2">
						<Input
							id="sheet-first-name"
							aria-label="First name"
							autocomplete="off"
							aria-invalid={invalid('firstName')}
							bind:value={values.firstName}
						/>
						<Input
							id="sheet-last-name"
							aria-label="Last name"
							autocomplete="off"
							aria-invalid={invalid('lastName')}
							bind:value={values.lastName}
						/>
					</div>
				</PageShell.FactRow>
				<PageShell.FactRow label="MOS" labelFor="sheet-mos" changed={changed('mos')} error={error('mos')}>
					<Input id="sheet-mos" class="w-32" aria-invalid={invalid('mos')} bind:value={values.mos} />
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Duty role"
					labelFor="sheet-duty-role"
					changed={changed('clinicRole')}
					error={error('clinicRole')}
				>
					<Input id="sheet-duty-role" aria-invalid={invalid('clinicRole')} bind:value={values.clinicRole} />
				</PageShell.FactRow>
				<PageShell.FactRow label="Group" labelFor="sheet-group" changed={changed('groupId')} error={error('groupId')}>
					<Combobox.Root items={groupOptions} bind:value={values.groupId} label="Group" autoHighlight>
						<Combobox.Trigger id="sheet-group" clearable placeholder="No Group Assigned" aria-label="Group" />
						<Combobox.Content>
							<Combobox.Search placeholder="Search Groups..." />
							<Combobox.Empty>No groups found.</Combobox.Empty>
							<Combobox.List />
						</Combobox.Content>
					</Combobox.Root>
				</PageShell.FactRow>
			</PageShell.FactSection>

			<PageShell.FactSection title="Service">
				<PageShell.FactRow label="BASD" labelFor="sheet-basd" changed={changed('basd')} error={error('basd')}>
					<DatePicker id="sheet-basd" class="w-44" placeholder="Not set" bind:value={values.basd} />
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Date of rank"
					labelFor="sheet-date-of-rank"
					changed={changed('dateOfRank')}
					error={error('dateOfRank')}
				>
					<DatePicker id="sheet-date-of-rank" class="w-44" placeholder="Not set" bind:value={values.dateOfRank} />
				</PageShell.FactRow>
				<PageShell.FactRow
					label="ETS"
					labelFor="sheet-ets"
					changed={changed('ets')}
					error={error('ets')}
					hint={etsHint ?? undefined}
				>
					<DatePicker id="sheet-ets" class="w-44" placeholder="Not set" bind:value={values.ets} />
				</PageShell.FactRow>
				<PageShell.FactRow
					label="PCS / DEROS"
					labelFor="sheet-deros"
					changed={changed('deros')}
					error={error('deros')}
					hint={derosHint ?? undefined}
				>
					<DatePicker id="sheet-deros" class="w-44" placeholder="Not set" bind:value={values.deros} />
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Blood type"
					labelFor="sheet-blood-type"
					changed={changed('bloodType')}
					error={error('bloodType')}
				>
					<NativeSelect.Root id="sheet-blood-type" class="w-32" bind:value={values.bloodType}>
						<NativeSelect.Option value="">Not set</NativeSelect.Option>
						{#each bloodTypes as option (option)}
							<NativeSelect.Option value={option}>{option}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</PageShell.FactRow>
			</PageShell.FactSection>
		</div>

		<div class="grid gap-10">
			<PageShell.FactSection title="Contact">
				<PageShell.FactRow
					label="Personal phone"
					labelFor="sheet-phone"
					changed={changed('personalPhone')}
					error={error('personalPhone')}
				>
					<Input
						id="sheet-phone"
						type="tel"
						class="w-56"
						autocomplete="off"
						aria-invalid={invalid('personalPhone')}
						aria-describedby={describedBy('sheet-phone', 'personalPhone')}
						bind:value={values.personalPhone}
					/>
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Personal email"
					labelFor="sheet-email"
					changed={changed('personalEmail')}
					error={error('personalEmail')}
				>
					<Input
						id="sheet-email"
						type="email"
						autocomplete="off"
						aria-invalid={invalid('personalEmail')}
						aria-describedby={describedBy('sheet-email', 'personalEmail')}
						bind:value={values.personalEmail}
					/>
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Address"
					labelFor="sheet-street"
					changed={changed('addressStreet', 'addressCity', 'addressState', 'addressZip')}
					error={error('addressStreet', 'addressCity', 'addressState', 'addressZip')}
				>
					<div class="grid gap-2">
						<Input
							id="sheet-street"
							aria-label="Street"
							autocomplete="off"
							aria-invalid={invalid('addressStreet')}
							bind:value={values.addressStreet}
						/>
						<div class="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] gap-2">
							<Input
								aria-label="City"
								autocomplete="off"
								aria-invalid={invalid('addressCity')}
								bind:value={values.addressCity}
							/>
							<Input
								aria-label="State"
								autocomplete="off"
								aria-invalid={invalid('addressState')}
								bind:value={values.addressState}
							/>
							<Input
								aria-label="Zip"
								autocomplete="off"
								aria-invalid={invalid('addressZip')}
								bind:value={values.addressZip}
							/>
						</div>
					</div>
				</PageShell.FactRow>
			</PageShell.FactSection>

			<PageShell.FactSection title="Emergency and family">
				<PageShell.FactRow
					label="Emergency contact"
					labelFor="sheet-emergency-name"
					changed={changed('emergencyContactName', 'emergencyContactRelationship')}
					error={error('emergencyContactName', 'emergencyContactRelationship')}
				>
					<div class="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
						<Input
							id="sheet-emergency-name"
							aria-label="Emergency contact name"
							autocomplete="off"
							aria-invalid={invalid('emergencyContactName')}
							bind:value={values.emergencyContactName}
						/>
						<NativeSelect.Root
							aria-label="Relationship"
							class="w-full"
							bind:value={values.emergencyContactRelationship}
						>
							<NativeSelect.Option value="">Relationship</NativeSelect.Option>
							{#each relationships as option (option)}
								<NativeSelect.Option value={option}>{option}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</div>
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Emergency phone"
					labelFor="sheet-emergency-phone"
					changed={changed('emergencyContactPhone')}
					error={error('emergencyContactPhone')}
				>
					<Input
						id="sheet-emergency-phone"
						type="tel"
						class="w-56"
						autocomplete="off"
						aria-invalid={invalid('emergencyContactPhone')}
						aria-describedby={describedBy('sheet-emergency-phone', 'emergencyContactPhone')}
						bind:value={values.emergencyContactPhone}
					/>
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Marital status"
					labelFor="sheet-marital-status"
					changed={changed('maritalStatus', 'maritalStatusDate')}
					error={error('maritalStatus', 'maritalStatusDate')}
				>
					<div class="flex flex-wrap items-center gap-2">
						<NativeSelect.Root id="sheet-marital-status" class="w-40" bind:value={values.maritalStatus}>
							<NativeSelect.Option value="">Not set</NativeSelect.Option>
							{#each maritalStatuses as option (option)}
								<NativeSelect.Option value={option}>{option}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
						<DatePicker
							class="w-44"
							aria-label="Marital status date"
							placeholder="Date"
							bind:value={values.maritalStatusDate}
						/>
					</div>
				</PageShell.FactRow>
				<PageShell.FactRow label="Spouse" labelFor="sheet-spouse-name" changed={changed('spouseName', 'spousePhone')}>
					<div class="grid grid-cols-[minmax(0,1fr)_10rem] gap-2">
						<Input id="sheet-spouse-name" aria-label="Spouse name" autocomplete="off" bind:value={values.spouseName} />
						<Input type="tel" aria-label="Spouse phone" autocomplete="off" bind:value={values.spousePhone} />
					</div>
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Dependents"
					labelFor="sheet-dependents"
					changed={changed('numberOfDependents', 'children')}
					error={error('numberOfDependents', 'children')}
				>
					<div class="grid gap-2">
						<div class="flex items-center gap-3">
							<Input
								id="sheet-dependents"
								type="number"
								min="0"
								inputmode="numeric"
								class="w-20"
								aria-invalid={invalid('numberOfDependents')}
								bind:value={values.numberOfDependents}
							/>
							<Button type="button" variant="link" class="px-0" onclick={addChild}>
								<PlusIcon />
								Add child
							</Button>
						</div>
						{#each values.children as child, index (index)}
							<div class="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-2">
								<Input aria-label="Child {index + 1} name" autocomplete="off" bind:value={child.name} />
								<Input
									type="number"
									min="0"
									inputmode="numeric"
									aria-label="Child {index + 1} age"
									placeholder="Age"
									bind:value={child.age}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label="Remove child {index + 1}"
									onclick={() => values.children.splice(index, 1)}
								>
									<XIcon />
								</Button>
							</div>
						{/each}
					</div>
				</PageShell.FactRow>
			</PageShell.FactSection>

			<PageShell.FactSection title="Education" summary={educationSummary(values)} bind:open={educationOpen}>
				<PageShell.FactRow
					label="Civilian"
					labelFor="sheet-civilian-education"
					changed={changed('civilianEducation')}
					error={error('civilianEducation')}
				>
					<Input
						id="sheet-civilian-education"
						autocomplete="off"
						aria-invalid={invalid('civilianEducation')}
						bind:value={values.civilianEducation}
					/>
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Military"
					labelFor="sheet-military-education"
					changed={changed('militaryEducation')}
					error={error('militaryEducation')}
					hint="One course per line."
				>
					<Textarea
						id="sheet-military-education"
						rows={3}
						aria-invalid={invalid('militaryEducation')}
						bind:value={values.militaryEducation}
					/>
				</PageShell.FactRow>
			</PageShell.FactSection>

			<PageShell.FactSection title="Vehicle" summary={vehicleSummary(values)} bind:open={vehicleOpen}>
				<PageShell.FactRow
					label="POV"
					labelFor="sheet-vehicle"
					changed={changed('vehicleColor', 'vehicleMakeModel')}
					error={error('vehicleColor', 'vehicleMakeModel')}
				>
					<div class="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
						<Input aria-label="Vehicle color" autocomplete="off" bind:value={values.vehicleColor} />
						<Input
							id="sheet-vehicle"
							aria-label="Vehicle make and model"
							autocomplete="off"
							bind:value={values.vehicleMakeModel}
						/>
					</div>
				</PageShell.FactRow>
				<PageShell.FactRow
					label="Plate"
					labelFor="sheet-plate"
					changed={changed('vehiclePlate')}
					error={error('vehiclePlate')}
				>
					<Input id="sheet-plate" class="w-44 font-mono" autocomplete="off" bind:value={values.vehiclePlate} />
				</PageShell.FactRow>
			</PageShell.FactSection>

			{#if draft.formError}
				<Alert.Root variant="destructive">
					<Alert.Description>{draft.formError}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>
	</fieldset>
</form>

{#if discardTarget}
	{@const target = discardTarget}
	<ConfirmDialog
		title="Discard changes?"
		message="You have {draft.changeCount} unsaved {draft.changeCount === 1
			? 'change'
			: 'changes'} on this data sheet. Leaving discards them."
		confirmLabel="Discard changes"
		cancelLabel="Keep editing"
		onConfirm={() => void leave(target)}
		onCancel={() => (discardTarget = null)}
	/>
{/if}
