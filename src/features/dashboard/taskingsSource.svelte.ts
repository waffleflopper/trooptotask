import type { DashboardTaskings } from './contracts';
import { DashboardSource } from './dashboardSource.svelte';

/** The Tasking read behind the Needs you rows and the forecast lane. */
export class DashboardTaskingsSource extends DashboardSource<DashboardTaskings> {
	constructor() {
		super((orgId, asOf) => `/org/${orgId}/api/dashboard/taskings?asOf=${asOf}`, 'Failed to load Taskings');
	}
}
