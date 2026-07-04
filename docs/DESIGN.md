# YieGo Design Blueprint — "ONYX"

YieGo is a **premium digital-services platform for Ghana** — "your everyday digital plug."
20+ services (data, airtime, bills, crypto, gift cards…) from one wallet, **plus Paystack-style
payment tools and a developer API**. It must feel trustworthy enough for a developer to wire
money through, and approachable enough for a market trader to buy data in two taps.

**The design direction is ONYX: dark-first, luminous, exclusive.** Near-black canvas, emerald
light as the source, precise glass surfaces. Reference feel: Linear (dark) · Revolut Metal · Arc.
The bar is Awwwards / "a 10-billion-dollar designer made it." Never muddy, never gaudy, never cheap.

---

## 1. Palette (tokens only — never hardcode except white/black overlays on dark)

All colour lives in `src/index.css` `:root` and is mapped in `tailwind.config.ts`.

| Token / class | Role |
|---|---|
| `bg-background` `#080B0A` | Near-black canvas (green undertone) |
| `.onyx-panel` | Default elevated glass card surface |
| `bg-primary` `#22C387` | Emerald — main actions, active states |
| `text-primary-glow` `#7CF0B4` | Luminous lime — glows, active icons, links |
| `text-amber` `#F5B544` | **The ONLY second accent** — cashback, POPULAR, pending. Use sparingly |
| `text-foreground` / `text-muted-foreground` / `text-faint-foreground` | Light text tiers (faint ≥ 54% L for AA) |
| `text-success` `#3FDD9A` | Money-in amounts |

The dark **wallet card is the one resting splash of light**; keep other emerald glows (chart bars,
tiles) subtler so the wallet's "Add Money" CTA stays the single brightest object.

## 2. Typography

- Display / numerals: **Space Grotesk** (`font-display`) — balance, headings, monogram
- UI / body: **Manrope** (`font-sans`, default)
- Code / kbd: **IBM Plex Mono** (`font-mono`)
- Money always uses `tnum` (tabular). Uppercase micro-labels: `tracking-[0.18em]–[0.22em]`.

## 3. The `onyx-*` class system (READ src/index.css)

The visual language is a set of reusable `.onyx-*` classes in `src/index.css`, **inside
`@layer components`**. ⚠️ They MUST stay in that layer, or they override Tailwind utilities
(`hidden`, responsive variants) — a real bug we already hit and fixed. Key classes:
`onyx-canvas` + `onyx-aurora` (background light source), `onyx-panel`, `onyx-wallet` (+ `-sheen`
`-edge` `-mono`), `onyx-btn-primary`/`onyx-btn-ghost`, `onyx-tile` (+ `-icon` `-go` / `onyx-badge`),
`onyx-pill`(`-on`), `onyx-quick`(`-icon`, driven by a `--tint`), `onyx-dev` + `onyx-terminal`,
`onyx-txrow` + `onyx-tx-icon`, `onyx-navitem-on`, `onyx-bottomnav` + `onyx-bn-*`, `onyx-rise`
(entrance). Prefer these over reinventing surfaces.

## 4. Shape · depth · motion

- Radii: wallet/hero/dev `rounded-[26px]`, cards `rounded-[22px]`, tiles/quick `18px`, chips `12–14px`, pills/buttons round.
- Depth = layered inset highlight + soft shadow + emerald glow; never flat, never heavy black boxes.
- Motion: `onyx-rise` staggered section entrances (60ms steps); hover lifts `translateY(-2/3px)`;
  balance `useCountUp`; wallet hover sheen; animated flow bars. All respect `prefers-reduced-motion`.

## 5. Structure & files

- `components/layout/AppShell` — `onyx-canvas` + `AuroraBackground` + `Sidebar` (rail, lg+) + `BottomNav` (floating pill, mobile) + `TopBar` + `<Outlet/>`. Content `max-w-[1440px]`, `pb-32` mobile (clears nav).
- `components/layout/nav.ts` — the 5 nav items (Home/Services/Payments/Wallet/Account); shared by rail + bottom nav (NavLink active states).
- `pages/Dashboard` order: greeting → hero(`BalanceCard` + `FlowPanel`) → `QuickActions` → `ServicesSection` → (`DeveloperCard` + `RecentActivity`).
- Shared: `components/brand/Monogram`, `components/fx/AuroraBackground` + `GuillocheMesh` (canvas wallet texture), `hooks/useCountUp`.
- Data (mock, swap for backend later): `data/services.ts` (24 services + categories), `data/mock.ts` (user/wallet/transactions). Helpers: `lib/format` (`formatGHS`/`formatSigned`), `lib/toasts` (`comingSoonToast`), `lib/utils` (`cn`).
- ui primitives: `components/ui/button` (variants primary/ghost/soft/quiet), `card`, `badge`.

## 6. Rules

- No new dependencies. TypeScript + Tailwind + the `onyx-*` classes.
- Every tappable: real `<button>`/`<a>`, `aria-label` on icon-only, ≥44px touch target (use a `::before` hit-area on small pills), visible `:focus-visible` ring.
- Not-yet-built actions → `comingSoonToast(name)` from `@/lib/toasts`.
- Verify with the screenshot rig: `node scripts/screenshot.mjs <url> <out.png> <w> <h> [fullPage]` at 390 (mobile-first) and 1440. Keep tsc + `vite build` clean.
