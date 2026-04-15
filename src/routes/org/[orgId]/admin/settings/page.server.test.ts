import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

describe('admin settings page server load', () => {
	it('defaults the warning window to 180 days when the organization setting is unset', async () => {
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
		expect(select).toHaveBeenCalledWith('archive_retention_months, loss_warning_window_days');
		expect(eq).toHaveBeenCalledWith('id', 'org-1');
		expect(single).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ retentionMonths: 36, lossWarningWindowDays: 180 });
	});
});
