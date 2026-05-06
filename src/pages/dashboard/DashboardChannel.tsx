import { useState, useMemo } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import SEOHead from '@/components/seo/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Megaphone, BadgeCheck, Eye, Share2, Pin, Send, Plus, Image as ImageIcon,
  Loader2, Bell, BellOff, X, MessageCircle, Users, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * YieGo Channel — broadcast feed for official updates.
 *
 * Backend wiring (TODO): connect to Supabase tables `channel_posts`,
 * `channel_post_reactions`, `channel_post_views`. For now this uses
 * in-component mock state so the UI can be developed and reviewed.
 */

type Reaction = { emoji: string; count: number; reacted: boolean };

type Post = {
  id: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  imageUrl?: string;
  createdAt: number;
  views: number;
  reactions: Reaction[];
  pinned?: boolean;
};

const REACTION_PICKER = ['👍', '❤️', '🔥', '🎉', '👏', '🙌'];

const MOCK_POSTS: Post[] = [
  {
    id: 'p1',
    authorName: 'YieGo Team',
    content:
      "🎉 Welcome to the YieGo Channel — your official line to everything happening on the platform. New bundles, promos, downtime alerts, feature drops — you'll see them here first. Tap the bell to enable notifications.",
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
    views: 12480,
    reactions: [
      { emoji: '🎉', count: 412, reacted: true },
      { emoji: '❤️', count: 289, reacted: false },
      { emoji: '🔥', count: 134, reacted: false },
    ],
    pinned: true,
  },
  {
    id: 'p2',
    authorName: 'YieGo Team',
    content:
      "📊 New AirtelTigo 30-day bundle just dropped — 12GB for GHS 38. That's the cheapest 12GB you'll find in Ghana right now. Tap Buy Data and select AirtelTigo to grab it.",
    createdAt: Date.now() - 1000 * 60 * 60 * 22,
    views: 5640,
    reactions: [
      { emoji: '🔥', count: 156, reacted: false },
      { emoji: '👍', count: 88, reacted: false },
    ],
  },
  {
    id: 'p3',
    authorName: 'YieGo Team',
    content:
      "⚡ Brief maintenance window tonight 2:00 AM – 3:00 AM GMT. Wallet, data and core services stay online — only the agent dashboard will be unavailable for ~30 minutes. We'll post when it's done.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    views: 3210,
    reactions: [
      { emoji: '👍', count: 64, reacted: false },
    ],
  },
  {
    id: 'p4',
    authorName: 'YieGo Team',
    content:
      "🤝 To everyone asking — yes, Airtime top-ups are coming. We're aiming for early 2026, alongside Bills (ECG, water) and TV subscriptions. The wallet stays the same; you just unlock more services.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
    views: 8920,
    reactions: [
      { emoji: '🙌', count: 234, reacted: false },
      { emoji: '🎉', count: 178, reacted: false },
      { emoji: '❤️', count: 91, reacted: false },
    ],
  },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

const DashboardChannel = () => {
  const { isAdmin, isStaff } = useAuth();
  const canPost = !!(isAdmin || isStaff);

  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [posting, setPosting] = useState(false);
  const [subscribed, setSubscribed] = useState(true);

  const pinned = useMemo(() => posts.filter(p => p.pinned), [posts]);
  const regular = useMemo(
    () => posts.filter(p => !p.pinned).sort((a, b) => b.createdAt - a.createdAt),
    [posts]
  );

  const handleReact = (postId: string, emoji: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const existing = p.reactions.find(r => r.emoji === emoji);
      if (existing) {
        const next = p.reactions
          .map(r => r.emoji === emoji
            ? { ...r, reacted: !r.reacted, count: r.count + (r.reacted ? -1 : 1) }
            : r)
          .filter(r => r.count > 0);
        return { ...p, reactions: next };
      }
      return { ...p, reactions: [...p.reactions, { emoji, count: 1, reacted: true }] };
    }));
  };

  const handleShare = (post: Post) => {
    if (navigator.share) {
      navigator.share({ title: 'YieGo Channel', text: post.content }).catch(() => {});
    } else {
      navigator.clipboard.writeText(post.content);
      toast.success('Post copied');
    }
  };

  const handlePost = () => {
    const trimmed = composeText.trim();
    if (!trimmed) return;
    setPosting(true);
    setTimeout(() => {
      const newPost: Post = {
        id: `p${Date.now()}`,
        authorName: 'YieGo Team',
        content: trimmed,
        createdAt: Date.now(),
        views: 1,
        reactions: [],
      };
      setPosts(prev => [newPost, ...prev]);
      setComposeText('');
      setComposeOpen(false);
      setPosting(false);
      toast.success('Update posted');
    }, 600);
  };

  return (
    <DashboardLayout>
      <SEOHead title="Channel | YieGo" description="Official updates from the YieGo team." path="/dashboard/channel" noIndex />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-28 md:pb-8 max-w-3xl mx-auto space-y-5">
        {/* ── Channel hero ── */}
        <section className="relative overflow-hidden rounded-3xl glass-card p-5 sm:p-6">
          <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-primary/15 blur-3xl pointer-events-none glow-drift" />
          <div className="absolute -bottom-20 -left-12 w-52 h-52 rounded-full bg-accent/8 blur-3xl pointer-events-none glow-drift-slow" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent pointer-events-none" />
          <div className="noise-overlay" />

          <div className="relative">
            <div className="flex items-start gap-4">
              {/* Channel "logo" tile */}
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0">
                <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] p-[2px] shadow-[0_12px_28px_-8px_hsl(var(--primary)/0.55)]">
                  <span className="block w-full h-full rounded-2xl overflow-hidden bg-card flex items-center justify-center">
                    <Megaphone className="w-8 h-8 text-primary" strokeWidth={2} />
                  </span>
                </span>
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary ring-2 ring-card flex items-center justify-center">
                  <BadgeCheck className="w-3 h-3 text-primary-foreground" strokeWidth={2.5} />
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">Official channel</span>
                </div>
                <h1 className="text-xl sm:text-[1.6rem] font-display font-extrabold tracking-[-0.025em] leading-tight">
                  YieGo Channel
                </h1>
                <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">
                  Updates, drops, and announcements straight from the YieGo team.
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border border-border/70 bg-card/60 backdrop-blur-sm text-muted-foreground">
                    <Users className="w-3 h-3 text-primary" />
                    <span className="tabular font-bold text-foreground">47.2K</span> subscribers
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border border-border/70 bg-card/60 backdrop-blur-sm text-muted-foreground">
                    <Sparkles className="w-3 h-3 text-primary" />
                    <span className="tabular font-bold text-foreground">{posts.length}</span> posts
                  </span>
                </div>
              </div>
            </div>

            {/* Action row */}
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={() => setSubscribed(s => !s)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-full text-[13px] font-bold transition-all duration-200 active:scale-[0.98] ${
                  subscribed
                    ? 'bg-card border border-primary/30 text-primary hover:bg-primary/5'
                    : 'bg-primary text-primary-foreground shadow-[0_10px_24px_-10px_hsl(var(--primary)/0.55)] hover:-translate-y-0.5'
                }`}
              >
                {subscribed ? (
                  <><BellOff className="w-4 h-4" /> Subscribed</>
                ) : (
                  <><Bell className="w-4 h-4" /> Subscribe to updates</>
                )}
              </button>
              {canPost && (
                <button
                  onClick={() => setComposeOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full bg-primary text-primary-foreground text-[13px] font-bold shadow-[0_10px_24px_-10px_hsl(var(--primary)/0.55)] hover:-translate-y-0.5 transition-all"
                >
                  <Plus className="w-4 h-4" /> Post
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Compose drawer (admin only) ── */}
        {composeOpen && canPost && (
          <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.06] via-card to-card p-4 sm:p-5 space-y-3">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">New update</span>
              </div>
              <button
                onClick={() => { setComposeOpen(false); setComposeText(''); }}
                className="w-8 h-8 rounded-full hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close composer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              placeholder="Share an update with subscribers…"
              maxLength={4000}
              rows={4}
              className="w-full rounded-xl bg-muted/30 border border-border/60 p-3.5 text-[13.5px] leading-relaxed resize-none focus:bg-background focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => toast.info('Image uploads coming soon.')}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[11.5px] font-medium text-muted-foreground hover:border-primary/35 hover:text-foreground transition-all"
              >
                <ImageIcon className="w-3.5 h-3.5" /> Add image
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-muted-foreground/70 tabular">
                  {composeText.length}/4000
                </span>
                <Button
                  onClick={handlePost}
                  disabled={posting || !composeText.trim()}
                  className="h-9 px-4 rounded-full font-bold gap-1.5 text-[12.5px] shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.55)]"
                >
                  {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {posting ? 'Posting…' : 'Post update'}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* ── Pinned posts ── */}
        {pinned.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-1">
              <Pin className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Pinned</span>
            </div>
            <div className="space-y-3">
              {pinned.map(post => (
                <PostCard key={post.id} post={post} onReact={handleReact} onShare={handleShare} />
              ))}
            </div>
          </section>
        )}

        {/* ── Posts feed ── */}
        <section>
          {pinned.length > 0 && (
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Latest</span>
            </div>
          )}
          {regular.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {regular.map(post => (
                <PostCard key={post.id} post={post} onReact={handleReact} onShare={handleShare} />
              ))}
            </div>
          )}
        </section>

        {/* End cap */}
        <div className="text-center pt-2">
          <p className="text-[10.5px] text-muted-foreground/70">
            You're all caught up · Updates arrive in real-time
          </p>
        </div>

        <div aria-hidden className="h-2" />
      </div>
    </DashboardLayout>
  );
};

const PostCard = ({
  post,
  onReact,
  onShare,
}: {
  post: Post;
  onReact: (postId: string, emoji: string) => void;
  onShare: (post: Post) => void;
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <article className="group relative overflow-hidden rounded-3xl glass-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.25)]">
      {post.pinned && (
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent" />
      )}
      {post.pinned && (
        <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-primary/15 border border-primary/25 text-primary">
          <Pin className="w-2.5 h-2.5" /> Pinned
        </span>
      )}

      <div className="p-4 sm:p-5">
        {/* Author row */}
        <div className="flex items-center gap-3 mb-3.5">
          <div className="relative w-10 h-10 shrink-0">
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] p-[1.5px]">
              <span className="block w-full h-full rounded-full overflow-hidden bg-card flex items-center justify-center">
                <Megaphone className="w-4 h-4 text-primary" strokeWidth={2} />
              </span>
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary ring-2 ring-card flex items-center justify-center">
              <BadgeCheck className="w-2 h-2 text-primary-foreground" strokeWidth={3} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[13px] font-bold tracking-tight truncate">{post.authorName}</p>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/12 text-primary border border-primary/20">
                Official
              </span>
            </div>
            <p className="text-[10.5px] text-muted-foreground tabular mt-0.5">
              {relativeTime(post.createdAt)}
            </p>
          </div>
        </div>

        {/* Content */}
        <p className="text-[14px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
          {post.content}
        </p>

        {/* Image (if any) */}
        {post.imageUrl && (
          <div className="mt-3.5 rounded-2xl overflow-hidden border border-border/60">
            <img src={post.imageUrl} alt="" className="w-full h-auto object-cover" />
          </div>
        )}

        {/* Reactions row */}
        <div className="flex items-center gap-1.5 mt-4 flex-wrap">
          {post.reactions.map(r => (
            <button
              key={r.emoji}
              onClick={() => onReact(post.id, r.emoji)}
              className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-full border text-[12.5px] font-semibold tabular transition-all active:scale-95 ${
                r.reacted
                  ? 'bg-primary/12 border-primary/30 text-primary shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.35)]'
                  : 'bg-card/60 border-border/70 text-muted-foreground hover:border-primary/30 hover:text-foreground'
              }`}
            >
              <span className="text-[14px] leading-none">{r.emoji}</span>
              <span>{formatCount(r.count)}</span>
            </button>
          ))}
          {/* Add reaction button */}
          <div className="relative">
            <button
              onClick={() => setPickerOpen(o => !o)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-border/70 bg-card/60 text-muted-foreground hover:border-primary/35 hover:text-primary transition-all active:scale-95"
              aria-label="Add reaction"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 z-40 flex items-center gap-1 p-1.5 rounded-full bg-popover/95 backdrop-blur-xl border border-border/70 shadow-[0_18px_40px_-12px_hsl(var(--primary)/0.3)] animate-page-in">
                  {REACTION_PICKER.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => { onReact(post.id, emoji); setPickerOpen(false); }}
                      className="w-8 h-8 rounded-full text-[16px] hover:bg-primary/10 hover:scale-110 transition-all"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer: views + share */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground tabular">
            <Eye className="w-3 h-3" />
            <span className="font-bold text-foreground/80">{formatCount(post.views)}</span> views
          </span>
          <button
            onClick={() => onShare(post)}
            className="inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-semibold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <Share2 className="w-3 h-3" /> Share
          </button>
        </div>
      </div>
    </article>
  );
};

const EmptyState = () => (
  <div className="text-center py-16 max-w-md mx-auto">
    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 mx-auto mb-5 flex items-center justify-center shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.4)]">
      <MessageCircle className="w-7 h-7 text-primary" strokeWidth={1.8} />
    </div>
    <h3 className="font-display font-bold text-xl tracking-tight">No updates yet</h3>
    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
      Subscribe to be notified the moment the YieGo team posts something new.
    </p>
  </div>
);

export default DashboardChannel;
