<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { DutyRosterStatus } from './status.js';
	import { getDutyRosterStatusBadge } from './status.js';

	type Props = {
		status: DutyRosterStatus;
		label?: string;
	};

	let { status, label }: Props = $props();
	const config = $derived(getDutyRosterStatusBadge(status));
</script>

<Badge variant={config.variant} aria-label={config.ariaLabel}>{label ?? config.label}</Badge>
