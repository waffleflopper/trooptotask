<script lang="ts">
	import type { Personnel } from '$lib/types';
	import { personnelExtendedInfoStore } from '$features/personnel/stores/personnelExtendedInfo.svelte';
	import ExtendedInfoModal from '$features/personnel/components/ExtendedInfoModal.svelte';

	interface Props {
		person: Personnel;
		canEdit: boolean;
	}

	let { person, canEdit }: Props = $props();

	let showExtendedInfoModal = $state(false);
	const extendedInfo = $derived(personnelExtendedInfoStore.getByPersonnelId(person.id));

	function formatAddress(): string {
		if (!extendedInfo) return '';
		const parts = [
			extendedInfo.addressStreet,
			extendedInfo.addressCity,
			extendedInfo.addressState,
			extendedInfo.addressZip
		].filter(Boolean);
		if (parts.length === 0) return '';
		return parts.join(', ');
	}
</script>

<div class="leader-card">
	<div class="leader-card-header">
		<h3>Information</h3>
		{#if canEdit}
			<button class="btn btn-sm btn-primary" onclick={() => (showExtendedInfoModal = true)}>
				{extendedInfo ? 'Edit' : '+ Add'}
			</button>
		{/if}
	</div>
	<div class="leader-card-body">
		{#if extendedInfo}
			<div class="info-sections">
				<section class="info-section">
					<h3>Emergency Contact</h3>
					{#if extendedInfo.emergencyContactName}
						<div class="info-row">
							<span class="info-label">Name:</span>
							<span class="info-value">{extendedInfo.emergencyContactName}</span>
						</div>
						{#if extendedInfo.emergencyContactRelationship}
							<div class="info-row">
								<span class="info-label">Relationship:</span>
								<span class="info-value">{extendedInfo.emergencyContactRelationship}</span>
							</div>
						{/if}
						{#if extendedInfo.emergencyContactPhone}
							<div class="info-row">
								<span class="info-label">Phone:</span>
								<span class="info-value">{extendedInfo.emergencyContactPhone}</span>
							</div>
						{/if}
					{:else}
						<p class="no-data">Not provided</p>
					{/if}
				</section>

				<section class="info-section">
					<h3>Spouse</h3>
					{#if extendedInfo.spouseName}
						<div class="info-row">
							<span class="info-label">Name:</span>
							<span class="info-value">{extendedInfo.spouseName}</span>
						</div>
						{#if extendedInfo.spousePhone}
							<div class="info-row">
								<span class="info-label">Phone:</span>
								<span class="info-value">{extendedInfo.spousePhone}</span>
							</div>
						{/if}
					{:else}
						<p class="no-data">Not provided</p>
					{/if}
				</section>

				<section class="info-section">
					<h3>Vehicle</h3>
					{#if extendedInfo.vehicleMakeModel}
						<div class="info-row">
							<span class="info-label">Make/Model:</span>
							<span class="info-value">{extendedInfo.vehicleMakeModel}</span>
						</div>
						{#if extendedInfo.vehicleColor}
							<div class="info-row">
								<span class="info-label">Color:</span>
								<span class="info-value">{extendedInfo.vehicleColor}</span>
							</div>
						{/if}
						{#if extendedInfo.vehiclePlate}
							<div class="info-row">
								<span class="info-label">Plate:</span>
								<span class="info-value">{extendedInfo.vehiclePlate}</span>
							</div>
						{/if}
					{:else}
						<p class="no-data">Not provided</p>
					{/if}
				</section>

				<section class="info-section">
					<h3>Personal Contact</h3>
					{#if extendedInfo.personalEmail || extendedInfo.personalPhone}
						{#if extendedInfo.personalEmail}
							<div class="info-row">
								<span class="info-label">Email:</span>
								<span class="info-value">{extendedInfo.personalEmail}</span>
							</div>
						{/if}
						{#if extendedInfo.personalPhone}
							<div class="info-row">
								<span class="info-label">Phone:</span>
								<span class="info-value">{extendedInfo.personalPhone}</span>
							</div>
						{/if}
					{:else}
						<p class="no-data">Not provided</p>
					{/if}
				</section>

				<section class="info-section">
					<h3>Home Address</h3>
					{#if formatAddress()}
						<p class="address">{formatAddress()}</p>
					{:else}
						<p class="no-data">Not provided</p>
					{/if}
				</section>

				{#if extendedInfo.leaderNotes}
					<section class="info-section full-width">
						<h3>Leader Notes</h3>
						<p class="notes">{extendedInfo.leaderNotes}</p>
					</section>
				{/if}
			</div>
		{:else}
			<div class="empty-state">
				<p>No extended information recorded yet.</p>
				{#if canEdit}
					<p>Click "+ Add" to add emergency contacts, vehicle info, and more.</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if showExtendedInfoModal}
	<ExtendedInfoModal {person} onClose={() => (showExtendedInfoModal = false)} />
{/if}

<style>
	.info-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.info-section {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
	}

	.info-section h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.info-row {
		display: flex;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.info-label {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		min-width: 100px;
	}

	.info-value {
		font-weight: 500;
	}

	.address {
		margin: 0;
	}

	.notes {
		margin: 0;
		white-space: pre-wrap;
	}

	.no-data {
		color: var(--color-text-muted);
		font-style: italic;
		margin: 0;
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
	}
</style>
