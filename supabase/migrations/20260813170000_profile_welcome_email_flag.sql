-- One-time marker so the welcome email is sent at most once per account.
alter table phase1.profiles
  add column if not exists welcome_email_sent_at timestamptz;
