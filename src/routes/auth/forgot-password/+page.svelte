<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let { form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Forgot Password - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Credential Recovery"
	title="Recover access without hunting through settings."
	description="Password reset should be one short detour, not a second workflow to learn."
	panelEyebrow="Recovery"
	panelTitle={form?.success ? 'Check your email' : 'Reset your password'}
	panelDescription={form?.success
		? 'If the account exists, a reset link is on the way.'
		: "Enter the email address tied to your account and we'll send a reset link."}
	supportLabel="What happens next"
	supportTitle="Check your email."
	supportDescription="If the account exists, you'll receive a password reset link at that address."
	supportPoints={[
		'Open the reset link from your email to choose a new password.',
		'After resetting, return here and sign in normally.',
		'If nothing arrives, check your spam folder or ask your unit admin which email is on record.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if form?.success}
			<AuthNotice tone="success" title="Check your email" centered>
				<p>If an account exists for <strong>{form.email}</strong>, a password reset link is on the way.</p>
				<p>Open the message and follow the link to choose a new password.</p>
				<p>If it does not arrive within a few minutes, check your spam folder.</p>
			</AuthNotice>
		{:else}
			{#if form?.error}
				<AuthNotice tone="error" message={form.error} />
			{/if}

			<p class="m-0 text-sm leading-relaxed text-muted-foreground">
				If the account exists, you will receive a reset link at that address.
			</p>

			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="flex flex-col gap-5"
			>
				<AuthField
					label="Email Address"
					id="email"
					name="email"
					type="email"
					value={form?.email ?? ''}
					required
					placeholder="you@example.com"
				/>

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={loading} class="w-full">
						{#if loading}
							<Spinner />
							Sending Reset Link...
						{:else}
							Send Reset Link
						{/if}
					</Button>
				</div>
			</form>
		{/if}

		<div
			class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
		>
			<span class="h-px flex-1 bg-border"></span>
			<span class="whitespace-nowrap">Remembered it?</span>
			<span class="h-px flex-1 bg-border"></span>
		</div>

		<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
			<p>
				Back to <a href="/auth/login">sign in</a>.
			</p>
		</div>
	</div>
</AuthShell>
