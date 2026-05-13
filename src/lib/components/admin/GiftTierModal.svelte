<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { enhance } from '$app/forms';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';

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

	function actionErrorMessage(data: unknown, fallback: string): string {
		if (!data || typeof data !== 'object' || !('error' in data)) return fallback;

		const { error } = data as { error?: { message?: unknown } };
		return typeof error?.message === 'string' ? error.message : fallback;
	}
</script>

<AppDialog.Root open {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Gift Tier</AppDialog.Title>
		</AppDialog.Header>
		<AppDialog.Body class="flex flex-col gap-4">
			<div class="context-box">
				<p class="context-box__label">Organization</p>
				<strong>{orgName}</strong>
				{#if hasActiveGift}
					<div class="context-box__meta">
						<Badge variant={adminBadgeVariant(currentGiftTier)}>{formatAdminLabel(currentGiftTier ?? '')}</Badge>
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
									errorMsg = actionErrorMessage(result.data, 'Failed to extend gift');
								} else {
									onComplete();
								}
							};
						}}
					>
						<input type="hidden" name="orgId" value={orgId} />
						<div class="admin-toolbar__field">
							<Label for="extend-days">Days to add</Label>
							<Input id="extend-days" type="number" name="days" bind:value={extendDays} min="1" max="365" />
						</div>
						<Button type="submit" disabled={saving}>
							{#if saving}<Spinner />{/if}
							Extend Gift
						</Button>
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
									errorMsg = actionErrorMessage(result.data, 'Failed to revoke gift');
								} else {
									onComplete();
								}
							};
						}}
					>
						<input type="hidden" name="orgId" value={orgId} />
						<Button type="submit" variant="destructive" disabled={saving}>
							{#if saving}<Spinner />{/if}
							Revoke Gift
						</Button>
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
									errorMsg = actionErrorMessage(result.data, 'Failed to apply gift');
								} else {
									onComplete();
								}
							};
						}}
					>
						<input type="hidden" name="orgId" value={orgId} />
						<div class="admin-toolbar__field">
							<Label for="gift-tier">Tier</Label>
							<NativeSelect id="gift-tier" name="giftTier" bind:value={giftTier}>
								<option value="team">Team</option>
								<option value="unit">Unit</option>
							</NativeSelect>
						</div>
						<div class="admin-toolbar__field">
							<Label for="gift-days">Duration (days)</Label>
							<Input id="gift-days" type="number" name="days" bind:value={days} min="1" max="365" />
						</div>
						<Button type="submit" disabled={saving}>
							{#if saving}<Spinner />{/if}
							Apply Gift
						</Button>
					</form>
				</section>
			{/if}
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={onClose}>Close</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<style>
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
</style>
