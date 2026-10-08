import type {
	PersonnelSheetPersistence,
	PersonnelSheetEditableValues,
	SavedPersonnelSheet
} from './personnelSheetPersistence';
import type { PersonnelRecordPersistence } from './contracts';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { z } from 'zod';
import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { personnelExtendedInfoInputSchema, type PersonnelExtendedInfo } from './contracts';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';

interface PersonnelExtendedInfoContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	scope: { requireGroupAccess(personnelId: string): Promise<void> };
	personnel: Pick<PersonnelRecordPersistence, 'findGroupReference'>;
	personnelSheets: PersonnelSheetPersistence;
}

type PersonnelExtendedInfoInput = z.infer<typeof personnelExtendedInfoInputSchema>;

type ExtendedInfoRow = SavedPersonnelSheet;

function normalizeJsonStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeChildren(value: unknown): PersonnelExtendedInfo['children'] {
	const parsed = personnelExtendedInfoInputSchema.shape.children.safeParse(value);
	return parsed.success ? parsed.data : [];
}

function toAddress(
	row: Pick<ExtendedInfoRow, 'address_street' | 'address_city' | 'address_state' | 'address_zip'>
): string {
	return [row.address_street, row.address_city, row.address_state, row.address_zip].filter(Boolean).join(', ');
}

function mapExtendedInfoRow(row: ExtendedInfoRow): PersonnelExtendedInfo {
	return {
		bloodType: row.blood_type ?? '',
		basd: row.basd ?? '',
		dateOfRank: row.date_of_rank ?? '',
		maritalStatus: row.marital_status ?? '',
		numberOfDependents: row.number_of_dependents ?? null,
		children: normalizeChildren(row.children),
		civilianEducation: row.civilian_education ?? '',
		militaryEducation: normalizeJsonStringArray(row.military_education),
		emergencyContactName: row.emergency_contact_name ?? '',
		emergencyContactRelationship: row.emergency_contact_relationship ?? '',
		emergencyContactPhone: row.emergency_contact_phone ?? '',
		spouseName: row.spouse_name ?? '',
		spousePhone: row.spouse_phone ?? '',
		vehicleMakeModel: row.vehicle_make_model ?? '',
		vehiclePlate: row.vehicle_plate ?? '',
		vehicleColor: row.vehicle_color ?? '',
		personalEmail: row.personal_email ?? '',
		personalPhone: row.personal_phone ?? '',
		addressStreet: row.address_street ?? '',
		addressCity: row.address_city ?? '',
		addressState: row.address_state ?? '',
		addressZip: row.address_zip ?? '',
		address: toAddress(row)
	};
}

function toRowData(input: PersonnelExtendedInfoInput): PersonnelSheetEditableValues {
	return {
		blood_type: input.bloodType || null,
		basd: input.basd || null,
		date_of_rank: input.dateOfRank || null,
		marital_status: input.maritalStatus || null,
		number_of_dependents: input.numberOfDependents,
		children: input.children,
		civilian_education: input.civilianEducation || null,
		military_education: input.militaryEducation,
		emergency_contact_name: input.emergencyContactName || null,
		emergency_contact_relationship: input.emergencyContactRelationship || null,
		emergency_contact_phone: input.emergencyContactPhone || null,
		spouse_name: input.spouseName || null,
		spouse_phone: input.spousePhone || null,
		vehicle_make_model: input.vehicleMakeModel || null,
		vehicle_plate: input.vehiclePlate || null,
		vehicle_color: input.vehicleColor || null,
		personal_email: input.personalEmail || null,
		personal_phone: input.personalPhone || null,
		address_street: input.addressStreet || null,
		address_city: input.addressCity || null,
		address_state: input.addressState || null,
		address_zip: input.addressZip || null
	};
}

async function requirePersonnelOperate(ctx: PersonnelExtendedInfoContext, personnelId: string): Promise<void> {
	const person = await ctx.personnel.findGroupReference(personnelId);
	if (!person) fail(404, 'Personnel record not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(person.groupId),
		'personnel',
		personnelId
	);
	await ctx.scope.requireGroupAccess(personnelId);
}

export async function readPersonnelExtendedInfo(
	ctx: PersonnelExtendedInfoContext,
	personnelId: string
): Promise<PersonnelExtendedInfo | null> {
	await requirePersonnelOperate(ctx, personnelId);
	const rows = await ctx.personnelSheets.listSheetsForPerson(personnelId);
	const row = rows[0];
	return row ? mapExtendedInfoRow(row) : null;
}

export async function updatePersonnelExtendedInfo(
	ctx: PersonnelExtendedInfoContext,
	rawInput: unknown
): Promise<PersonnelExtendedInfo> {
	const parsed = personnelExtendedInfoInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	const input = parsed.data;
	await requirePersonnelOperate(ctx, input.personnelId);

	const existing = await ctx.personnelSheets.findSheetForPerson(input.personnelId);
	const data = toRowData(input);
	const row = existing
		? await ctx.personnelSheets.replaceEditableSheetFields(existing.id, data)
		: await ctx.personnelSheets.createSheet(input.personnelId, data);

	ctx.audit.log({
		action: 'personnel.extended_info.updated',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	return mapExtendedInfoRow(row);
}
