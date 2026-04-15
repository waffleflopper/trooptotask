import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

describe('admin settings page server load', () => {
	it('defaults the warning window and Critical Tasks settings when the organization settings are unset', async () => {
		const single = vi.fn().mockResolvedValue({ data: { archive_retention_months: 36 } });
		const eq = vi.fn().mockReturnValue({ single });
		const select = vi.fn().mockReturnValue({ eq });
		const from = vi.fn().mockReturnValue({ select });

		const result = await load({
			params: { orgId: 'org-1' },
			locals: { supabase: { from } },
			cookies: {} as never
		} as never);

		expect(from).toHaveBeenCalledWith('organizations');
		expect(select).toHaveBeenCalledWith(
			'archive_retention_months, loss_warning_window_days, critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
		);
		expect(eq).toHaveBeenCalledWith('id', 'org-1');
		expect(single).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			retentionMonths: 36,
			lossWarningWindowDays: 180,
			criticalTasksSettings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			}
		});
	});
});
