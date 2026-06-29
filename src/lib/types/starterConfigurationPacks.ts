import type { PolicyReasonCode } from '$lib/access/policyEvaluator';

export type StarterConfigurationPackId = 'first-week-operations';

export type StarterConfigurationPackArtifactFamilyId =
	| 'training-types'
	| 'onboarding-template'
	| 'duty-roster-template';

export interface StarterConfigurationPackArtifactPreview {
	family: StarterConfigurationPackArtifactFamilyId;
	label: string;
	names: string[];
	description: string;
}

export interface StarterConfigurationPackFamilyReadiness {
	family: StarterConfigurationPackArtifactFamilyId;
	label: string;
	configured: boolean;
	starterArtifactCount: number;
	expectedArtifactCount: number;
	existingStarterArtifactNames: string[];
}

export interface StarterConfigurationPackDeniedAction {
	id: string;
	label: string;
	reasonCode: PolicyReasonCode;
}

export interface StarterConfigurationPackSupport {
	id: StarterConfigurationPackId;
	name: string;
	description: string;
	editableCopy: string;
	artifacts: StarterConfigurationPackArtifactPreview[];
	readiness: StarterConfigurationPackFamilyReadiness[];
	canApply: boolean;
	deniedActions: StarterConfigurationPackDeniedAction[];
	isFullyApplied: boolean;
}

export interface StarterConfigurationPackResultItem {
	family: StarterConfigurationPackArtifactFamilyId;
	name: string;
}

export interface StarterConfigurationPackFailedItem extends StarterConfigurationPackResultItem {
	message: string;
}

export interface StarterConfigurationPackApplyResult {
	packId: StarterConfigurationPackId;
	packName: string;
	created: StarterConfigurationPackResultItem[];
	skipped: StarterConfigurationPackResultItem[];
	failed: StarterConfigurationPackFailedItem[];
}
