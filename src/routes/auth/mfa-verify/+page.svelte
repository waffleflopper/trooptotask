<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { sanitizeAuthNextPath, type MfaActionResponse } from '$features/identity/contracts';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let code = $state('');
	let error = $state('');
	let loading = $state(false);

	function getNextPath(): string | null {
		const next = new URL(window.location.href).searchParams.get('next');
		return sanitizeAuthNextPath(next);
	}

	function handleCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		code = input.value.replace(/\D/g, '').slice(0, 6);
	}

	async function handleVerify(e: Event) {
		e.preventDefault();
		if (loading) return;

		if (!code || code.length !== 6) {
			error = 'Please enter a 6-digit code';
			return;
		}

		error = '';
		loading = true;
		try {
			const response = await fetch('/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});
			if (response.redirected) {
				await goto(response.url);
				return;
			}

			const payload = (await response.json()) as MfaActionResponse | null;
			if (!response.ok || payload?.ok !== true) {
				error = payload?.error ?? 'Verification failed';
				return;
			}

			await goto(resolve((getNextPath() ?? '/dashboard') as '/'));
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Verification failed';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Two-Factor Authentication - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Second Factor"
	title="Verify the login before the session opens."
	description="Enter the current code from your authenticator app to finish signing in."
	panelEyebrow="Two-factor authentication"
	panelTitle="Verify your code"
	supportLabel="Authenticator code"
	supportTitle="Use the current 6-digit code."
	supportDescription="Open your authenticator app and enter the latest code for this account."
	supportPoints={[
		'Codes refresh automatically after a short time.',
		'Only a verified authenticator factor can be used here.',
		'If you no longer have access to your authenticator, contact your unit admin to have the requirement removed.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if error}
			<AuthNotice tone="error" message={error} />
		{/if}

		<form onsubmit={handleVerify} class="flex flex-col gap-5">
			<AuthField
				label="Verification Code"
				id="mfa-code"
				disabled={loading}
				hint="Enter the current code from your authenticator app."
				value={code}
				oninput={handleCodeInput}
				placeholder="000000"
				maxlength={6}
				autocomplete="one-time-code"
				inputmode="numeric"
				inputClass="px-[calc(0.625rem+0.35em)] text-center font-mono text-2xl tracking-[0.35em]"
			/>

			<div class="flex flex-col gap-3">
				<Button type="submit" disabled={loading || code.length !== 6} class="w-full">
					{#if loading}
						<Spinner />
						Verifying...
					{:else}
						Verify
					{/if}
				</Button>
			</div>
		</form>

		<div
			class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
		>
			<span class="h-px flex-1 bg-border"></span>
			<span class="whitespace-nowrap">Wrong account?</span>
			<span class="h-px flex-1 bg-border"></span>
		</div>

		<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
			<div>
				Leave this verification step and
				<form method="POST" action={resolve('/auth/logout')} class="inline">
					<button type="submit" class="font-medium underline-offset-4 hover:text-foreground hover:underline">
						sign out
					</button>
				</form>
				.
			</div>
		</div>
	</div>
</AuthShell>
