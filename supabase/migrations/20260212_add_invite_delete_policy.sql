-- Allow users to delete their own unused registration invites

create policy "Users can delete their own invites"
  on public.registration_invites for delete
  using (auth.uid() = created_by and used_by is null);
