<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import { themeStore } from '$lib/stores/theme.svelte';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	let { ...restProps }: SonnerProps = $props();

	let returnFocus: HTMLElement | null = null;

	function rememberReturnFocus(event: FocusEvent & { currentTarget: HTMLElement }) {
		const from = event.relatedTarget;
		if (from instanceof HTMLElement && !event.currentTarget.contains(from)) returnFocus = from;
	}

	// Removing the focused toast would drop focus to the body, so move it before the toast leaves.
	function keepFocusOnDismiss(event: MouseEvent & { currentTarget: HTMLElement }) {
		const close = event.target instanceof Element ? event.target.closest('[data-close-button]') : null;
		if (!close || document.activeElement !== close) return;
		const next = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-close-button]')].find(
			(button) => button !== close && button.closest('[data-removed="false"]')
		);
		(next ?? (returnFocus?.isConnected ? returnFocus : null))?.focus({ preventScroll: true });
	}
</script>

<Sonner
	theme={themeStore.current}
	closeButton
	onfocusin={rememberReturnFocus}
	onclick={keepFocusOnDismiss}
	class="toaster group"
	style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
</Sonner>
