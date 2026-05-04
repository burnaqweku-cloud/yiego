/**
 * CampaignBannerRenderer (Phase 2/3)
 * --------------------------------------------------
 * - Mounts globally; route-aware; skips sensitive routes.
 * - Picks best eligible banner using audience + advanced targeting rules.
 * - Display modes: popup | bottom_sheet | top_bar | inline.
 * - Frequency keyed by `banner.id:version` so admin can reset by bumping version.
 * - Light eligibility summary loaded once per session for logged-in users.
 * - Realtime: closes active banner if it becomes ineligible/disabled/archived.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type AudienceType =
  | 'all' | 'guests' | 'logged_in' | 'agents' | 'non_agents'
  | 'new_users' | 'returning_users' | 'no_orders' | 'with_orders'
  | 'wallet_low' | 'wallet_high' | 'sub_active' | 'sub_expired' | 'sub_expiring';
type FrequencyType = 'every_visit' | 'once_per_user' | 'once_per_day' | 'once_per_week' | 'max_views';
type DismissBehavior = 'never_again' | 'next_visit' | 'follow_frequency';
type TemplateType = 'promo' | 'service_update' | 'feature' | 'urgent' | 'image';
type DisplayMode = 'popup' | 'bottom_sheet' | 'top_bar' | 'inline';

interface TargetingRules {
  account_age_days_min?: number | null;
  account_age_days_max?: number | null;
  wallet_balance_min?: number | null;
  wallet_balance_max?: number | null;
  min_orders?: number | null;
  max_orders?: number | null;
}

interface CampaignBanner {
  id: string;
  title: string;
  message: string;
  template_type: TemplateType;
  image_url: string | null;
  primary_button_text: string | null;
  primary_button_url: string | null;
  secondary_button_text: string | null;
  secondary_button_url: string | null;
  audience_type: AudienceType;
  target_pages: string[] | unknown;
  is_enabled: boolean;
  start_at: string | null;
  end_at: string | null;
  frequency_type: FrequencyType;
  max_views_per_user: number | null;
  show_delay_seconds: number;
  dismiss_behavior: DismissBehavior;
  priority: number;
  display_mode?: DisplayMode | null;
  badge_text?: string | null;
  icon_type?: string | null;
  version?: number | null;
  targeting_rules?: TargetingRules | null;
  archived_at?: string | null;
}

interface EligibilitySummary {
  is_logged_in: boolean;
  is_active_agent?: boolean;
  is_expired_agent?: boolean;
  account_age_days?: number;
  total_orders?: number;
  has_orders?: boolean;
  wallet_balance?: number;
  subscription_expiring_soon?: boolean;
}

const ANON_KEY = 'ds_banner_anon_id';
const FREQ_KEY = 'ds_banner_freq_v2';

const BLOCKED_PREFIXES = [
  '/admin', '/auth', '/reset-password', '/paystack/callback',
  '/agent/subscription/callback', '/checkout', '/order-confirmation',
  '/reward-activation', '/reward', '/reward-unlocked',
  '/banned', '/maintenance', '/tg',
];

function freqKey(b: CampaignBanner): string {
  return `${b.id}:v${b.version ?? 1}`;
}

function getAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = `anon_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch { return 'anon_unknown'; }
}

type CacheEntry = { count: number; lastShown: number; dismissed?: boolean };
function readFreqCache(): Record<string, CacheEntry> {
  try { return JSON.parse(localStorage.getItem(FREQ_KEY) || '{}'); } catch { return {}; }
}
function writeFreqCache(cache: Record<string, CacheEntry>) {
  try { localStorage.setItem(FREQ_KEY, JSON.stringify(cache)); } catch { /* ignore */ }
}

function pageKeyFromPath(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'homepage';
  if (pathname.startsWith('/dashboard/buy') || pathname === '/buy-data') return 'buy_data';
  if (pathname.startsWith('/dashboard/wallet')) return 'wallet';
  if (pathname.startsWith('/dashboard/orders')) return 'orders';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/agent') || pathname.startsWith('/store/')) return 'agent';
  if (pathname.startsWith('/checkout')) return 'guest_checkout';
  return 'other';
}

function isWithinSchedule(b: CampaignBanner): boolean {
  const now = Date.now();
  if (b.start_at && new Date(b.start_at).getTime() > now) return false;
  if (b.end_at && new Date(b.end_at).getTime() < now) return false;
  return true;
}

function audienceMatches(b: CampaignBanner, isLoggedIn: boolean, summary: EligibilitySummary | null): boolean {
  switch (b.audience_type) {
    case 'all': return true;
    case 'guests': return !isLoggedIn;
    case 'logged_in': return isLoggedIn;
    case 'agents': return !!summary?.is_active_agent;
    case 'non_agents': return isLoggedIn && !summary?.is_active_agent;
    case 'new_users': {
      const max = b.targeting_rules?.account_age_days_max ?? 7;
      return isLoggedIn && (summary?.account_age_days ?? 9999) <= max;
    }
    case 'returning_users': {
      const min = b.targeting_rules?.account_age_days_min ?? 30;
      return isLoggedIn && (summary?.account_age_days ?? 0) >= min;
    }
    case 'no_orders': return isLoggedIn && (summary?.total_orders ?? 0) === 0;
    case 'with_orders': return isLoggedIn && (summary?.total_orders ?? 0) > 0;
    case 'wallet_low': {
      const max = b.targeting_rules?.wallet_balance_max ?? 5;
      return isLoggedIn && (summary?.wallet_balance ?? 0) < max;
    }
    case 'wallet_high': {
      const min = b.targeting_rules?.wallet_balance_min ?? 100;
      return isLoggedIn && (summary?.wallet_balance ?? 0) >= min;
    }
    case 'sub_active': return !!summary?.is_active_agent;
    case 'sub_expired': return !!summary?.is_expired_agent;
    case 'sub_expiring': return !!summary?.subscription_expiring_soon;
    default: return true;
  }
}

function targetingRulesMatch(b: CampaignBanner, isLoggedIn: boolean, summary: EligibilitySummary | null): boolean {
  const r = b.targeting_rules || {};
  if (!isLoggedIn) {
    // For guests, we can only honor rules if no logged-in-only rules apply
    if (r.min_orders || r.max_orders || r.wallet_balance_min || r.wallet_balance_max
        || r.account_age_days_min || r.account_age_days_max) {
      // If audience is guests/all, ignore advanced rules; otherwise block
      if (b.audience_type !== 'all' && b.audience_type !== 'guests') return false;
    }
    return true;
  }
  if (r.account_age_days_min != null && (summary?.account_age_days ?? 0) < r.account_age_days_min) return false;
  if (r.account_age_days_max != null && (summary?.account_age_days ?? 9999) > r.account_age_days_max) return false;
  if (r.min_orders != null && (summary?.total_orders ?? 0) < r.min_orders) return false;
  if (r.max_orders != null && (summary?.total_orders ?? 0) > r.max_orders) return false;
  if (r.wallet_balance_min != null && (summary?.wallet_balance ?? 0) < r.wallet_balance_min) return false;
  if (r.wallet_balance_max != null && (summary?.wallet_balance ?? 0) > r.wallet_balance_max) return false;
  return true;
}

function pageMatches(b: CampaignBanner, currentKey: string): boolean {
  const pages = Array.isArray(b.target_pages) ? (b.target_pages as string[]) : [];
  if (pages.length === 0) return true;
  if (pages.includes('all')) return true;
  return pages.includes(currentKey);
}

function frequencyAllows(b: CampaignBanner, cache: Record<string, CacheEntry>): boolean {
  const entry = cache[freqKey(b)];
  if (!entry) return true;
  if (entry.dismissed && b.dismiss_behavior === 'never_again') return false;
  const now = Date.now();
  switch (b.frequency_type) {
    case 'every_visit': return true;
    case 'once_per_user': return entry.count === 0;
    case 'once_per_day': return now - entry.lastShown > 86_400_000;
    case 'once_per_week': return now - entry.lastShown > 7 * 86_400_000;
    case 'max_views': return !b.max_views_per_user || entry.count < b.max_views_per_user;
    default: return true;
  }
}

const templateClasses = (t: TemplateType): string => {
  switch (t) {
    case 'urgent': return 'border-destructive/40 bg-gradient-to-br from-destructive/10 via-card to-card';
    case 'service_update': return 'border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-card to-card';
    case 'feature': return 'border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card';
    case 'image': return 'border-border bg-card';
    case 'promo':
    default: return 'border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card';
  }
};

interface RendererProps {
  previewBanner?: CampaignBanner;
  previewMode?: boolean;
}

export const CampaignBannerRenderer = ({ previewBanner, previewMode }: RendererProps = {}) => {
  const location = useLocation();
  const { user } = useAuth();
  const [banners, setBanners] = useState<CampaignBanner[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [summary, setSummary] = useState<EligibilitySummary | null>(null);
  const summaryLoaded = useRef(false);

  const blocked = useMemo(
    () => BLOCKED_PREFIXES.some((p) => location.pathname.startsWith(p)),
    [location.pathname]
  );

  // Load eligibility summary once per session for logged-in users
  useEffect(() => {
    if (previewMode || blocked) return;
    if (!user) { setSummary({ is_logged_in: false }); summaryLoaded.current = true; return; }
    if (summaryLoaded.current) return;
    summaryLoaded.current = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_banner_user_eligibility_summary' as any);
        setSummary((data as any) || { is_logged_in: true });
      } catch {
        setSummary({ is_logged_in: true });
      }
    })();
  }, [user, previewMode, blocked]);

  const refresh = useCallback(async () => {
    if (blocked || previewMode) return;
    const { data } = await supabase
      .from('campaign_banners')
      .select('*')
      .eq('is_enabled', true)
      .is('archived_at', null)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    setBanners((data || []) as unknown as CampaignBanner[]);
  }, [blocked, previewMode]);

  useEffect(() => {
    refresh();
    if (blocked || previewMode) return;
    const channel = supabase
      .channel('campaign-banners-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_banners' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh, blocked, previewMode]);

  const candidate = useMemo(() => {
    if (previewBanner) return previewBanner;
    if (blocked) return null;
    if (user && !summary) return null; // wait for summary
    const cache = readFreqCache();
    const pageKey = pageKeyFromPath(location.pathname);
    const isLoggedIn = !!user;
    return (
      banners.find(
        (b) =>
          b.is_enabled && !b.archived_at &&
          isWithinSchedule(b) &&
          audienceMatches(b, isLoggedIn, summary) &&
          targetingRulesMatch(b, isLoggedIn, summary) &&
          pageMatches(b, pageKey) &&
          frequencyAllows(b, cache)
      ) || null
    );
  }, [banners, blocked, location.pathname, user, previewBanner, summary]);

  useEffect(() => {
    setVisible(false);
    setActiveId(null);
    if (!candidate) return;

    const delay = previewMode ? 0 : Math.max(0, candidate.show_delay_seconds || 0) * 1000;
    const t = setTimeout(() => {
      setActiveId(candidate.id);
      setVisible(true);
      if (!previewMode) {
        const cache = readFreqCache();
        const k = freqKey(candidate);
        const entry = cache[k] || { count: 0, lastShown: 0 };
        entry.count += 1;
        entry.lastShown = Date.now();
        cache[k] = entry;
        writeFreqCache(cache);

        const anon = getAnonId();
        const deviceType = typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop';
        supabase.from('campaign_banner_events').insert({
          banner_id: candidate.id,
          user_id: user?.id ?? null,
          anonymous_id: user ? null : anon,
          event_type: 'viewed',
          page: pageKeyFromPath(location.pathname),
          device_type: deviceType,
        } as any).then(() => {});
      }
    }, delay);
    return () => clearTimeout(t);
  }, [candidate, previewMode, user, location.pathname]);

  useEffect(() => {
    if (!activeId) return;
    if (!banners.some((b) => b.id === activeId && b.is_enabled && !b.archived_at)) {
      if (!previewMode) setVisible(false);
    }
  }, [banners, activeId, previewMode]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    if (previewMode || !candidate) return;
    const cache = readFreqCache();
    const k = freqKey(candidate);
    const entry = cache[k] || { count: 0, lastShown: 0 };
    entry.dismissed = true;
    cache[k] = entry;
    writeFreqCache(cache);

    const anon = getAnonId();
    supabase.from('campaign_banner_events').insert({
      banner_id: candidate.id,
      user_id: user?.id ?? null,
      anonymous_id: user ? null : anon,
      event_type: 'dismissed',
      page: pageKeyFromPath(location.pathname),
    } as any).then(() => {});
  }, [candidate, previewMode, user, location.pathname]);

  const handleClick = useCallback(
    (url: string | null | undefined) => {
      if (!candidate) return;
      if (!previewMode) {
        const anon = getAnonId();
        supabase.from('campaign_banner_events').insert({
          banner_id: candidate.id,
          user_id: user?.id ?? null,
          anonymous_id: user ? null : anon,
          event_type: 'clicked',
          page: pageKeyFromPath(location.pathname),
        } as any).then(() => {});
        try { localStorage.setItem('ds_last_banner_click', candidate.id); } catch { /* ignore */ }
      }
      setVisible(false);
      if (url) {
        // Append campaign id for internal URLs
        let finalUrl = url;
        if (!previewMode && !/^https?:\/\//i.test(url)) {
          const sep = url.includes('?') ? '&' : '?';
          finalUrl = `${url}${sep}campaign_banner_id=${candidate.id}`;
        }
        if (/^https?:\/\//i.test(finalUrl)) {
          window.open(finalUrl, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = finalUrl;
        }
      }
    },
    [candidate, previewMode, user, location.pathname]
  );

  if (!visible || !candidate) return null;

  const mode: DisplayMode = (candidate.display_mode as DisplayMode) || 'popup';
  const tplClasses = templateClasses(candidate.template_type);

  // Body content (shared)
  const Body = (
    <>
      {candidate.image_url && candidate.template_type === 'image' && (
        <img src={candidate.image_url} alt="" className="w-full h-40 object-cover" loading="lazy" />
      )}
      <div className="p-5 sm:p-6">
        {candidate.badge_text && (
          <span className="inline-block mb-2 px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-primary/15 text-primary">
            {candidate.badge_text}
          </span>
        )}
        <h3 className="font-display font-bold text-lg sm:text-xl text-foreground pr-8">
          {candidate.title}
        </h3>
        {candidate.message && (
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line break-words">
            {candidate.message}
          </p>
        )}
        {(candidate.primary_button_text || candidate.secondary_button_text) && (
          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            {candidate.primary_button_text && (
              <Button className="flex-1" onClick={() => handleClick(candidate.primary_button_url)}>
                {candidate.primary_button_text}
              </Button>
            )}
            {candidate.secondary_button_text && (
              <Button variant="outline" className="flex-1" onClick={() => handleClick(candidate.secondary_button_url)}>
                {candidate.secondary_button_text}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );

  const closeBtn = (
    <button
      aria-label="Close"
      onClick={handleDismiss}
      className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 hover:bg-background text-foreground/70 hover:text-foreground transition-colors z-10"
    >
      <X className="w-4 h-4" />
    </button>
  );

  // Inline preview mode for admin
  if (previewMode || mode === 'inline') {
    return (
      <div className="relative w-full flex items-center justify-center p-4">
        <div className={`relative w-full max-w-md rounded-2xl border shadow-xl overflow-hidden ${tplClasses}`}>
          {closeBtn}
          {Body}
        </div>
      </div>
    );
  }

  if (mode === 'top_bar') {
    return (
      <div className="fixed top-0 inset-x-0 z-[80] animate-in slide-in-from-top duration-200">
        <div className={`relative border-b shadow-sm ${tplClasses}`}>
          <button
            aria-label="Close"
            onClick={handleDismiss}
            className="absolute top-2 right-2 p-1 rounded-full bg-background/60 hover:bg-background text-foreground/70 z-10"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="max-w-4xl mx-auto px-4 py-2.5 pr-10 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {candidate.badge_text && (
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-primary/15 text-primary">
                {candidate.badge_text}
              </span>
            )}
            <strong className="text-sm text-foreground">{candidate.title}</strong>
            {candidate.message && (
              <span className="text-xs text-muted-foreground line-clamp-1">{candidate.message}</span>
            )}
            {candidate.primary_button_text && (
              <Button size="sm" className="h-7 ml-auto" onClick={() => handleClick(candidate.primary_button_url)}>
                {candidate.primary_button_text}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'bottom_sheet') {
    return (
      <div
        className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleDismiss}
        role="dialog"
        aria-modal="true"
      >
        <div
          className={`relative w-full max-w-lg rounded-t-2xl border-t border-x shadow-xl overflow-hidden ${tplClasses} animate-in slide-in-from-bottom duration-200`}
          onClick={(e) => e.stopPropagation()}
        >
          {closeBtn}
          {Body}
        </div>
      </div>
    );
  }

  // popup (default)
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-md rounded-2xl border shadow-xl overflow-hidden ${tplClasses} animate-in zoom-in-95 slide-in-from-bottom-4 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {closeBtn}
        {Body}
      </div>
    </div>
  );
};

export default CampaignBannerRenderer;
