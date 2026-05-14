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
						disabled={saving}
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
			<Button variant="outline" onclick={onClose} disabled={saving}>Cancel</Button>
			<Button variant={isSuspended ? 'default' : 'destructive'} onclick={handleAction} disabled={saving}>
				{#if saving}<Spinner />{/if}
				{saving ? 'Processing...' : isSuspended ? 'Unsuspend' : 'Suspend'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
