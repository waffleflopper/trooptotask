<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Spinner } from '$lib/components/ui/spinner';

	interface Props {
		type: 'user' | 'org';
		targetId: string;
		targetName: string;
		isSuspended: boolean;
		onClose: () => void;
		onComplete: (targetId: string, isSuspended: boolean) => void | Promise<void>;
		onReload: (targetId: string) => Promise<boolean>;
	}

	let { type, targetId, targetName, isSuspended, onClose, onComplete, onReload }: Props = $props();

	let reason = $state('');
	let saving = $state(false);
	let errorMsg = $state('');
	let saved = $state(false);
	let uncertain = $state<{ targetId: string; isSuspended: boolean } | null>(null);
	let reloading = $state(false);

	const action = $derived(isSuspended ? 'unsuspend' : 'suspend');
	const title = $derived(isSuspended ? `Unsuspend ${targetName}` : `Suspend ${targetName}`);

	async function handleAction() {
		if (saving || saved || uncertain || reloading) return;
		const mutationTargetId = targetId;
		const suspendedAfterSave = action === 'suspend';
		const complete = onComplete;
		saving = true;
		errorMsg = '';
		try {
			const res = await fetch('/admin/api/suspend', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, targetId, action, reason: reason.trim() || undefined })
			});
			const body = await res.json().catch(() => null);
			if (targetId !== mutationTargetId) return;
			if (!res.ok || body?.success !== true) {
				errorMsg =
					typeof body?.message === 'string'
						? body.message
						: 'The change could not be confirmed. Reload this page before trying again.';
				if (![400, 403, 404, 409].includes(res.status) || typeof body?.message !== 'string') {
					uncertain = { targetId: mutationTargetId, isSuspended: suspendedAfterSave };
				}
				return;
			}
			saved = true;
			try {
				await complete(mutationTargetId, suspendedAfterSave);
			} catch {
				errorMsg = 'Saved, but the details could not be refreshed. Reload this page to see the current state.';
			}
		} catch {
			if (targetId !== mutationTargetId) return;
			uncertain = { targetId: mutationTargetId, isSuspended: suspendedAfterSave };
			errorMsg = 'The change could not be confirmed. Reload this page before trying again.';
		} finally {
			saving = false;
		}
	}

	async function reloadDetails() {
		if (!uncertain || reloading) return;
		const command = uncertain;
		const reload = onReload;
		reloading = true;
		try {
			const currentState = await reload(command.targetId);
			if (targetId !== command.targetId) return;
			if (typeof currentState !== 'boolean') throw new Error('Suspension state unavailable');
			if (currentState === command.isSuspended) {
				onClose();
			} else {
				uncertain = null;
				errorMsg = 'Details refreshed. Review the current state and confirm again if needed.';
			}
		} catch {
			if (targetId === command.targetId)
				errorMsg = 'Details could not be refreshed. Reload details before trying again.';
		} finally {
			reloading = false;
		}
	}
</script>

<AppDialog.Root open closeBlocked={saving || saved || !!uncertain || reloading} {onClose}>
	<AppDialog.Content closeBlocked={saving || saved || !!uncertain || reloading}>
		<AppDialog.Header>
			<AppDialog.Title>{title}</AppDialog.Title>
		</AppDialog.Header>
		<AppDialog.Body class="flex flex-col gap-4">
			<p class="text-sm leading-6 text-muted-foreground">
				{#if isSuspended}
					This {type === 'org' ? 'organization' : 'user'} will regain access immediately after you confirm.
				{:else}
					This {type === 'org' ? 'organization' : 'user'} will lose access immediately after you confirm.
				{/if}
			</p>

			<Card.Root>
				<Card.Header>
					<Card.Description>{isSuspended ? 'Unsuspend' : 'Suspend'} target</Card.Description>
					<Card.Title>{targetName}</Card.Title>
				</Card.Header>
			</Card.Root>

			<Field.Root>
				<Field.Label for="reason">Reason (optional)</Field.Label>
				<Field.Control>
					<Textarea
						id="reason"
						rows={3}
						bind:value={reason}
						placeholder="Internal note about why this action was taken..."
						disabled={saving || saved || !!uncertain || reloading}
					></Textarea>
				</Field.Control>
			</Field.Root>

			{#if errorMsg}
				<Alert.Root variant="destructive">
					<Alert.Description>{errorMsg}</Alert.Description>
				</Alert.Root>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if saved}
				<Button onclick={() => window.location.reload()}>Reload details</Button>
			{:else if uncertain}
				<Button onclick={reloadDetails} disabled={reloading}>
					{#if reloading}<Spinner />{/if}
					Reload details
				</Button>
			{:else}
				<Button variant="outline" onclick={onClose} disabled={saving}>Cancel</Button>
				<Button variant={isSuspended ? 'default' : 'destructive'} onclick={handleAction} disabled={saving}>
					{#if saving}<Spinner />{/if}
					{saving ? 'Processing...' : isSuspended ? 'Unsuspend' : 'Suspend'}
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
