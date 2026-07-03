# YieGo Design Blueprint — v1 (Dashboard)

YieGo is a **premium digital-services platform for Ghana** — "your everyday digital plug."
20+ services (data, airtime, bills, crypto, gift cards…) plus **Paystack-style payment
tools and developer APIs**, all powered by one wallet.

The bar: **Paystack-level corporate quality.** Clean, restrained, expensive-feeling.
Never busy, never loud, never cheap. A developer should look at this and trust it with
their money; a market trader should find Buy Data in 2 seconds.

---

## 1. Brand & palette

From the logo: emerald green mark + deep ink lettering + tiny amber spark.

ALL colors come from tokens defined in `src/index.css` / mapped in `tailwind.config.ts`.
**Never hardcode hex/rgb/hsl colors in components** (only exception: `text-[hsl(30_90%_38%)]`
inside the existing amber Badge variant, and white/transparent overlays like `bg-white/10`
on dark surfaces).

| Token (tailwind class) | Role |
|---|---|
| `bg-background` | App background — near-white with a whisper of green |
| `bg-card` | White surfaces/cards |
| `bg-muted` / `text-muted-foreground` | Subtle fills / secondary text |
| `border-border` | 1px hairlines everywhere |
| `text-foreground` | Primary ink text |
| `bg-primary`, `hover:bg-primary-strong` | Brand emerald — main actions, active states |
| `bg-primary-soft`, `text-primary-strong` | Mint tint — icon chips, selected pills, subtle emphasis |
| `bg-ink`, `text-ink-foreground`, `bg-ink-soft` | Deep green-black — hero surfaces (balance card), dark accents |
| `bg-amber`, `bg-amber-soft` | Golden accent — "New" badges ONLY, tiny highlights. Use sparingly |
| `success`, `danger`, + `-soft` versions | Transaction states |

Rule of thumb: the dashboard is **white + soft neutrals**, green appears in **icons,
actions and one dark hero card**. Amber appears maybe twice on the whole page.

## 2. Typography

- Body/UI: **Inter** (`font-sans`, default) — 400/500/600/700/800
- Headings & big numbers: **Sora** (`font-display`) — 500/600/700/800
- Money amounts: always `tnum` utility class (tabular numbers), formatted via
  `formatGHS()` / `formatSigned()` from `@/lib/format`
- Scale (mobile-first): page sections use 15px semibold Sora titles (`CardTitle`);
  hero balance ~ `text-4xl`; body 14px; captions 12–13px; tile labels 11–12px
- Tracking: headings `tracking-tight`; ALL-CAPS eyebrows `text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground`

## 3. Shape, depth, spacing

- Radius: standard cards `rounded-2xl`; hero card `rounded-3xl`; buttons `rounded-xl`; pills/chips `rounded-full`; icon chips `rounded-xl`
- Elevation: `shadow-card` on white cards (already in `Card`); `shadow-lift` only on hover of clickable cards; `shadow-nav` for the bottom nav; `shadow-glow` under the dark hero card
- Cards = `Card` component (white, border, shadow) — don't reinvent
- Spacing rhythm: page padding `px-4` mobile / handled by shell on desktop; vertical gap between dashboard sections `gap-5` mobile, `gap-6` desktop; inside cards `p-4`→`p-5`
- Hairline borders everywhere; **no heavy shadows, no glassmorphism on light surfaces**

## 4. Motion

- Transitions: 150–200ms ease-out on hover/press; `active:scale-[0.97]` on all tappables (Button has it built in)
- Section entrances: `animate-fade-up` with staggered `style={{ animationDelay: "60ms" }}` (60ms steps, max ~360ms). Subtle — never bouncy
- Every interactive element MUST have visible hover (desktop) + press (mobile) feedback

## 5. Files that already exist (READ THEM before building)

- `src/index.css` — tokens + utilities (`no-scrollbar`, `tnum`, `pb-safe`)
- `tailwind.config.ts` — fonts, colors, shadows, animations
- `src/lib/utils.ts` — `cn()`
- `src/lib/format.ts` — `formatGHS`, `formatSigned`, `MASKED_BALANCE`
- `src/components/ui/button.tsx` — `Button` (variants: primary, dark, soft, outline, ghost, white, glass; sizes: sm, md, lg, icon, iconSm)
- `src/components/ui/card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardContent`
- `src/components/ui/badge.tsx` — `Badge` (neutral, mint, amber, dark, outline, success, danger)
- `src/data/services.ts` — `SERVICES` (24 services), `CATEGORIES`, types
- `src/data/mock.ts` — `MOCK_USER`, `MOCK_WALLET`, `MOCK_TRANSACTIONS`
- Public assets: `/yiego-logo.png` (full logo, for white surfaces), `/yiego-icon-192.png` (square mark)

## 6. App structure & layout blueprint

Routes (react-router v6): `/` = Dashboard (inside AppShell). `/services`, `/payments`,
`/wallet`, `/more` = ComingSoon page (inside AppShell). `*` → redirect `/`.

### Mobile (< lg) — THE priority
```
┌──────────────────────────────┐
│ TopBar: avatar+greeting  🔔  │  sticky, blur bg
├──────────────────────────────┤
│ BalanceCard (dark hero)      │
│ QuickActions (4 tiles)       │
│ ServicesSection              │
│   pills: All|Top-ups|...     │
│   grid of icon tiles (4 col) │
│ PaymentsPromo (business)     │
│ RecentActivity (list)        │
│ (bottom padding for nav)     │
├──────────────────────────────┤
│ BottomNav: Home Services     │  fixed, blur, safe-area
│   Payments Wallet More       │
└──────────────────────────────┘
```

### Desktop (lg+)
```
┌────────┬─────────────────────────────────┐
│Sidebar │ TopBar (title, search, bell,    │
│ 264px  │  avatar)                        │
│ fixed  ├─────────────────────────────────┤
│        │ content max-w-[1200px] mx-auto  │
│ logo   │ ┌───────────────┬─────────────┐ │
│ nav    │ │ BalanceCard   │ Payments    │ │
│ groups │ │ QuickActions  │ Promo       │ │
│        │ │ Services      │ Recent      │ │
│ user   │ │               │ Activity    │ │
│ card   │ └───────────────┴─────────────┘ │
└────────┴─────────────────────────────────┘
   main column 1fr · aside w-[360px] · gap-6
```

BottomNav hidden on lg+. Sidebar hidden below lg.

## 7. Component contracts (who builds what)

All dashboard components: **default export, zero required props, self-contained**
(import their own data from `@/data/*`). This lets them compose without coordination.

| File | Contract |
|---|---|
| `src/App.tsx` | Router + sonner `<Toaster position="top-center" />` + routes per §6 |
| `src/components/layout/AppShell.tsx` | Renders TopBar + Sidebar (lg+) + BottomNav (<lg) + `<Outlet />` in a scrollable main with correct padding (`pb-24` mobile for nav clearance; `lg:pl-[264px]`) |
| `src/components/layout/TopBar.tsx` | Mobile: avatar circle (initials, mint bg), "Good morning/afternoon/evening, {firstName} 👋" + date or "Verified" hint; bell icon-button with green dot. Desktop: page title "Overview", center search input (decorative, `bg-muted` pill, ⌘K hint), bell + avatar. Sticky top, `bg-background/80 backdrop-blur` + hairline bottom border |
| `src/components/layout/Sidebar.tsx` | Fixed left, white bg, right hairline. Top: `/yiego-logo.png` (h-8). Nav groups: MAIN (Overview→`/`, Wallet→`/wallet`, Transactions→`/wallet`), SERVICES (Top-ups & Bills, Crypto & Exchange, Digital & Tools, Education→ all `/services`), BUSINESS (Payment Links, Checkout Pages, Developer API→ all `/payments`). Item: icon+label, `rounded-xl`, active = `bg-primary-soft text-primary-strong font-semibold` via NavLink; inactive = `text-muted-foreground hover:bg-muted hover:text-foreground`. Bottom: mini user card (avatar, name, "Personal · Verified", settings icon) |
| `src/components/layout/BottomNav.tsx` | Fixed bottom, `bg-card/95 backdrop-blur shadow-nav` + top hairline + `pb-safe`. 5 items (NavLink): Home `/` (House), Services `/services` (LayoutGrid), Payments `/payments` (ArrowRightLeft), Wallet `/wallet` (Wallet), More `/more` (Menu). Item: icon 22px + 10px label; active = `text-primary` + small 4px dot or pill indicator; inactive `text-muted-foreground`. Height ~64px |
| `src/pages/Dashboard.tsx` | Composes: BalanceCard, QuickActions, ServicesSection, PaymentsPromo, RecentActivity. Mobile: single column `space-y-5`. Desktop: `lg:grid lg:grid-cols-[1fr_360px] lg:gap-6` — main: Balance, Quick, Services; aside: Promo, Activity. Staggered `animate-fade-up` per section |
| `src/components/dashboard/BalanceCard.tsx` | THE hero. `rounded-3xl bg-ink text-ink-foreground shadow-glow` + decorative: absolute mint radial glow top-right (`bg-primary/25 blur-3xl rounded-full`), maybe faint ring outline. Content: eyebrow "Wallet Balance" (white/60) + eye/eye-off toggle (useState, shows `MASKED_BALANCE`); balance `font-display text-4xl font-bold tnum tracking-tight`; caption row: mint Badge "GH₵ 12.50 cashback" (from mock) + "Instant MoMo & card top-ups" (white/50, text-xs); actions: `Button variant="white"` "Add Money" (Plus icon) + `Button variant="glass"` "Withdraw" (ArrowUpRight). Buttons toast "coming soon" (§8) |
| `src/components/dashboard/QuickActions.tsx` | 4 tiles `grid-cols-4 gap-3`: Buy Data (Wifi), Airtime (Smartphone), Electricity (Zap), TV Subs (Tv). Tile = white Card-style button, flex-col center `py-3.5 gap-2`: 40px icon chip `bg-primary-soft text-primary-strong rounded-xl` (icon 20px) + `text-xs font-medium`. Hover: `shadow-lift` + icon chip flips to `bg-primary text-white` (group-hover). Press scale. Toast on click |
| `src/components/dashboard/ServicesSection.tsx` | Header row: CardTitle "Services" + eyebrow-ish subtitle "24 services, one wallet" + "See all" link → `/services` (text-primary-strong text-[13px] font-semibold). Pills row (horizontal scroll, `no-scrollbar`): All + 5 category `short` labels; active pill `bg-ink text-white`; inactive `bg-card border border-border text-muted-foreground`. useState filter. Grid of ALL matching services: mobile `grid-cols-4 gap-x-2 gap-y-5`, sm 5, lg `grid-cols-5`, xl 6. Tile (button): 48px icon chip `bg-primary-soft text-primary-strong rounded-2xl` (icon 22px) + label `text-[11px] leading-tight font-medium text-center line-clamp-2`; badge dots: "new" → tiny amber dot top-right of chip, "popular" → tiny primary dot. Hover: chip `bg-primary text-white` transition. Toast on click. Wrap whole thing in `Card` with `CardContent` |
| `src/components/dashboard/PaymentsPromo.tsx` | Business/dev pillar card. White Card: eyebrow Badge mint "BUSINESS"; title font-display text-lg "Accept payments like a pro"; body text-sm muted "Create payment links, checkout pages, or plug the YieGo API into your product — start receiving money in minutes."; then a compact dark code block (`bg-ink rounded-xl p-3.5 font-mono text-[11px]` with 3 fake lines, green/white/amber syntax tints, e.g. `curl -X POST api.yiego.com/v1/links` …) — this is the developer-trust signal; feature row: 3 mini chips (Link2 "Payment links", LayoutPanelTop "Checkout pages", Code2 "Developer API") as `text-xs text-muted-foreground` with 14px icons; CTA row: `Button variant="primary" size="sm"` "Create payment link" + `Button variant="ghost" size="sm"` "API docs →". Toasts on click |
| `src/components/dashboard/RecentActivity.tsx` | Card. Header: "Recent Activity" + ghost "View all" (→ toast). List `divide-y divide-border`: rows `py-3` flex: 40px icon chip (`rounded-xl`; money-in rows `bg-success-soft text-primary-strong`, money-out `bg-muted text-foreground/70`; icon by tx type: data=Wifi, airtime=Smartphone, deposit=ArrowDownLeft, electricity=Zap, payment=Link2); middle: title `text-sm font-medium` + subtitle `text-xs text-muted-foreground`; right: `formatSigned(amount)` `tnum text-sm font-semibold` (`text-primary-strong` if >0 else `text-foreground`) + under it status: success → nothing, pending → `Badge variant="amber"` "Pending" tiny. Empty-state not needed |
| `src/pages/ComingSoon.tsx` | Centered: 56px icon chip mint (Hammer or Sparkles), font-display title "{Section} is coming soon" (title from route path map), muted body "We're building YieGo piece by piece — this section is next on the list.", `Button variant="soft"` "Back to Overview" → `/`. Vertically centered in viewport minus nav |

## 8. Interaction rules

- Not-yet-built actions: `import { toast } from "sonner"` →
  `toast("{Name} is coming soon", { description: "We're building YieGo service by service." })`
- All icon-only buttons need `aria-label`
- Touch targets ≥ 44px on mobile
- NavLink active detection: exact for `/`
- No `console.log`, no dead code, no TODO comments in final output

## 9. Code conventions

- TypeScript + Tailwind only. **No new dependencies** (installed & allowed: react-router-dom,
  lucide-react, sonner, class-variance-authority, clsx, tailwind-merge)
- Import alias `@/` for src
- Components: function components, default export for pages/layout/dashboard pieces,
  named exports for ui primitives (already done)
- Icons: `lucide-react`, default `strokeWidth` (2) at sizes 14–22px
- Copy tone: short, confident, human. "Add Money", "See all", "Get paid with a link" —
  no lorem ipsum, no exclamation marks
