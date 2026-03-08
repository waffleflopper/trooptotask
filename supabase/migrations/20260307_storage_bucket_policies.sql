-- Storage bucket RLS policies for counseling-files
-- Ensures only org members can read files and only personnel editors can write/delete

CREATE POLICY "Org members can read counseling files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'counseling-files'
  AND is_org_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Personnel editors can upload counseling files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'counseling-files'
  AND can_edit_personnel((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Personnel editors can update counseling files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'counseling-files'
  AND can_edit_personnel((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Personnel editors can delete counseling files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'counseling-files'
  AND can_edit_personnel((storage.foldername(name))[1]::uuid)
);
