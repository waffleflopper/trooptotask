<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Toaster } from './index.js';
</script>

<button type="button">Page content</button>
<AppDialog.Root onClose={() => {}}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Edit person</AppDialog.Title>
			<AppDialog.Description>Update this person.</AppDialog.Description>
		</AppDialog.Header>
	</AppDialog.Content>
</AppDialog.Root>
<Toaster />
