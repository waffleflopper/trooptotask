<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { PersonnelExtendedInfo } from '$lib/types/leadersBook';
	import { personnelExtendedInfoStore } from '$lib/stores/personnelExtendedInfo.svelte';

	interface Props {
		person: Personnel;
		onClose: () => void;
	}

	let { person, onClose }: Props = $props();

	const existingInfo = $derived(personnelExtendedInfoStore.getByPersonnelId(person.id));

	// Form state
	let emergencyContactName = $state(existingInfo?.emergencyContactName ?? '');
	let emergencyContactRelationship = $state(existingInfo?.emergencyContactRelationship ?? '');
	let emergencyContactPhone = $state(existingInfo?.emergencyContactPhone ?? '');
	let spouseName = $state(existingInfo?.spouseName ?? '');
	let spousePhone = $state(existingInfo?.spousePhone ?? '');
	let vehicleMakeModel = $state(existingInfo?.vehicleMakeModel ?? '');
	let vehiclePlate = $state(existingInfo?.vehiclePlate ?? '');
	let vehicleColor = $state(existingInfo?.vehicleColor ?? '');
	let personalEmail = $state(existingInfo?.personalEmail ?? '');
	let personalPhone = $state(existingInfo?.personalPhone ?? '');
	let addressStreet = $state(existingInfo?.addressStreet ?? '');
	let addressCity = $state(existingInfo?.addressCity ?? '');
	let addressState = $state(existingInfo?.addressState ?? '');
	let addressZip = $state(existingInfo?.addressZip ?? '');
	let leaderNotes = $state(existingInfo?.leaderNotes ?? '');

	let saving = $state(false);

	async function handleSave() {
		saving = true;
		try {
			await personnelExtendedInfoStore.upsert(person.id, {
				emergencyContactName: emergencyContactName.trim() || null,
				emergencyContactRelationship: emergencyContactRelationship.trim() || null,
				emergencyContactPhone: emergencyContactPhone.trim() || null,
				spouseName: spouseName.trim() || null,
				spousePhone: spousePhone.trim() || null,
				vehicleMakeModel: vehicleMakeModel.trim() || null,
				vehiclePlate: vehiclePlate.trim() || null,
				vehicleColor: vehicleColor.trim() || null,
				personalEmail: personalEmail.trim() || null,
				personalPhone: personalPhone.trim() || null,
				addressStreet: addressStreet.trim() || null,
				addressCity: addressCity.trim() || null,
				addressState: addressState.trim() || null,
				addressZip: addressZip.trim() || null,
				leaderNotes: leaderNotes.trim() || null
			});
			onClose();
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="modal-overlay"
	role="dialog"
	aria-modal="true"
	aria-labelledby="extended-info-title"
	tabindex="-1"
	onkeydown={(e) => e.key === 'Escape' && onClose()}
>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal" style="width: 600px; max-height: 90vh;" role="document">
		<div class="modal-header">
			<h2 id="extended-info-title">Soldier Information</h2>
			<button class="btn btn-secondary btn-sm" onclick={onClose}>&times;</button>
		</div>

		<div class="modal-body">
			<div class="person-info">
				<span class="person-rank">{person.rank}</span>
				<span class="person-name">{person.lastName}, {person.firstName}</span>
			</div>

			<div class="section">
				<h3>Emergency Contact</h3>
				<div class="form-row">
					<div class="form-group flex-2">
						<label class="label">Name</label>
						<input type="text" class="input" bind:value={emergencyContactName} placeholder="Full name" />
					</div>
					<div class="form-group flex-1">
						<label class="label">Relationship</label>
						<input
							type="text"
							class="input"
							bind:value={emergencyContactRelationship}
							placeholder="e.g., Spouse"
						/>
					</div>
				</div>
				<div class="form-group">
					<label class="label">Phone</label>
					<input
						type="tel"
						class="input"
						bind:value={emergencyContactPhone}
						placeholder="(555) 123-4567"
					/>
				</div>
			</div>

			<div class="section">
				<h3>Spouse Information</h3>
				<div class="form-row">
					<div class="form-group flex-2">
						<label class="label">Name</label>
						<input type="text" class="input" bind:value={spouseName} placeholder="Full name" />
					</div>
					<div class="form-group flex-1">
						<label class="label">Phone</label>
						<input type="tel" class="input" bind:value={spousePhone} placeholder="(555) 123-4567" />
					</div>
				</div>
			</div>

			<div class="section">
				<h3>Vehicle Information</h3>
				<div class="form-row">
					<div class="form-group flex-2">
						<label class="label">Make/Model</label>
						<input
							type="text"
							class="input"
							bind:value={vehicleMakeModel}
							placeholder="e.g., Toyota Camry"
						/>
					</div>
					<div class="form-group flex-1">
						<label class="label">Color</label>
						<input type="text" class="input" bind:value={vehicleColor} placeholder="e.g., Silver" />
					</div>
				</div>
				<div class="form-group">
					<label class="label">License Plate</label>
					<input type="text" class="input" bind:value={vehiclePlate} placeholder="ABC-1234" />
				</div>
			</div>

			<div class="section">
				<h3>Personal Contact</h3>
				<div class="form-row">
					<div class="form-group flex-1">
						<label class="label">Email</label>
						<input
							type="email"
							class="input"
							bind:value={personalEmail}
							placeholder="email@example.com"
						/>
					</div>
					<div class="form-group flex-1">
						<label class="label">Phone</label>
						<input
							type="tel"
							class="input"
							bind:value={personalPhone}
							placeholder="(555) 123-4567"
						/>
					</div>
				</div>
			</div>

			<div class="section">
				<h3>Home Address</h3>
				<div class="form-group">
					<label class="label">Street</label>
					<input type="text" class="input" bind:value={addressStreet} placeholder="123 Main St" />
				</div>
				<div class="form-row">
					<div class="form-group flex-2">
						<label class="label">City</label>
						<input type="text" class="input" bind:value={addressCity} placeholder="City" />
					</div>
					<div class="form-group flex-1">
						<label class="label">State</label>
						<input type="text" class="input" bind:value={addressState} placeholder="TX" />
					</div>
					<div class="form-group flex-1">
						<label class="label">ZIP</label>
						<input type="text" class="input" bind:value={addressZip} placeholder="12345" />
					</div>
				</div>
			</div>

			<div class="section">
				<h3>Leader Notes</h3>
				<div class="form-group">
					<textarea
						class="input textarea"
						bind:value={leaderNotes}
						placeholder="Private notes about this soldier..."
						rows="4"
					></textarea>
				</div>
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button class="btn btn-primary" onclick={handleSave} disabled={saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
	</div>
</div>

<style>
	.person-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-lg);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.person-rank {
		font-weight: 600;
		color: var(--color-primary);
	}

	.person-name {
		font-weight: 500;
	}

	.section {
		margin-bottom: var(--spacing-lg);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
	}

	.section:last-child {
		margin-bottom: 0;
		border-bottom: none;
	}

	.section h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
	}

	.form-group {
		margin-bottom: var(--spacing-sm);
	}

	.form-group.flex-1 {
		flex: 1;
	}

	.form-group.flex-2 {
		flex: 2;
	}

	.textarea {
		resize: vertical;
		min-height: 80px;
	}

	.modal-body {
		max-height: 70vh;
		overflow-y: auto;
	}
</style>
