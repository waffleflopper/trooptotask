<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { enhance } from '$app/forms';

	let {
		orgId,
		orgName,
		currentGiftTier = null,
		giftExpiresAt = null,
		onClose,
		onComplete
	}: {
		orgId: string;
		orgName: string;
		currentGiftTier: string | null;
		giftExpiresAt: string | null;
		onClose: () => void;
		onComplete: () => void;
	} = $props();

	let giftTier = $state<'team' | 'unit'>('team');
	let days = $state(30);
	let extendDays = $state(30);
	let saving = $state(false);
	let errorMsg = $state('');

	const hasActiveGift = $derived(!!currentGiftTier && !!giftExpiresAt && new Date(giftExpiresAt) > new Date());

	function formatDate(d: string | null): string {
		if (!d) return 'N/A';
		return new Date(d).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<Modal title="Gift Tier — {orgName}" {onClose} width="460px">
	{#if errorMsg}
		<div class="error-msg">{errorMsg}</div>
	{/if}

	{#if hasActiveGift}
		<div class="current-gift">
			<span class="current-label">Current Gift:</span>
			<Badge label={currentGiftTier ?? ''} color={currentGiftTier === 'unit' ? '#7c4dff' : '#3f51b5'} />
			<span class="expires-label">expires {formatDate(giftExpiresAt)}</span>
		</div>

		<div class="action-section">
			<h3>Extend Gift</h3>
			<form
				method="POST"
				action="?/extendGift"
				use:enhance={() => {
					saving = true;
					errorMsg = '';
					return async ({ result }) => {
						saving = false;
						if (result.type === 'failure') {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SvelteKit form action failure data shape is loosely typed
							errorMsg = (result.data as any)?.error?.message ?? 'Failed to extend gift';
						} else {
							onComplete();
						}
					};
				}}
			>
				<input type="hidden" name="orgId" value={orgId} />
				<div class="form-row">
					<label class="label" for="extend-days">Days to add</label>
					<input
						id="extend-days"
						type="number"
						name="days"
						class="input"
						bind:value={extendDays}
						min="1"
						max="365"
						style="width: 100px;"
					/>
					<button type="submit" class="btn btn-primary btn-sm" disabled={saving}>
						{#if saving}<Spinner />{/if}
						Extend
					</button>
				</div>
			</form>
		</div>

		<div class="action-section">
			<h3>Revoke Gift</h3>
			<p class="hint">
				Removes the gift and reverts to the org's base tier. If a Stripe subscription was paused, it will be resumed.
			</p>
			<form
				method="POST"
				action="?/revokeGift"
				use:enhance={() => {
					saving = true;
					errorMsg = '';
					return async ({ result }) => {
						saving = false;
						if (result.type === 'failure') {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SvelteKit form action failure data shape is loosely typed
							errorMsg = (result.data as any)?.error?.message ?? 'Failed to revoke gift';
						} else {
							onComplete();
						}
					};
				}}
			>
				<input type="hidden" name="orgId" value={orgId} />
				<button type="submit" class="btn btn-danger btn-sm" disabled={saving}>
					{#if saving}<Spinner />{/if}
					Revoke Gift
				</button>
			</form>
		</div>
	{:else}
		<div class="action-section">
			<h3>Apply Gift</h3>
			<form
				method="POST"
				action="?/giftTier"
				use:enhance={() => {
					saving = true;
					errorMsg = '';
					return async ({ result }) => {
						saving = false;
						if (result.type === 'failure') {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SvelteKit form action failure data shape is loosely typed
							errorMsg = (result.data as any)?.error?.message ?? 'Failed to apply gift';
						} else {
							onComplete();
						}
					};
				}}
			>
				<input type="hidden" name="orgId" value={orgId} />
				<div class="form-group">
					<label class="label" for="gift-tier">Tier</label>
					<select id="gift-tier" name="giftTier" class="select" bind:value={giftTier}>
						<option value="team">Team ($15/mo equivalent)</option>
						<option value="unit">Unit ($30/mo equivalent)</option>
					</select>
				</div>
				<div class="form-group">
					<label class="label" for="gift-days">Duration (days)</label>
					<input id="gift-days" type="number" name="days" class="input" bind:value={days} min="1" max="365" />
				</div>
				<button type="submit" class="btn btn-primary" disabled={saving} style="margin-top: var(--spacing-sm);">
					{#if saving}<Spinner />{/if}
					{saving ? 'Applying...' : 'Apply Gift'}
				</button>
			</form>
		</div>
	{/if}

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Close</button>
	{/snippet}
</Modal>

<style>
	.error-msg {
		padding: var(--spacing-sm) var(--spacing-md);
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	:global([data-theme='dark']) .error-msg {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
	}

	.current-gift {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface-variant);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-lg);
	}

	.current-label {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.expires-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.action-section {
		margin-bottom: var(--spacing-lg);
		padding-bottom: var(--spacing-lg);
		border-bottom: 1px solid var(--color-divider);
	}

	.action-section:last-of-type {
		border-bottom: none;
		margin-bottom: 0;
		padding-bottom: 0;
	}

	.action-section h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm);
	}

	.hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin: 0 0 var(--spacing-sm);
	}

	.form-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.form-group {
		margin-bottom: var(--spacing-sm);
	}
</style>
