<script lang="ts">
	import { invalidate } from '$app/navigation';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { PersonnelExtendedInfo } from '$features/personnel/contracts';
	import { untrack } from 'svelte';

	interface Props {
		orgId: string;
		personnelId: string;
		initialInfo: PersonnelExtendedInfo;
		onClose: () => void;
	}

	let { orgId, personnelId, initialInfo, onClose }: Props = $props();

	const initialForm = untrack(() => ({
		...initialInfo,
		childrenText: initialInfo.children
			.map((child) => `${child.name}${child.age == null ? '' : `, ${child.age}`}`)
			.join('\n'),
		militaryEducationText: initialInfo.militaryEducation.join('\n')
	}));
	let form = $state(initialForm);
	let isSaving = $state(false);
	let errorMessage = $state('');

	function parseChildren(value: string) {
		return value
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [namePart, agePart] = line.split(',').map((part) => part.trim());
				const parsedAge = agePart ? Number(agePart) : null;
				return {
					name: namePart,
					age: Number.isFinite(parsedAge) ? parsedAge : null
				};
			});
	}

	function parseMilitaryEducation(value: string) {
		return value
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (isSaving) return;
		isSaving = true;
		errorMessage = '';

		try {
			const response = await fetch(`/org/${orgId}/api/personnel/${personnelId}/extended-info`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					personnelId,
					bloodType: form.bloodType,
					basd: form.basd,
					dateOfRank: form.dateOfRank,
					maritalStatus: form.maritalStatus,
					numberOfDependents: form.numberOfDependents,
					children: parseChildren(form.childrenText),
					civilianEducation: form.civilianEducation,
					militaryEducation: parseMilitaryEducation(form.militaryEducationText),
					emergencyContactName: form.emergencyContactName,
					emergencyContactRelationship: form.emergencyContactRelationship,
					emergencyContactPhone: form.emergencyContactPhone,
					spouseName: form.spouseName,
					spousePhone: form.spousePhone,
					vehicleMakeModel: form.vehicleMakeModel,
					vehiclePlate: form.vehiclePlate,
					vehicleColor: form.vehicleColor,
					personalEmail: form.personalEmail,
					personalPhone: form.personalPhone,
					addressStreet: form.addressStreet,
					addressCity: form.addressCity,
					addressState: form.addressState,
					addressZip: form.addressZip
				})
			});

			if (!response.ok) {
				errorMessage = await response.text();
				throw new Error(errorMessage || 'Failed to save Soldier Data Sheet');
			}

			toastStore.success('Soldier Data Sheet saved');
			await invalidate('app:personnel-detail');
			onClose();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to save Soldier Data Sheet';
			toastStore.error(errorMessage);
		} finally {
			isSaving = false;
		}
	}
</script>

<AppDialog.Root open busy={isSaving} {onClose}>
	<AppDialog.Content size="fullscreen">
		<AppDialog.Header class="px-4 pt-4">
			<AppDialog.Title>Soldier Data Sheet</AppDialog.Title>
			<AppDialog.Description
				>Maintain personal, military, family, education, and emergency contact details.</AppDialog.Description
			>
		</AppDialog.Header>

		<AppDialog.Body class="overflow-y-auto">
			<form id="soldier-data-sheet-form" class="grid gap-4" onsubmit={handleSubmit}>
				<fieldset class="contents" disabled={isSaving}>
					<Tabs.Root value="personal" class="lg:hidden">
						<Tabs.List class="grid grid-cols-3">
							<Tabs.Trigger value="personal">Personal</Tabs.Trigger>
							<Tabs.Trigger value="family">Family</Tabs.Trigger>
							<Tabs.Trigger value="education">Education</Tabs.Trigger>
						</Tabs.List>
						<Tabs.Content value="personal" class="mt-4 grid gap-4">
							{@render PersonalFields('tab')}
							{@render MilitaryFields('tab')}
						</Tabs.Content>
						<Tabs.Content value="family" class="mt-4 grid gap-4">
							{@render FamilyFields('tab')}
						</Tabs.Content>
						<Tabs.Content value="education" class="mt-4 grid gap-4">
							{@render EducationFields('tab')}
							{@render EmergencyFields('tab')}
						</Tabs.Content>
					</Tabs.Root>

					<div class="hidden gap-6 lg:grid lg:grid-cols-3">
						<section class="grid content-start gap-4">
							<h3 class="text-sm font-semibold">Personal info</h3>
							{@render PersonalFields('grid')}
							{@render MilitaryFields('grid')}
						</section>
						<section class="grid content-start gap-4">
							<h3 class="text-sm font-semibold">Family and dependents</h3>
							{@render FamilyFields('grid')}
						</section>
						<section class="grid content-start gap-4">
							<h3 class="text-sm font-semibold">Education and emergency contact</h3>
							{@render EducationFields('grid')}
							{@render EmergencyFields('grid')}
						</section>
					</div>

					{#if errorMessage}
						<p class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
							{errorMessage}
						</p>
					{/if}
				</fieldset>
			</form>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button type="button" variant="outline" onclick={onClose} disabled={isSaving}>Cancel</Button>
			<Button type="submit" form="soldier-data-sheet-form" disabled={isSaving}>
				{isSaving ? 'Saving...' : 'Save'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#snippet PersonalFields(layout: string)}
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="grid gap-2">
			<Label for="{layout}-blood-type">Blood type</Label>
			<Input id="{layout}-blood-type" bind:value={form.bloodType} />
		</div>
		<div class="grid gap-2">
			<Label for="{layout}-marital-status">Marital status</Label>
			<Input id="{layout}-marital-status" bind:value={form.maritalStatus} />
		</div>
	</div>
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="grid gap-2">
			<Label for="{layout}-personal-phone">Personal phone</Label>
			<Input id="{layout}-personal-phone" bind:value={form.personalPhone} />
		</div>
		<div class="grid gap-2">
			<Label for="{layout}-personal-email">Personal email</Label>
			<Input id="{layout}-personal-email" type="email" bind:value={form.personalEmail} />
		</div>
	</div>
	<div class="grid gap-2">
		<Label for="{layout}-address-street">Address</Label>
		<Input id="{layout}-address-street" bind:value={form.addressStreet} />
	</div>
	<div class="grid gap-4 sm:grid-cols-[1fr_5rem_7rem]">
		<Input aria-label="Address city" placeholder="City" bind:value={form.addressCity} />
		<Input aria-label="Address state" placeholder="State" bind:value={form.addressState} />
		<Input aria-label="Address ZIP" placeholder="ZIP" bind:value={form.addressZip} />
	</div>
{/snippet}

{#snippet MilitaryFields(layout: string)}
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="grid gap-2">
			<Label for="{layout}-basd">BASD</Label>
			<Input id="{layout}-basd" type="date" bind:value={form.basd} />
		</div>
		<div class="grid gap-2">
			<Label for="{layout}-date-of-rank">Date of rank</Label>
			<Input id="{layout}-date-of-rank" type="date" bind:value={form.dateOfRank} />
		</div>
	</div>
{/snippet}

{#snippet FamilyFields(layout: string)}
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="grid gap-2">
			<Label for="{layout}-spouse-name">Spouse name</Label>
			<Input id="{layout}-spouse-name" bind:value={form.spouseName} />
		</div>
		<div class="grid gap-2">
			<Label for="{layout}-spouse-phone">Spouse phone</Label>
			<Input id="{layout}-spouse-phone" bind:value={form.spousePhone} />
		</div>
	</div>
	<div class="grid gap-2">
		<Label for="{layout}-dependents">Number of dependents</Label>
		<Input id="{layout}-dependents" type="number" min="0" max="99" bind:value={form.numberOfDependents} />
	</div>
	<div class="grid gap-2">
		<Label for="{layout}-children">Children</Label>
		<Textarea id="{layout}-children" class="min-h-24" bind:value={form.childrenText} placeholder="Name, age" />
	</div>
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="grid gap-2">
			<Label for="{layout}-vehicle-color">Vehicle color</Label>
			<Input id="{layout}-vehicle-color" bind:value={form.vehicleColor} />
		</div>
		<div class="grid gap-2">
			<Label for="{layout}-vehicle-model">Vehicle</Label>
			<Input id="{layout}-vehicle-model" bind:value={form.vehicleMakeModel} />
		</div>
		<div class="grid gap-2">
			<Label for="{layout}-vehicle-plate">Plate</Label>
			<Input id="{layout}-vehicle-plate" bind:value={form.vehiclePlate} />
		</div>
	</div>
{/snippet}

{#snippet EducationFields(layout: string)}
	<div class="grid gap-2">
		<Label for="{layout}-civilian-education">Civilian education</Label>
		<Textarea id="{layout}-civilian-education" class="min-h-24" bind:value={form.civilianEducation} />
	</div>
	<div class="grid gap-2">
		<Label for="{layout}-military-education">Military education</Label>
		<Textarea
			id="{layout}-military-education"
			class="min-h-24"
			bind:value={form.militaryEducationText}
			placeholder="BLC"
		/>
	</div>
{/snippet}

{#snippet EmergencyFields(layout: string)}
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="grid gap-2">
			<Label for="{layout}-emergency-name">Emergency contact</Label>
			<Input id="{layout}-emergency-name" bind:value={form.emergencyContactName} />
		</div>
		<div class="grid gap-2">
			<Label for="{layout}-emergency-relationship">Relationship</Label>
			<Input id="{layout}-emergency-relationship" bind:value={form.emergencyContactRelationship} />
		</div>
	</div>
	<div class="grid gap-2">
		<Label for="{layout}-emergency-phone">Emergency phone</Label>
		<Input id="{layout}-emergency-phone" bind:value={form.emergencyContactPhone} />
	</div>
{/snippet}
