<script lang="ts">
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import * as Empty from '$lib/components/ui/empty/index.js';

	type Props = {
		message?: string;
	};

	let { message = 'No data.' }: Props = $props();
</script>

<Empty.Root data-slot="data-table-empty" class="border-0 py-10">
	<Empty.Header>
		<Empty.Media variant="icon">
			<InboxIcon aria-hidden="true" />
		</Empty.Media>
		<Empty.Title>{message}</Empty.Title>
	</Empty.Header>
</Empty.Root>
