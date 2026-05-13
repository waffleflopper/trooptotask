<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Spinner } from '$lib/components/ui/spinner';

	interface Props {
		type: 'user' | 'org';
		targetId: string;
		targetName: string;
		isSuspended: boolean;
		onClose: () => void;
		onComplete: () => void;
	}

	let { type, targetId, targetName, isSuspended, onClose, onComplete }: Props = $props();

	let reason = $state('');
	let saving = $state(false);
	let errorMsg = $state('');

	const action = $derived(isSuspended ? 'unsuspend' : 'suspend');
	const title = $derived(isSuspended ? `Unsuspend ${targetName}` : `Suspend ${targetName}`);

	async function handleAction() {
		if (saving) return;
		saving = true;
		errorMsg = '';
		try {
			const res = await fetch('/admin/api/suspend', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, targetId, action, reason: reason.trim() || undefined })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body?.message ?? 'An error occurred. Please try again.';
				return;
			}
			onComplete();
		} catch {
			errorMsg = 'Network error. Please try again.';
		} finally {
			saving = false;
		}
	}
</script>

<AppDialog.Root open closeBlocked={saving} {onClose}>
	<AppDialog.Content closeBlocked={saving}>
		<AppDialog.Header>
			<AppDialog.Title>{title}</AppDialog.Title>
		</AppDialog.Header>
		<AppDialog.Body class="flex flex-col gap-4">
			<p class="admin-note">
				{#if isSuspended}
					This {type === 'org' ? 'organization' : 'user'} will regain access immediately after you confirm.
				{:else}
					This {type === 'org' ? 'organization' : 'user'} will lose access immediately after you confirm.
				{/if}
			</p>

			<div class="admin-callout">
				<strong>{isSuspended ? 'Unsuspend' : 'Suspend'} target</strong>
				<p>{targetName}</p>
			</div>

			<div class="grid gap-2">
				<Label for="reason">Reason (optional)</Label>
				<Textarea
					id="reason"
					rows={3}
					bind:value={reason}
					placeholder="Internal note about why this action was taken..."
					disabled={saving}
				></Textarea>
			</div>

			{#if errorMsg}
				<p class="text-error modal-error">{errorMsg}</p>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" onclick={onClose} disabled={saving}>Cancel</Button>
			<Button variant={isSuspended ? 'default' : 'destructive'} onclick={handleAction} disabled={saving}>
				{#if saving}<Spinner />{/if}
				{saving ? 'Processing...' : isSuspended ? 'Unsuspend' : 'Suspend'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<style>
	.admin-note,
	.admin-callout p,
	.modal-error {
		margin: 0;
	}

	.admin-note {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.admin-callout {
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
	}

	.admin-callout strong {
		display: block;
		margin-bottom: var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
</style>
