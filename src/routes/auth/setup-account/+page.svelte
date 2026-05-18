<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthPasswordToggle from '$lib/components/auth/AuthPasswordToggle.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let { data, form } = $props();

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	const hasMinLength = $derived(password.length >= 12);
	const hasUppercase = $derived(/[A-Z]/.test(password));
	const hasLowercase = $derived(/[a-z]/.test(password));
	const hasDigit = $derived(/\d/.test(password));
	const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0);
	const canSubmit = $derived(
		data.state === 'valid' && hasMinLength && hasUppercase && hasLowercase && hasDigit && passwordsMatch && !loading
	);
</script>

<svelte:head>
	<title>Set Up Account - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Beta Access"
	title="Set up your TroopToTask account."
	description="Use the setup link from your approval email to choose your password and activate your User Account."
	panelEyebrow="Account setup"
	panelTitle={data.state === 'valid' ? 'Choose your password' : 'Setup link unavailable'}
	panelDescription={data.state === 'valid'
		? `This setup link is approved for ${data.email}.`
		: 'Request a fresh setup link if your approval is still eligible.'}
	supportLabel="Account setup"
	supportTitle="One link, one account."
	supportDescription="Account Setup Links activate only your User Account. Organization membership is handled separately inside TroopToTask."
	supportPoints={[
		'Choose your own password; TroopToTask never emails temporary passwords.',
		'Use the newest setup email if you requested more than one link.',
		'Expired setup links can be renewed from the fresh-link request page.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if data.state !== 'valid'}
			<AuthNotice tone="error" title="Setup link unavailable" centered>
				<p>{data.message}</p>
				<p><a href={resolve('/auth/renew-invite')}>Request a fresh setup link</a>.</p>
			</AuthNotice>
		{:else}
			{#if form?.error}
				<AuthNotice tone="error" message={form.error} />
			{/if}

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
				<input type="hidden" name="token" value={data.token} />

				<AuthField label="Email Address" id="email" name="email" type="email" value={data.email} disabled />

				<AuthField
					label="Password"
					id="password"
					name="password"
					type={showPassword ? 'text' : 'password'}
					bind:value={password}
					required
					placeholder="At least 12 characters"
				>
					{#snippet action()}
						<AuthPasswordToggle visible={showPassword} onclick={() => (showPassword = !showPassword)} />
					{/snippet}
				</AuthField>

				<ul class="grid gap-2 text-xs leading-normal text-muted-foreground" aria-live="polite">
					<li class={hasMinLength ? 'text-success' : undefined}>At least 12 characters</li>
					<li class={hasUppercase ? 'text-success' : undefined}>One uppercase letter</li>
					<li class={hasLowercase ? 'text-success' : undefined}>One lowercase letter</li>
					<li class={hasDigit ? 'text-success' : undefined}>One number</li>
				</ul>

				<AuthField
					label="Confirm Password"
					id="confirmPassword"
					name="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					bind:value={confirmPassword}
					required
					placeholder="Repeat your password"
				>
					{#snippet action()}
						<AuthPasswordToggle
							visible={showConfirmPassword}
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
						/>
					{/snippet}
				</AuthField>

				{#if confirmPassword && !passwordsMatch}
					<AuthNotice tone="error" message="Passwords do not match" />
				{/if}

				<Button type="submit" disabled={!canSubmit} class="w-full">
					{#if loading}
						<Spinner />
						Setting Up Account...
					{:else}
						Set Up Account
					{/if}
				</Button>
			</form>
		{/if}

		<div
			class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
		>
			<span class="h-px flex-1 bg-border"></span>
			<span class="whitespace-nowrap">Need help?</span>
			<span class="h-px flex-1 bg-border"></span>
		</div>

		<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
			<p>Already set up? <a href={resolve('/auth/login')}>Sign in</a>.</p>
			<p>Need a new setup email? <a href={resolve('/auth/renew-invite')}>Request a fresh setup link</a>.</p>
			<p>Still waiting on approval? <a href={resolve('/auth/request-access')}>Request access</a>.</p>
		</div>
	</div>
</AuthShell>
