# 011 - Verify sign-in roster PDF signatures

Status: DONE
Priority: P2
Effort: S
Created: 2026-06-11
Audit commit: `c99874d0`

## Problem

Sign-in roster uploads validate MIME type and size, but they do not verify that the uploaded bytes look like a PDF. Other sensitive upload paths already check the PDF file signature. Sign-in rosters should have the same defense against spoofed `application/pdf` uploads.

## Evidence

- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts` calls `validateSensitiveFileSelection(input.file)` before upload.
- `src/lib/storage/sensitiveFiles.ts` currently validates:
  - `file.type === 'application/pdf'`
  - `file.size <= 10MB`
  - It does not inspect file bytes.
- `src/lib/storage/fileSignatures.ts` exports `hasPdfFileSignature(...)`.
- `src/lib/server/core/useCases/personnelCounselingRecords.ts` and `src/lib/server/core/useCases/personnelDocuments.ts` already use byte-signature checks for PDF uploads.
- `src/lib/storage/sensitiveFiles.test.ts` covers MIME and size validation but not spoofed content.

## Goal

Sign-in roster upload rejects files that claim to be PDFs but do not start with a valid PDF signature.

## Non-Goals

- Do not change storage bucket names, object paths, or roster record state transitions.
- Do not change personnel document or counseling upload behavior in this slice.
- Do not parse or sanitize full PDF contents beyond the existing magic-byte style check.
- Do not redesign the UI file picker.

## Files To Inspect

- `src/lib/storage/sensitiveFiles.ts`
- `src/lib/storage/sensitiveFiles.test.ts`
- `src/lib/storage/fileSignatures.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/server.test.ts`
- `src/routes/org/[orgId]/api/personnel/[id]/documents/server.test.ts`

## Implementation Plan

1. Add failing storage-helper tests.
   - Add a test that a file with `type: 'application/pdf'` and small size but non-PDF bytes is rejected.
   - Add a test that a small file beginning with the PDF signature is accepted.
   - Keep existing MIME and size tests intact.

2. Add an async PDF validation helper for sensitive file uploads.
   - Keep the existing synchronous `validateSensitiveFileSelection(...)` helper if other callers use it for type/size checks.
   - Add a new helper such as `validateSensitivePdfFile(file: File): Promise<string | null>`.
   - The new helper should:
     - Call `validateSensitiveFileSelection(...)` first.
     - Read only the small prefix needed by `hasPdfFileSignature(...)`.
     - Return the existing "Only PDF files are allowed." style message for a signature mismatch.
   - Reuse `hasPdfFileSignature(...)` rather than duplicating magic-byte logic.

3. Update the sign-in roster upload endpoint.
   - In `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts`, await the new helper.
   - Keep all other upload behavior unchanged.
   - Ensure invalid content fails before storage upload.

4. Add route-level regression coverage.
   - Extend `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/server.test.ts`.
   - Model the spoofed-PDF test after `src/routes/org/[orgId]/api/personnel/[id]/documents/server.test.ts` if that file already has file-signature coverage.
   - Assert spoofed `application/pdf` input returns 400 and does not call storage upload.
   - Assert valid PDF bytes still upload successfully.

## Suggested Tests

Run the narrow tests first:

```bash
npm run test -- src/lib/storage/sensitiveFiles.test.ts 'src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/server.test.ts'
```

Before marking complete, run the full repo gate:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

## Acceptance Criteria

- Sign-in roster uploads reject spoofed PDF MIME types with non-PDF bytes.
- Valid PDF uploads continue to work.
- Invalid files are rejected before storage upload.
- Existing file size and MIME validation behavior remains unchanged.
- All required verification commands pass.

## Risks And Notes

- Browser-provided MIME type remains useful but is not trustworthy by itself.
- This signature check is a lightweight guard, not full PDF malware scanning.
