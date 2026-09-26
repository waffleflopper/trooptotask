<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { ACCESS_REQUEST_HEARD_ABOUT_OPTIONS } from '$features/identity/index';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';

	let email = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let reason = $state('');
	let heardAbout = $state('');
	let heardAboutDetails = $state('');
	let loading = $state(false);
	let submitted = $state(false);
	let errorMsg = $state('');

	const heardAboutLabel = $derived(
		ACCESS_REQUEST_HEARD_ABOUT_OPTIONS.find((option) => option.value === heardAbout)?.label ?? 'Select a source'
	);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;

		errorMsg = '';
		if (!heardAbout) {
			errorMsg = 'Select how you heard about TroopToTask';
			return;
		}

		loading = true;

		try {
			const res = await fetch('/api/access-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					firstName,
					lastName,
					heardAbout,
					heardAboutDetails: heardAboutDetails || undefined,
					reason: reason || undefined
				})
			});

			if (!res.ok) {
				const data = await res.json();
				errorMsg = data.error || data.message || 'Something went wrong. Please try again.';
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
	eyebrow="Reviewed Access"
	title="Request access to TroopToTask."
	description="Submit your information and we'll review your request. Approved users receive an Account Setup Link by email."
	panelEyebrow="Access request"
	panelTitle={submitted ? 'Request submitted' : 'Request access'}
	panelDescription={submitted ? 'Your request is in the queue.' : 'Tell us who you are and how to reach you.'}
	imageSrc="/auth/auth-request-access-packet.png"
	imageAlt="A military access packet with folders, a clipboard, and field desk materials."
	supportLabel="What this is for"
	supportTitle="Reviewed access only."
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
				<div class="grid gap-4 sm:grid-cols-2">
					<AuthField
						label="First Name"
						id="firstName"
						bind:value={firstName}
						required
						autocomplete="given-name"
						placeholder="First name"
					/>
					<AuthField
						label="Last Name"
						id="lastName"
						bind:value={lastName}
						required
						autocomplete="family-name"
						placeholder="Last name"
					/>
				</div>

				<AuthField
					label="Email Address"
					id="email"
					type="email"
					bind:value={email}
					required
					placeholder="you@example.com"
				/>

				<Field.Root>
					<Field.Label for="heardAbout" class="text-sm font-medium">
						How did you hear about TroopToTask?<span class="text-destructive" aria-hidden="true">*</span>
					</Field.Label>
					<Select.Root type="single" bind:value={heardAbout}>
						<Select.Trigger id="heardAbout" class="w-full">{heardAboutLabel}</Select.Trigger>
						<Select.Content>
							{#each ACCESS_REQUEST_HEARD_ABOUT_OPTIONS as option (option.value)}
								<Select.Item value={option.value} label={option.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Root>

				{#if heardAbout === 'other'}
					<AuthField
						label="Where did you hear about it?"
						id="heardAboutDetails"
						inputElement="textarea"
						bind:value={heardAboutDetails}
						rows={3}
						placeholder="A short note helps us understand where requests are coming from"
						hint="Optional."
					/>
				{/if}

				<AuthField
					label="Unit or Reason"
					id="reason"
					inputElement="textarea"
					bind:value={reason}
					rows={4}
					placeholder="Tell us your unit, role, or why you want access"
					hint="Optional."
				/>

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={loading || !heardAbout} class="w-full">
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
