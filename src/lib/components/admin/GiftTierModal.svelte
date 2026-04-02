<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { ADMIN_TIER_COLORS, formatAdminLabel } from '$lib/components/admin/adminTheme';

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

	function formatDate(dateValue: string | null): string {
		if (!dateValue) return 'N/A';
		return new Date(dateValue).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<Modal title="Gift Tier" {onClose} width="500px">
	<div class="modal-stack">
		<div class="context-box">
			<p class="context-box__label">Organization</p>
			<strong>{orgName}</strong>
			{#if hasActiveGift}
				<div class="context-box__meta">
					<Badge
						label={formatAdminLabel(currentGiftTier ?? '')}
						color={ADMIN_TIER_COLORS[currentGiftTier ?? ''] ?? 'var(--ink-35)'}
					/>
					<span>Expires {formatDate(giftExpiresAt)}</span>
				</div>
			{/if}
		</div>

		{#if errorMsg}
			<div class="error-box">{errorMsg}</div>
		{/if}

		{#if hasActiveGift}
			<section class="action-section">
				<div class="action-section__header">
					<h3>Extend Gift</h3>
					<p>Add time to the current gifted plan without changing the tier.</p>
				</div>
				<form
					method="POST"
					action="?/extendGift"
					class="stack-form"
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
					<div class="admin-toolbar__field">
						<label class="label" for="extend-days">Days to add</label>
						<input id="extend-days" type="number" name="days" class="input" bind:value={extendDays} min="1" max="365" />
					</div>
					<button type="submit" class="btn btn-primary" disabled={saving}>
						{#if saving}<Spinner />{/if}
						Extend Gift
					</button>
				</form>
			</section>

			<section class="action-section">
				<div class="action-section__header">
					<h3>Revoke Gift</h3>
					<p>Remove the gifted plan and return the organization to its base subscription.</p>
				</div>
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
					<button type="submit" class="btn btn-danger" disabled={saving}>
						{#if saving}<Spinner />{/if}
						Revoke Gift
					</button>
				</form>
			</section>
		{:else}
			<section class="action-section">
				<div class="action-section__header">
					<h3>Apply Gift</h3>
					<p>Grant temporary access to a paid plan without changing the stored base subscription.</p>
				</div>
				<form
					method="POST"
					action="?/giftTier"
					class="stack-form"
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
					<div class="admin-toolbar__field">
						<label class="label" for="gift-tier">Tier</label>
						<select id="gift-tier" name="giftTier" class="select" bind:value={giftTier}>
							<option value="team">Team</option>
							<option value="unit">Unit</option>
						</select>
					</div>
					<div class="admin-toolbar__field">
						<label class="label" for="gift-days">Duration (days)</label>
						<input id="gift-days" type="number" name="days" class="input" bind:value={days} min="1" max="365" />
					</div>
					<button type="submit" class="btn btn-primary" disabled={saving}>
						{#if saving}<Spinner />{/if}
						Apply Gift
					</button>
				</form>
			</section>
		{/if}
	</div>

	{#snippet footer()}
		<div class="footer-spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Close</button>
	{/snippet}
</Modal>

<style>
	.modal-stack,
	.stack-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.context-box,
	.action-section {
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
	}

	.context-box__label {
		margin: 0 0 var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.context-box strong,
	.context-box__meta span,
	.action-section__header h3,
	.action-section__header p {
		margin: 0;
	}

	.context-box__meta {
		margin-top: var(--sp-3);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.action-section__header {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}

	.action-section__header h3 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		line-height: 0.98;
		text-transform: uppercase;
	}

	.action-section__header p {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.error-box {
		padding: var(--sp-4);
		border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--ink-15) 66%);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.footer-spacer {
		flex: 1;
	}
</style>
