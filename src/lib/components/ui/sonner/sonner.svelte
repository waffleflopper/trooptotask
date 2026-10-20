<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import { themeStore } from '$lib/stores/theme.svelte';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	let { onfocusin, onfocusout, onclick, onpointerdown, ...restProps }: SonnerProps = $props();

	let returnFocus: HTMLElement | null = null;

	function rememberReturnFocus(event: FocusEvent & { currentTarget: EventTarget & HTMLOListElement }) {
		onfocusin?.(event);
		const from = event.relatedTarget;
		if (from instanceof HTMLElement && !event.currentTarget.contains(from)) returnFocus = from;
		// Sonner pauses the dismiss timer only while the list is hovered, so a keyboard user would lose an Undo.
		event.currentTarget.dispatchEvent(new MouseEvent('mouseenter'));
	}

	function releaseFocusPause(event: FocusEvent & { currentTarget: EventTarget & HTMLOListElement }) {
		onfocusout?.(event);
		const to = event.relatedTarget;
		if (!(to instanceof Node && event.currentTarget.contains(to)) && !event.currentTarget.matches(':hover')) {
			event.currentTarget.dispatchEvent(new MouseEvent('mouseleave'));
		}
	}

	// A modal layer dismisses on any pointerdown outside its content, so touching a toast would close the dialog or
	// drawer the user is working in.
	function keepOverlayOpen(event: PointerEvent & { currentTarget: EventTarget & HTMLOListElement }) {
		onpointerdown?.(event);
		event.stopPropagation();
	}

	// Removing the focused toast would drop focus to the body, so move it before the toast leaves.
	function keepFocusOnDismiss(event: MouseEvent & { currentTarget: EventTarget & HTMLOListElement }) {
		onclick?.(event);
		const close = event.target instanceof Element ? event.target.closest('[data-close-button]') : null;
		if (!close || document.activeElement !== close) return;
		const next = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-close-button]')].find(
			(button) => button !== close && button.closest('[data-removed="false"][data-visible="true"]')
		);
		(next ?? (returnFocus?.isConnected ? returnFocus : null))?.focus({ preventScroll: true });
	}
</script>

<!-- A modal layer sets pointer-events: none on <body>, which the toaster would inherit, so pointer-events-auto keeps toasts clickable above it. -->
<Sonner
	theme={themeStore.current}
	closeButton
	onfocusin={rememberReturnFocus}
	onfocusout={releaseFocusPause}
	onclick={keepFocusOnDismiss}
	onpointerdown={keepOverlayOpen}
	class="toaster group pointer-events-auto"
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
