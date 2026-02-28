-- Migration: Add counseling file uploads
-- Date: 2026-02-26
-- Description: Adds notes + file_path columns to counseling_records,
--              template_file_path to counseling_types, and creates
--              a private storage bucket for counseling PDFs.

-- ============================================================
-- 1. Add columns to counseling_records
-- ============================================================

ALTER TABLE public.counseling_records
    ADD COLUMN IF NOT EXISTS notes text,
    ADD COLUMN IF NOT EXISTS file_path text;

-- ============================================================
-- 2. Add column to counseling_types
-- ============================================================

ALTER TABLE public.counseling_types
    ADD COLUMN IF NOT EXISTS template_file_path text;

-- ============================================================
-- 3. Create storage bucket for counseling files
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'counseling-files',
    'counseling-files',
    false,
    10485760, -- 10MB
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. Storage RLS policies
-- Files are stored as: {orgId}/{record-or-type-id}/{filename}
-- We extract the orgId from the first path segment.
-- ============================================================

CREATE POLICY "Users can view counseling files if can view personnel"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'counseling-files'
        AND can_view_personnel((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "Users can upload counseling files if can edit personnel"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'counseling-files'
        AND can_edit_personnel((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "Users can update counseling files if can edit personnel"
    ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'counseling-files'
        AND can_edit_personnel((storage.foldername(name))[1]::uuid)
    )
    WITH CHECK (
        bucket_id = 'counseling-files'
        AND can_edit_personnel((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "Users can delete counseling files if can edit personnel"
    ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'counseling-files'
        AND can_edit_personnel((storage.foldername(name))[1]::uuid)
    );
