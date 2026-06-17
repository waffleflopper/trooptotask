import { isBillingEnabled } from '$lib/config/billing';
import type { DataStore, ReadOnlyGuardState } from '$lib/server/core/ports';
import type { ReadOnlyReason } from '$lib/types/subscription';
import {
	readEffectivePlanPolicy,
	effectiveActivePersonnelLimitForPlanPolicy,
	type EffectivePlanPolicy,
	type PersonnelUsageForPlanPolicy,
	type PlanPolicyDenialReason
} from './planPolicy';
import { readActivePersonnelCount } from './organizationPlanUsage';

interface ReadOnlyModePorts {
	store: DataStore;
	auth: { orgId: string };
}

export function readOnlyModeMessage(reason: ReadOnlyReason | null | undefined): string {
	switch (reason) {
		case 'payment_failure':
			return 'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.';
		case 'billing_state':
			return 'Organization billing is not currently active. Restore the subscription to regain paid write access.';
		case 'personnel_limit':
		default:
			return 'Organization is in read-only mode. Please subscribe or remove personnel.';
	}
}

export async function readReadOnlyModeState(ports: ReadOnlyModePorts): Promise<ReadOnlyGuardState> {
	if (!isBillingEnabled) {
		return activeReadOnlyModeState();
	}

	const [policy, activePersonnelCount] = await Promise.all([
		readEffectivePlanPolicy(ports),
		readActivePersonnelCount({ auth: ports.auth, store: ports.store })
	]);
	return readOnlyModeStateForPlanPolicy(policy, { activePersonnelCount });
}

export function readOnlyModeStateForPlanPolicy(
	policy: EffectivePlanPolicy,
	usage: PersonnelUsageForPlanPolicy
): ReadOnlyGuardState {
	const billingReason = policy.readOnly.reasons[0];
	if (billingReason) {
		const reason = readOnlyReasonFromPolicy(billingReason.code);
		return {
			isReadOnly: true,
			reason,
			message: billingReason.message
		};
	}

	const personnelLimit = effectiveActivePersonnelLimitForPlanPolicy(policy, usage);
	if (personnelLimit !== null && usage.activePersonnelCount > personnelLimit) {
		return {
			isReadOnly: true,
			reason: 'personnel_limit',
			message: readOnlyModeMessage('personnel_limit')
		};
	}

	return activeReadOnlyModeState();
}

function activeReadOnlyModeState(): ReadOnlyGuardState {
	return { isReadOnly: false, reason: null, message: null };
}

function readOnlyReasonFromPolicy(code: PlanPolicyDenialReason['code']): ReadOnlyReason {
	switch (code) {
		case 'denied.payment_failed':
			return 'payment_failure';
		case 'denied.billing_not_current':
			return 'billing_state';
		case 'denied.personnel_limit':
			return 'personnel_limit';
		case 'denied.member_limit':
		case 'denied.pending_invitation_limit':
		case 'denied.organization_ownership_limit':
		case 'denied.export_quota':
			throw new Error(`Unsupported Read-Only Mode policy reason: ${code}`);
		default: {
			const unhandledCode: never = code;
			throw new Error(`Unhandled Read-Only Mode policy reason: ${String(unhandledCode)}`);
		}
	}
}
