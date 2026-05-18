<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let email = $state('');
	let name = $state('');
	let reason = $state('');
	let loading = $state(false);
	let submitted = $state(false);
	let errorMsg = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;

		errorMsg = '';
		loading = true;

		try {
			const res = await fetch('/api/access-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, name, reason: reason || undefined })
			});

			if (!res.ok) {
				const data = await res.json();
				errorMsg = data.message || 'Something went wrong. Please try again.';
				return;
			}

			submitted = true;
		} catch {
			errorMsg = 'Something went wrong. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Request Access - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Beta Access"
	title="Request access to the beta."
	description="Submit your information and we'll review your request. Approved users receive an Account Setup Link by email."
	panelEyebrow="Beta request"
	panelTitle={submitted ? 'Request submitted' : 'Request beta access'}
	panelDescription={submitted ? 'Your beta request is in the queue.' : 'Tell us who you are and how to reach you.'}
	imageSrc="/auth/auth-request-access-packet.png"
	imageAlt="A military access packet with folders, a clipboard, and field desk materials."
	supportLabel="What this is for"
	supportTitle="Beta access only."
	supportDescription="If you are already approved, request a fresh setup link. If you already have an account, sign in."
	supportPoints={[
		'Approved users receive a setup link after review.',
		'That setup link expires after 14 days for security.',
		'Some @army.mil and @health.mil addresses can filter these emails before they reach your inbox.',
		'If your setup link expired or was replaced, request a fresh setup link.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if submitted}
			<AuthNotice tone="success" title="We've got your request" centered>
				<p>We'll review your request and email <strong>{email}</strong> if access is approved.</p>
				<p>For security, that Account Setup Link will work for 14 days once it is sent.</p>
			</AuthNotice>

			<div class="flex flex-col gap-3">
				<Button href="/auth/login" class="w-full">Back to sign in</Button>
			</div>
		{:else}
			{#if errorMsg}
				<AuthNotice tone="error" message={errorMsg} />
			{/if}
			<AuthNotice tone="warning" title="Important">
				<p>If your request is approved, the setup link in your email will be valid for 14 days.</p>
				<p>If it expires or is replaced, request a fresh setup link and use the newest email.</p>
			</AuthNotice>

			<form onsubmit={handleSubmit} class="flex flex-col gap-5">
				<AuthField label="Full Name" id="name" bind:value={name} required placeholder="Your full name" />

				<AuthField
					label="Email Address"
					id="email"
					type="email"
					bind:value={email}
					required
					placeholder="you@example.com"
				/>

				<AuthField
					label="Unit or Reason"
					id="reason"
					inputElement="textarea"
					bind:value={reason}
					rows={4}
					placeholder="Tell us your unit, role, or why you want beta access"
					hint="Optional."
				/>

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={loading} class="w-full">
						{#if loading}
							<Spinner />
							Submitting...
						{:else}
							Submit Request
						{/if}
					</Button>
				</div>
			</form>

			<div
				class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
			>
				<span class="h-px flex-1 bg-border"></span>
				<span class="whitespace-nowrap">Other paths</span>
				<span class="h-px flex-1 bg-border"></span>
			</div>

			<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
				<p>
					Already approved? <a href={resolve('/auth/renew-invite')}>Request a fresh setup link</a>.
				</p>
				<p>
					Already active? <a href={resolve('/auth/login')}>Sign in</a>.
				</p>
			</div>
		{/if}
	</div>
</AuthShell>
