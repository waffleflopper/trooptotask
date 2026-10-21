import { describe, expect, it } from 'vitest';
import type { AuditLogEntry } from '$lib/audit/contracts';
import { auditDayHead, auditScope, auditSentence, viewAuditEntry } from './auditLogEntries';

/** Every action an audit producer in the app writes today, by the scope Logs files it under. */
const WRITTEN_ACTIONS = {
	deletions: [
		'assignment_type.deleted',
		'availability.bulk_deleted',
		'availability.deleted',
		'deletion_request.approved',
		'deletion_request.cancelled',
		'deletion_request.created',
		'deletion_request.denied',
		'group.deleted',
		'notification.deleted',
		'onboarding_template.deleted',
		'onboarding_template_step.deleted',
		'org.deleted',
		'organization.rank_catalog.deleted',
		'personnel.archived',
		'personnel.bulk_archived',
		'personnel.counseling_record.archived',
		'personnel.counseling_record.deleted',
		'personnel.document.archived',
		'personnel.document.deleted',
		'personnel.follow_up.archived',
		'personnel.follow_up.deleted',
		'personnel.leader_note.archived',
		'personnel.leader_note.deleted',
		'personnel.permanently_deleted',
		'personnel_ict_completion.deleted',
		'pinned_group.deleted',
		'rating_scheme.deleted',
		'sign_in_roster.deleted',
		'special_day.deleted',
		'status_type.deleted',
		'training_record.deleted',
		'training_type.deleted',
		'training_view.deleted'
	],
	access: [
		'access_request.account_setup_approval_authorization_denied',
		'access_request.account_setup_approval_rate_limited',
		'access_request.account_setup_link_delivery_failed',
		'access_request.account_setup_link_resent',
		'access_request.account_setup_link_sent',
		'access_request.account_setup_resend_authorization_denied',
		'access_request.account_setup_resend_rate_limited',
		'access_request.approved',
		'access_request.rejected',
		'access_request.rejection_authorization_denied',
		'access_request.rescinded',
		'access_request.rescission_authorization_denied',
		'member.access_changed',
		'member.high_privilege_invite_authorization_denied',
		'member.high_privilege_remove_authorization_denied',
		'member.high_privilege_update_authorization_denied',
		'member.invite',
		'member.invite_access_request_already_linked',
		'member.invite_access_request_created',
		'member.invite_access_request_link_block_failed',
		'member.invite_access_request_link_failed',
		'member.invite_access_request_linked',
		'member.invite_account_setup_link_block_failed',
		'member.invite_account_setup_link_not_created',
		'member.invite_email_delivery_failed',
		'member.invite_email_resend_delivery_failed',
		'member.invite_email_resent',
		'member.invite_email_sent',
		'member.invite_rate_limited',
		'member.invite_resend_rate_limited',
		'member.invite_revoked',
		'member.left',
		'member.removed',
		'org.delete_authorization_denied',
		'org.ownership_transfer_authorization_denied',
		'org.ownership_transferred',
		'org.renamed',
		'org.url_slug_cleared',
		'org.url_slug_updated',
		'organization.rank_catalog.bulk_state_changed',
		'organization.rank_catalog.reactivated',
		'organization.rank_catalog.reconciled',
		'organization.rank_catalog.retired',
		'organization.rank_catalog.saved',
		'organization.rank_catalog.service_pack_added',
		'organization.settings_updated',
		'organization_invitation.accepted',
		'organization_invitation.blocked_by_access_request_rejection',
		'organization_invitation.blocked_by_access_request_rescission',
		'organization_invitation.declined',
		'policy.denied'
	],
	records: [
		'account_setup.claim_released_by_staff',
		'account_setup.claimed',
		'account_setup.completed',
		'account_setup.completion_rate_limited',
		'account_setup.failed',
		'account_setup.link_revoked',
		'account_setup.renewal_rate_limited',
		'admin.org.make_admin',
		'admin.org.membership_authorization_denied',
		'admin.org.transfer_ownership',
		'admin.user.password_reset',
		'admin.user.resend_invite',
		'announcement_activate',
		'announcement_create',
		'announcement_deactivate',
		'announcement_delete',
		'assignment_type.calendar_lanes_set',
		'assignment_type.created',
		'assignment_type.updated',
		'auth.forgot_password_rate_limited',
		'auth.login_failure',
		'auth.login_success',
		'auth.password_update_rate_limited',
		'auth.session_revoke_failed',
		'availability.bulk_created',
		'availability.created',
		'availability.updated',
		'calendar_report.viewed',
		'critical_tasks.defaults_updated',
		'daily_assignment.batch_replaced',
		'daily_assignment.cleared',
		'daily_assignment.created',
		'daily_assignment.replaced',
		'export.created',
		'export.excel_created',
		'group.created',
		'group.updated',
		'ict_task.bulk_imported',
		'ict_task.created',
		'ict_task.reordered',
		'ict_task.updated',
		'notification.delete_all',
		'notification.mark_all_read',
		'notification.read',
		'onboarding.cancelled',
		'onboarding.completed',
		'onboarding.reopened',
		'onboarding.resynced',
		'onboarding.started',
		'onboarding.template_switched',
		'onboarding_step.inactive_removed',
		'onboarding_step.note_added',
		'onboarding_step.stage_advanced',
		'onboarding_step.toggled',
		'onboarding_template.created',
		'onboarding_template.duplicated',
		'onboarding_template.updated',
		'onboarding_template_step.created',
		'onboarding_template_step.reordered',
		'onboarding_template_step.updated',
		'personnel.award_tracking_acknowledged',
		'personnel.award_tracking_cleared',
		'personnel.bulk_created',
		'personnel.bulk_merged',
		'personnel.counseling_record.created',
		'personnel.counseling_record.restored',
		'personnel.created',
		'personnel.document.created',
		'personnel.document.restored',
		'personnel.exported',
		'personnel.extended_info.updated',
		'personnel.follow_up.completed',
		'personnel.follow_up.created',
		'personnel.follow_up.reopened',
		'personnel.follow_up.restored',
		'personnel.follow_up.updated',
		'personnel.leader_note.created',
		'personnel.leader_note.restored',
		'personnel.leader_note.updated',
		'personnel.restored',
		'personnel.updated',
		'personnel_ict_completion.bulk_imported',
		'personnel_ict_completion.created',
		'personnel_ict_completion.updated',
		'pinned_group.created',
		'pinned_group.replaced',
		'rating_scheme.created',
		'rating_scheme.updated',
		'security.rate_limit_exceeded',
		'sign_in_roster.created',
		'sign_in_roster.scan_uploaded',
		'special_day.created',
		'special_day.federal_holidays_reset',
		'special_day.updated',
		'status_type.created',
		'status_type.reordered',
		'status_type.updated',
		'suspend_org',
		'suspend_user',
		'training.bulk_imported',
		'training_record.corrected',
		'training_record.created',
		'training_record.updated',
		'training_type.created',
		'training_type.updated',
		'training_view.created',
		'training_view.updated',
		'unsuspend_org',
		'unsuspend_user',
		'user_preferences.updated'
	]
} as const;

describe('auditScope', () => {
	it.each(Object.entries(WRITTEN_ACTIONS).flatMap(([scope, actions]) => actions.map((action) => [action, scope])))(
		'files %s under %s',
		(action, scope) => {
			expect(auditScope(action)).toBe(scope);
		}
	);

	it('files an action no producer writes yet by its event, then its family', () => {
		expect(auditScope('widget.purged')).toBe('deletions');
		expect(auditScope('organization.widget_added')).toBe('access');
		expect(auditScope('widget.frobbed')).toBe('records');
	});
});

describe('auditSentence', () => {
	it('falls back to the event in words for an action it does not know', () => {
		const sentence = auditSentence('widget.frobbed', null);

		expect(sentence).toContain('frobbed');
		expect(sentence).not.toContain('widget.frobbed');
	});

	it('names the feature switches turned off and on, under the Access scope', () => {
		const switched = (previous: string[], next: string[]) =>
			auditSentence('organization.settings_updated', {
				previous_disabled_features: previous,
				disabled_features: next
			});
		const sentence = switched(['training'], ['onboarding', 'lossesAndAwards']);

		for (const label of ['Onboarding', 'Losses and awards', 'Training']) expect(sentence).toContain(label);
		expect(switched([], ['training'])).not.toBe(switched(['training'], []));
		expect(auditScope('organization.settings_updated')).toBe('access');
	});

	it('shows the strength floor before then after, and policy values as set', () => {
		const floor = auditSentence('organization.settings_updated', {
			previous_strength_floor_percent: 80,
			strength_floor_percent: 75
		});

		expect(floor.indexOf('80%')).toBeGreaterThanOrEqual(0);
		expect(floor.indexOf('80%')).toBeLessThan(floor.indexOf('75%'));
		expect(auditSentence('organization.settings_updated', { loss_warning_window_days: 120 })).toContain('120');
	});

	it('says what a deletion request was about, and archive for a person', () => {
		const record = auditSentence('deletion_request.approved', {
			subject_type: 'training_record',
			subject_label: 'Weapons Qualification'
		});
		const person = auditSentence('deletion_request.approved', {
			subject_type: 'personnel',
			subject_label: 'PFC Grant'
		});

		expect(record).toContain('Weapons Qualification');
		expect(record).toMatch(/delet/i);
		expect(person).toContain('PFC Grant');
		expect(person).toMatch(/archive/i);
		expect(
			auditSentence('deletion_request.denied', { subject_type: 'personnel', subject_label: 'PFC Grant' })
		).not.toBe(person);
	});

	it('uses resolved labels and skips values the audit writer redacted', () => {
		const training = auditSentence('training_record.updated', {
			personnel: 'SPC Reed',
			training_type: 'Weapons Qualification'
		});

		expect(training).toContain('SPC Reed');
		expect(training).toContain('Weapons Qualification');
		expect(auditSentence('member.invite', { email: 'b***@army.mil' })).toContain('b***@army.mil');
		expect(auditSentence('member.invite', { email: '[redacted]' })).not.toContain('redacted');
		expect(auditSentence('personnel.restored', { subject_label: 'SGT Fields' })).toContain('SGT Fields');
		expect(auditSentence('sign_in_roster.created', { title: 'Range day' })).toContain('Range day');
		expect(auditSentence('personnel.bulk_archived', { count: 3 })).toContain('3');
	});
});

function entry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
	return {
		id: 'audit-1',
		userId: null,
		actor: null,
		action: 'org.renamed',
		resourceType: 'organization',
		resourceId: null,
		details: { name: 'C Co' },
		createdAt: '2026-10-20T03:30:00Z',
		...overrides
	};
}

describe('viewAuditEntry', () => {
	it("puts the clock and the day in the viewer's time zone", () => {
		expect(viewAuditEntry(entry({}), 'America/New_York')).toMatchObject({ day: '2026-10-19', clock: '23:30' });
		expect(viewAuditEntry(entry({}), 'UTC')).toMatchObject({ day: '2026-10-20', clock: '03:30' });
		expect(viewAuditEntry(entry({ createdAt: '2026-10-20T00:00:00+00:00' }), 'UTC')).toMatchObject({
			day: '2026-10-20',
			clock: '00:00'
		});
	});

	it('reads an empty or missing actor as a System change', () => {
		expect(viewAuditEntry(entry({ actor: '  ' }), 'UTC').actor).toBeNull();
		expect(viewAuditEntry(entry({ actor: 'dana@army.mil' }), 'UTC')).toMatchObject({
			actor: 'dana@army.mil',
			area: 'Unit',
			scope: 'access',
			sentence: 'Renamed the unit to C Co'
		});
	});

	it('names the product area of an action', () => {
		const area = (action: string) => viewAuditEntry(entry({ action, details: null }), 'UTC').area;
		expect(area('organization.settings_updated')).toBe('Policies');
		expect(area('organization.rank_catalog.saved')).toBe('Ranks');
		expect(area('deletion_request.approved')).toBe('Approvals');
		expect(area('member.access_changed')).toBe('Members');
		expect(area('personnel.permanently_deleted')).toBe('Archives');
		expect(area('training_record.updated')).toBe('Training');
		expect(area('daily_assignment.replaced')).toBe('Calendar');
		expect(area('widget_part.frobbed')).toBe('Widget part');
	});
});

describe('auditDayHead', () => {
	it('names today and yesterday with the date, and older days by date', () => {
		expect(auditDayHead('2026-10-19', '2026-10-19', 5)).toEqual({ title: 'Today', detail: '19 Oct · 5 entries' });
		expect(auditDayHead('2026-10-18', '2026-10-19', 1)).toEqual({ title: 'Yesterday', detail: '18 Oct · 1 entry' });
		expect(auditDayHead('2026-10-17', '2026-10-19', 3)).toEqual({ title: '17 Oct', detail: '3 entries' });
	});

	it('counts a day cut off by the loaded window as a floor', () => {
		expect(auditDayHead('2026-10-17', '2026-10-19', 12, { cutOff: true })).toEqual({
			title: '17 Oct',
			detail: '12+ entries'
		});
		expect(auditDayHead('2026-10-19', '2026-10-19', 1, { cutOff: true })).toEqual({
			title: 'Today',
			detail: '19 Oct · 1+ entries'
		});
	});

	it('finds yesterday across a month and a year boundary', () => {
		expect(auditDayHead('2026-10-31', '2026-11-01', 2).title).toBe('Yesterday');
		expect(auditDayHead('2025-12-31', '2026-01-01', 2).title).toBe('Yesterday');
		expect(auditDayHead('2025-12-30', '2026-01-01', 2)).toEqual({ title: '30 Dec 2025', detail: '2 entries' });
	});
});
