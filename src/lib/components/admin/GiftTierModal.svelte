<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { enhance } from '$app/forms';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
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
			<Card.Root>
				<Card.Header>
					<Card.Description>Organization</Card.Description>
					<Card.Title>{orgName}</Card.Title>
				</Card.Header>
				{#if hasActiveGift}
					<Card.Content class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<Badge variant={adminBadgeVariant(currentGiftTier)}>{formatAdminLabel(currentGiftTier ?? '')}</Badge>
						<span>Expires {formatDate(giftExpiresAt)}</span>
					</Card.Content>
				{/if}
			</Card.Root>

			{#if errorMsg}
				<Alert.Root variant="destructive">
					<Alert.Description>{errorMsg}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if hasActiveGift}
				<Card.Root>
					<Card.Header>
						<Card.Title>Extend Gift</Card.Title>
						<Card.Description>Add time to the current gifted plan without changing the tier.</Card.Description>
					</Card.Header>
					<Card.Content>
						<form
							method="POST"
							action="?/extendGift"
							class="grid gap-4"
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
							<Field.Root>
								<Field.Label for="extend-days">Days to add</Field.Label>
								<Field.Control>
									<Input id="extend-days" type="number" name="days" bind:value={extendDays} min="1" max="365" />
								</Field.Control>
							</Field.Root>
							<Button type="submit" disabled={saving}>
								{#if saving}<Spinner />{/if}
								Extend Gift
							</Button>
						</form>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title>Revoke Gift</Card.Title>
						<Card.Description
							>Remove the gifted plan and return the organization to its base subscription.</Card.Description
						>
					</Card.Header>
					<Card.Content>
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
					</Card.Content>
				</Card.Root>
			{:else}
				<Card.Root>
					<Card.Header>
						<Card.Title>Apply Gift</Card.Title>
						<Card.Description
							>Grant temporary access to a paid plan without changing the stored base subscription.</Card.Description
						>
					</Card.Header>
					<Card.Content>
						<form
							method="POST"
							action="?/giftTier"
							class="grid gap-4"
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
							<Field.Root>
								<Field.Label for="gift-tier">Tier</Field.Label>
								<Field.Control>
									<NativeSelect id="gift-tier" name="giftTier" bind:value={giftTier}>
										<option value="team">Team</option>
										<option value="unit">Unit</option>
									</NativeSelect>
								</Field.Control>
							</Field.Root>
							<Field.Root>
								<Field.Label for="gift-days">Duration (days)</Field.Label>
								<Field.Control>
									<Input id="gift-days" type="number" name="days" bind:value={days} min="1" max="365" />
								</Field.Control>
							</Field.Root>
							<Button type="submit" disabled={saving}>
								{#if saving}<Spinner />{/if}
								Apply Gift
							</Button>
						</form>
					</Card.Content>
				</Card.Root>
			{/if}
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={onClose}>Close</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
