<script lang="ts">
	import type { Snippet } from 'svelte';

	type NoticeTone = 'error' | 'success' | 'warning' | 'info';

	interface Props {
		tone?: NoticeTone;
		title?: string;
		message?: string;
		centered?: boolean;
		children?: Snippet;
	}

	let { tone = 'info', title, message, centered = false, children }: Props = $props();
</script>

<div class:auth-alert--centered={centered} class="auth-alert" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
	<div class="auth-alert__icon" aria-hidden="true">
		{#if tone === 'error'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="9" />
				<path d="M12 7v6" />
				<circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
			</svg>
		{:else if tone === 'success'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="9" />
				<path d="m8.5 12.5 2.2 2.2 4.8-5.2" />
			</svg>
		{:else if tone === 'warning'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 3 2.8 19h18.4L12 3Z" />
				<path d="M12 9v4" />
				<circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="9" />
				<path d="M12 10.5v5" />
				<circle cx="12" cy="7.5" r="0.5" fill="currentColor" />
			</svg>
		{/if}
	</div>

	<div class="auth-alert__body">
		{#if title}
			<p class="auth-alert__title">{title}</p>
		{/if}

		{#if children}
			{@render children()}
		{:else if message}
			<p>{message}</p>
		{/if}
	</div>
</div>
