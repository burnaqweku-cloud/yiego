# Roadmap

## SMS (Vynfy)
- [ ] Add purchase/delivery order IDs and agent store links to all four variants; test and deploy.
- [x] Wire only four order SMS notifications: paid purchase, delivered, MTN verified/delivered, MTN verified/on its way.
- [x] Use real bundle, purchase date/time and recipient records; secure the queue and prevent duplicates.
- [x] Deploy and validate wiring without sending customer SMS while sender approval is pending.
- [ ] Send test to 0536529090 after DataYego sender approval; only then enable customer sending.
