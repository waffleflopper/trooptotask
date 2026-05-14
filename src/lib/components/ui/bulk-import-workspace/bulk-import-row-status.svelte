<script lang="ts">
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CheckCircle2Icon from '@lucide/svelte/icons/check-circle-2';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { BulkImportRowStatusTone } from './types.js';

	type Props = {
		tone: BulkImportRowStatusTone;
		label?: string;
		description?: string;
	};

	let { tone, label, description }: Props = $props();

	const displayLabel = $derived(label ?? defaultLabel(tone));
	const badgeVariant = $derived(
		tone === 'valid'
			? 'success'
			: tone === 'warning'
				? 'warning'
				: tone === 'error'
					? 'danger'
					: tone === 'duplicate'
						? 'info'
						: tone === 'disabled'
							? 'outline'
							: 'secondary'
	);

	function defaultLabel(statusTone: BulkImportRowStatusTone): string {
		switch (statusTone) {
			case 'valid':
				return 'Valid';
			case 'warning':
				return 'Warning';
			case 'error':
				return 'Error';
			case 'disabled':
				return 'Blocked';
			case 'duplicate':
				return 'Duplicate';
			case 'info':
				return 'Info';
		}
	}
</script>

<span class="inline-flex min-w-0 flex-col items-start gap-1">
	<Badge variant={badgeVariant} title={description}>
		{#if tone === 'valid'}
			<CheckCircle2Icon />
		{:else if tone === 'warning'}
			<TriangleAlertIcon />
		{:else if tone === 'error'}
			<AlertCircleIcon />
		{:else if tone === 'disabled'}
			<BanIcon />
		{:else if tone === 'duplicate'}
			<CopyIcon />
		{:else}
			<InfoIcon />
		{/if}
		<span>{displayLabel}</span>
	</Badge>
	{#if description}
		<span class="max-w-56 text-xs leading-5 text-muted-foreground">{description}</span>
	{/if}
</span>
