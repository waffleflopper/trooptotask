-- Add optional note field to availability entries
ALTER TABLE availability_entries
  ADD COLUMN note text;

-- Enforce max length
ALTER TABLE availability_entries
  ADD CONSTRAINT availability_entries_note_length CHECK (char_length(note) <= 200);
