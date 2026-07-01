<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Alert from '$lib/components/ui/alert';
	import { Spinner } from '$lib/components/ui/spinner';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Account Profile - Troop to Task</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>User Profile</Card.Title>
		<Card.Description>
			These details belong to your User Account. They do not update Personnel Records.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="grid gap-5"
		>
			{#if form?.error}
				<Alert.Root variant="destructive">
					<Alert.Title>Profile not saved</Alert.Title>
					<Alert.Description>{form.error}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if form?.success}
				<Alert.Root variant="success">
					<Alert.Title>Profile updated</Alert.Title>
					<Alert.Description>{form.success}</Alert.Description>
				</Alert.Root>
			{/if}

			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Root>
					<Field.Label for="firstName">First name</Field.Label>
					<Field.Control>
						<Input id="firstName" name="firstName" required value={data.profile?.firstName ?? ''} />
					</Field.Control>
				</Field.Root>

				<Field.Root>
					<Field.Label for="lastName">Last name</Field.Label>
					<Field.Control>
						<Input id="lastName" name="lastName" required value={data.profile?.lastName ?? ''} />
					</Field.Control>
				</Field.Root>
			</div>

			<Field.Root>
				<Field.Label for="rank">Rank</Field.Label>
				<Field.Control>
					<select
						id="rank"
						name="rank"
						required
						class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-8 w-full rounded-md border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="">Select rank</option>
						{#each data.ranks as rank (rank)}
							<option value={rank} selected={data.profile?.rank === rank}>{rank}</option>
						{/each}
					</select>
				</Field.Control>
				<Field.Description>
					This account-level rank uses the registration rank list and is not connected to any Organization rank catalog.
				</Field.Description>
			</Field.Root>

			<div class="flex justify-end">
				<Button type="submit" disabled={loading}>
					{#if loading}<Spinner />{/if}
					Save Profile
				</Button>
			</div>
		</form>
	</Card.Content>
</Card.Root>
