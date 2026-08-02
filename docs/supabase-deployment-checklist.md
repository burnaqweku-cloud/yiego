# Supabase Deployment Checklist

Project ref: `nhxgebulvqhtiiotetoo`

## What is already updated in the repo

- The app now points to the new Supabase project URL.
- The repo Supabase config now uses the new project ref.
- Phase 1 schema, Edge Functions, auth, wallet, payments, tracking, and admin scaffolding are already in the codebase.

## What still needs to be done in Supabase

1. Apply the Phase 1 migration to the new database.
2. Deploy all Supabase Edge Functions from this repo.
3. Set the required secrets in Supabase.
4. Verify the Data API, auth, and webhooks.

## Required secrets to add

- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_WEBHOOK_SECRET`
- `DATAMART_API_KEY`
- `DATAMART_API_SECRET`
- Any additional supplier or admin secrets used by the edge functions

## Commands to run once the Supabase CLI is available

1. Link the local project to the new Supabase project.
2. Push the `phase1` migration.
3. Deploy the Edge Functions.
4. Set secrets for the new project.

## Quick verification checklist

- Create a test user account.
- Confirm sign in and sign out work.
- Confirm wallet load works for signed-in users.
- Confirm guest checkout initializes a Paystack payment.
- Confirm authenticated wallet checkout creates an order.
- Confirm order tracking returns a valid status.
- Confirm admin pages can load live data.

## Notes

- If the old project is abandoned, do not keep pointing the app at it.
- If any exposed secret was shared in chat or screenshots, rotate it before launch.
