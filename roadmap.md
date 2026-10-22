# Roadmap

## Sub-agent controls
- [x] Add confirmed deactivate/reactivate actions for parent-owned sub-agents; frontend awaits publishing.
- [x] Apply ownership checks and preserve administrator suspensions; rollback tests validate status changes, record preservation and store blocking.
- [ ] Verify the buttons in a signed-in parent session; authenticated browser checks are unavailable for the external backend.

## SMS (Vynfy)
- [x] Add purchase/delivery order IDs and agent store links to all four variants; test and deploy.
- [x] Wire only four order SMS notifications: paid purchase, delivered, MTN verified/delivered, MTN verified/on its way.
- [x] Use real bundle, purchase date/time and recipient records; secure the queue and prevent duplicates.
- [x] Deploy and validate wiring without sending customer SMS while sender approval is pending.
- [x] Switch sender to approved Datayego and send one sample to +233557375894 (provider accepted).
- [ ] Deploy updated sender/test allowlist to the external functions; external deployment credential is unavailable.
- [ ] Enable customer sending only after the owner confirms test receipt and explicitly requests activation.
