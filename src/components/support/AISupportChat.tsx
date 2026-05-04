import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Loader2, X, AlertCircle, MessageCircle, ExternalLink, Paperclip, LifeBuoy, ArrowLeft, Clock, CheckCircle, Info, Search, ChevronRight, MessageSquare, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { useLocation } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';

interface ChatMessage {
  messageId?: string;
  role: 'user' | 'assistant' | 'system_update' | 'admin' | 'system_event';
  content: string;
  timestamp: number;
  imageUrl?: string;
  adminName?: string;
  eventType?: 'admin_joined' | 'admin_left';
  eventKey?: string; // dedup key for system events
}

interface AISupportChatProps {
  context?: {
    page?: string;
    orderId?: string;
    username?: string;
    email?: string;
    userType?: 'guest' | 'user' | 'agent';
  };
}

interface UserTicket {
  id: string;
  ticket_number: number;
  ticket_code: string | null;
  status: string;
  issue_type: string;
  created_at: string;
  updated_at: string;
  resolution_message: string | null;
  resolution_code: string | null;
  user_notified: boolean;
  ticket_metadata: any;
  customer_phone: string | null;
}

type ViewMode = 'chat' | 'hub' | 'ticket_detail' | 'track' | 'guest_name';

const STORAGE_KEY = 'datasika_ai_chat';
const SESSION_ID_KEY = 'datasika_ai_session_id';
const TICKET_STORAGE_KEY = 'datasika_ai_tickets';
const INJECTED_UPDATES_KEY = 'datasika_ai_injected_updates';
const GUEST_NAME_KEY = 'datasika_guest_name';
// Per-session limit removed — daily/weekly limits are enforced server-side.
const COOLDOWN_MS = 1500;
const GREETING = "Hi there! 👋 I'm DataSika's support assistant. I can help you with order status, payment issues, or any questions about our data bundle services.\n\nHow can I help you today?";
const TICKET_POLL_MS = 30_000;
// 7-day persistence window — keeps conversation continuity for admin monitoring
// and prevents premature session splits / chat history loss.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_ID_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (Date.now() - (parsed.ts || 0) < SESSION_TTL_MS) {
        // Refresh timestamp on every access so the 7-day window is rolling, not fixed.
        try { localStorage.setItem(SESSION_ID_KEY, JSON.stringify({ id: parsed.id, ts: Date.now() })); } catch {}
        return parsed.id;
      }
    }
  } catch {}
  const id = `web-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  try { localStorage.setItem(SESSION_ID_KEY, JSON.stringify({ id, ts: Date.now() })); } catch {}
  return id;
}

const ISSUE_LABELS: Record<string, string> = {
  order_not_created: 'Order Not Created',
  deposit_not_reflected: 'Deposit Not Reflected',
  order_not_delivered: 'Order Issue',
  account_issue: 'Account / Access',
  other: 'Other',
};

const STATUS_STYLE: Record<string, { label: string; className: string; description: string }> = {
  new: { label: 'Open', className: 'bg-sky-500/10 text-sky-600', description: 'Your request has been received' },
  in_progress: { label: 'In Progress', className: 'bg-amber-500/10 text-amber-600', description: 'We are working on your request' },
  resolved: { label: 'Resolved', className: 'bg-emerald-500/10 text-emerald-600', description: 'Your issue has been handled' },
  closed: { label: 'Resolved', className: 'bg-emerald-500/10 text-emerald-600', description: 'Your issue has been resolved' },
};

function sortChatMessages(messages: ChatMessage[]) {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp);
}

function isSameChatMessage(existing: ChatMessage, incoming: ChatMessage) {
  if (existing.messageId && incoming.messageId) return existing.messageId === incoming.messageId;
  if (existing.role !== incoming.role) return false;
  if (existing.eventKey && incoming.eventKey) return existing.eventKey === incoming.eventKey;

  return (
    existing.content === incoming.content &&
    existing.adminName === incoming.adminName &&
    Math.abs(existing.timestamp - incoming.timestamp) < 5000
  );
}

function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  let changed = false;
  const merged = [...existing];

  for (const message of incoming) {
    if (!merged.some((item) => isSameChatMessage(item, message))) {
      merged.push(message);
      changed = true;
    }
  }

  return changed ? sortChatMessages(merged) : existing;
}

function mapConversationMessage(message: any): ChatMessage | null {
  if (!message?.role) return null;

  const timestamp = new Date(message.created_at || Date.now()).getTime();

  if (message.role === 'user') {
    return {
      messageId: message.id,
      role: 'user',
      content: message.content,
      timestamp,
      imageUrl: message.image_url && message.image_url !== 'evidence_attached' ? message.image_url : undefined,
    };
  }

  if (message.role === 'assistant') {
    return {
      messageId: message.id,
      role: 'assistant',
      content: message.content,
      timestamp,
      imageUrl: message.image_url && message.image_url !== 'evidence_attached' ? message.image_url : undefined,
    };
  }

  if (message.role === 'admin') {
    return {
      messageId: message.id,
      role: 'admin',
      content: message.content,
      timestamp,
      adminName: message.admin_name || 'Admin',
    };
  }

  if (message.role === 'system' && (message.event_type === 'admin_joined' || message.event_type === 'admin_left')) {
    const adminName = message.admin_name || 'Admin';
    return {
      messageId: message.id,
      role: 'system_event',
      content: message.event_type === 'admin_joined'
        ? `${adminName} joined the conversation`
        : `${adminName} left — AI assistant resumed`,
      timestamp,
      eventType: message.event_type,
      eventKey: `${message.event_type}:${message.id || message.created_at}`,
      adminName,
    };
  }

  return null;
}

function loadPersistedMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    // Match SESSION_TTL_MS (7 days) — chat history persists in lockstep with session id.
    if (Date.now() - (data.ts || 0) > SESSION_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return data.messages || [];
  } catch { return []; }
}

function persistMessages(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, ts: Date.now() }));
  } catch {}
}

function getSeenTicketUpdates(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TICKET_STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function markTicketSeen(ticketKey: string, updatedAt: string) {
  try {
    const seen = getSeenTicketUpdates();
    seen[ticketKey] = updatedAt;
    localStorage.setItem(TICKET_STORAGE_KEY, JSON.stringify(seen));
  } catch {}
}

function getInjectedUpdates(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(INJECTED_UPDATES_KEY) || '{}');
  } catch { return {}; }
}

function markUpdateInjected(key: string) {
  try {
    const injected = getInjectedUpdates();
    injected[key] = new Date().toISOString();
    localStorage.setItem(INJECTED_UPDATES_KEY, JSON.stringify(injected));
  } catch {}
}

function getGuestName(): string {
  try { return localStorage.getItem(GUEST_NAME_KEY) || ''; } catch { return ''; }
}
function setGuestName(name: string) {
  try { localStorage.setItem(GUEST_NAME_KEY, name); } catch {}
}

let scrollLockCount = 0;
let savedScrollY = 0;

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    savedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount++;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.overflow = '';
    window.scrollTo(0, savedScrollY);
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const AISupportChat = ({ context }: AISupportChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [lastSentAt, setLastSentAt] = useState(0);
  const [sessionMsgCount, setSessionMsgCount] = useState(0);
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasTicketUpdate, setHasTicketUpdate] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationSyncReady, setConversationSyncReady] = useState(false);
  const [isAdminHandling, setIsAdminHandling] = useState(false);
  const [adminHandlerName, setAdminHandlerName] = useState<string | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionChannelRef = useRef<any>(null);
  const typingChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const location = useLocation();

  // Support Hub state
  const [view, setView] = useState<ViewMode>('chat');
  const [userTickets, setUserTickets] = useState<UserTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<UserTicket | null>(null);
  const [trackInput, setTrackInput] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);

  // Guest name
  const [guestName, setGuestNameState] = useState(getGuestName());
  const [guestNameInput, setGuestNameInput] = useState('');

  const isLoggedIn = context?.userType === 'user' || context?.userType === 'agent';
  const isGuest = !isLoggedIn;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /* ── Identity-change guard (R12 name truth-lock) ──
   * When the authenticated user identity (email/username) changes — e.g. a
   * different customer signs in on the same device, or user logs out and a
   * new user logs in — wipe stale chat history, session id, guest name, and
   * cached conversation state so no previous customer's name or context
   * can leak into the new user's session.
   */
  const lastIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    const identity = context?.userType === 'user' || context?.userType === 'agent'
      ? `auth:${(context?.email || context?.username || '').toLowerCase().trim()}`
      : 'guest';
    if (lastIdentityRef.current === null) {
      lastIdentityRef.current = identity;
      return;
    }
    if (lastIdentityRef.current !== identity) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
        localStorage.removeItem(GUEST_NAME_KEY);
        localStorage.removeItem(INJECTED_UPDATES_KEY);
      } catch {}
      setMessages([]);
      setGuestNameState('');
      setConversationId(null);
      setIsAdminHandling(false);
      setAdminHandlerName(null);
      lastIdentityRef.current = identity;
    }
  }, [context?.email, context?.username, context?.userType]);

  const syncConversationState = useCallback((conversation: { id?: string | null; handled_by?: string | null; admin_handler_name?: string | null } | null) => {
    if (!conversation) return;
    if (conversation.id) setConversationId(conversation.id);

    const adminActive = conversation.handled_by === 'admin';
    setIsAdminHandling(adminActive);
    setAdminHandlerName(adminActive ? (conversation.admin_handler_name || 'Support Admin') : null);
  }, []);

  const appendChatMessages = useCallback((incoming: ChatMessage | ChatMessage[]) => {
    const batch = (Array.isArray(incoming) ? incoming : [incoming]).filter(Boolean);
    if (batch.length === 0) return;

    setMessages((prev) => {
      const merged = mergeChatMessages(prev, batch);
      if (merged !== prev) persistMessages(merged);
      return merged;
    });
  }, []);

  const hasChatMessage = useCallback((incoming: ChatMessage) => {
    return messagesRef.current.some((message) => isSameChatMessage(message, incoming));
  }, []);

  const hydrateConversation = useCallback(async () => {
    try {
      const { data, error: syncError } = await supabase.functions.invoke('support-conversation-sync', {
        body: {
          sessionId,
          email: context?.email || null,
          userType: context?.userType || 'guest',
        },
      });

      if (syncError) throw syncError;
      if (!data?.conversation) return;

      syncConversationState(data.conversation);

      const syncedMessages = (data.messages || [])
        .map((message: any) => mapConversationMessage(message))
        .filter(Boolean) as ChatMessage[];

      if (syncedMessages.length > 0) appendChatMessages(syncedMessages);
    } catch (err) {
      console.error('Failed to sync support conversation:', err);
    }
  }, [appendChatMessages, context?.email, context?.userType, sessionId, syncConversationState]);

  /* ── Scroll-aware fade for floating button (smoother, more fitted) ── */
  useEffect(() => {
    if (isOpen) return;
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const dy = Math.abs(window.scrollY - lastY);
        lastY = window.scrollY;
        if (dy > 2) setIsScrolling(true);
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 1100);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [isOpen]);

  const userMsgCount = messages.filter(m => m.role === 'user').length;

  /* ── Auto-scroll to latest message (also runs when chat opens / view switches to chat) ── */
  useEffect(() => {
    if (!scrollRef.current) return;
    // Use rAF to wait for layout, then jump to bottom (no smooth on first render to avoid jank).
    const el = scrollRef.current;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, isLoading, isOpen, view]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await hydrateConversation();
      if (!cancelled) setConversationSyncReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateConversation]);

  useEffect(() => {
    if (isOpen) hydrateConversation();
  }, [hydrateConversation, isOpen]);

  /* ── Safety net: re-hydrate on tab focus + periodic poll while chat is open ──
     This covers the rare case where a realtime broadcast was missed
     (e.g. transient network blip, channel not yet SUBSCRIBED on admin side).
     Cost is tiny: one edge-function call every 20s only when chat is visible. */
  useEffect(() => {
    if (!isOpen) return;
    const onFocus = () => hydrateConversation();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') hydrateConversation();
    }, 20_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(interval);
    };
  }, [hydrateConversation, isOpen]);

  /* ── Load persisted messages on first open ── */
  useEffect(() => {
    if (!isOpen || messages.length > 0) return;

    const persisted = loadPersistedMessages();
    if (persisted.length > 0) {
      setMessages(persisted);
      setSessionMsgCount(persisted.filter(m => m.role === 'user').length);
      return;
    }

    if (!conversationSyncReady) return;

    if (isGuest && !guestName) {
      setView('guest_name');
      return;
    }

    setMessages([{ role: 'assistant', content: GREETING, timestamp: Date.now() }]);
  }, [conversationSyncReady, guestName, isGuest, isOpen, messages.length]);

  /* ── Persist messages ── */
  useEffect(() => {
    if (messages.length > 0) persistMessages(messages);
  }, [messages]);

  /* ── Ticket update polling — injects system_update messages into chat ── */
  const checkTicketUpdates = useCallback(async () => {
    if (!context?.email) return;
    try {
      const { data } = await (supabase.from('admin_support_tickets') as any)
        .select('ticket_number, ticket_code, status, resolution_code, resolution_message, user_notified, updated_at, issue_type, manager_review, ticket_metadata')
        .contains('ticket_metadata', { source: 'ai_assistant' })
        .eq('customer_email', context.email.toLowerCase())
        .in('status', ['resolved', 'in_progress', 'closed'])
        .order('updated_at', { ascending: false })
        .limit(10);

      if (!data || data.length === 0) return;

      const injected = getInjectedUpdates();
      let newUnread = 0;

      for (const ticket of data) {
        const ticketCode = ticket.ticket_code || `#${ticket.ticket_number}`;
        const meta = ticket.ticket_metadata || {};
        const userName = meta.guest_name || context?.username || '';

        // Build a unique key per update event
        const updateKey = `${ticketCode}:${ticket.status}:${ticket.updated_at}`;
        if (injected[updateKey]) continue;

        let updateMessage: string | null = null;
        const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
        const isGuest = context?.userType === 'guest' || !context?.userType;
        const namePrefix = userName ? `${userName}, ` : '';

        // RESOLVED / CLOSED
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
          if (ticket.resolution_message) {
            const issueType = (ticket.issue_type || '').toLowerCase();
            let body = ticket.resolution_message;

            // Build a dynamic wrapper around the admin resolution message
            const resolvedIntros: string[] = issueType.includes('order_not_created') || issueType.includes('order not created')
              ? [
                  `${namePrefix}good news — your order has now been created and processed.`,
                  `${namePrefix}we've sorted this out. The order has been created successfully.`,
                  `${namePrefix}this has been resolved — the order went through and is all set.`,
                  `${namePrefix}your order is now created and on its way. All sorted!`,
                ]
              : issueType.includes('deposit') || issueType.includes('wallet')
              ? [
                  `${namePrefix}your deposit has been confirmed and your wallet updated.`,
                  `${namePrefix}we've fixed this — your wallet balance is now correct.`,
                  `${namePrefix}sorted! The deposit is reflected in your wallet now.`,
                  `${namePrefix}this has been resolved — your wallet has been credited.`,
                ]
              : issueType.includes('delay') || issueType.includes('delivery')
              ? [
                  `${namePrefix}your order has now been completed successfully.`,
                  `${namePrefix}the delivery has gone through — all done on our end.`,
                  `${namePrefix}this is sorted now. Your data has been delivered.`,
                  `${namePrefix}good news — delivery is confirmed and complete.`,
                ]
              : [
                  `${namePrefix}this has been resolved.`,
                  `${namePrefix}we've taken care of this for you.`,
                  `${namePrefix}all sorted on our end!`,
                  `${namePrefix}this is now resolved — you're good to go.`,
                ];

            const dynamicBody = pick(resolvedIntros);
            // If admin left a custom resolution message that differs from generic, append it
            const adminNote = body && body.length > 5 && !resolvedIntros.some(i => i.includes(body)) ? `\n\n${body}` : '';
            const guestNudge = isGuest ? pick([
              '\n\nBy the way, creating an account makes it easier to track orders next time.',
              '\n\nTip: with a free account you can track all your orders in one place.',
              '\n\nYou might want to sign up so tracking is easier next time around.',
            ]) : '';

            updateMessage = `🔔 **Update on your ticket (${ticketCode})**\n\n${dynamicBody}${adminNote}${guestNudge}`;
          }
        }

        // MANAGER REVIEW
        if (ticket.manager_review && ticket.status === 'in_progress') {
          const managerKey = `${ticketCode}:manager_review`;
          if (!injected[managerKey]) {
            const managerMsg = pick([
              `${namePrefix}your issue needs a closer look from our senior team. It may take a bit longer, but we're on it.`,
              `${namePrefix}we've escalated this for further review. Hang tight — our team is working on it.`,
              `${namePrefix}this one requires extra attention, so we've passed it to a senior. We'll get back to you soon.`,
              `${namePrefix}just a heads up — your case has been escalated for a more thorough review. We'll update you shortly.`,
            ]);
            updateMessage = `🔔 **Update on your ticket (${ticketCode})**\n\n${managerMsg}`;
            markUpdateInjected(managerKey);
          }
        }

        // MORE DETAILS NEEDED
        if (ticket.resolution_code === 'more_details_required' && ticket.status === 'in_progress') {
          const detailsKey = `${ticketCode}:more_details:${ticket.updated_at}`;
          if (!injected[detailsKey]) {
            const adminMsg = ticket.resolution_message || 'Please provide more details so we can help you.';
            const detailIntro = pick([
              `${namePrefix}we need a bit more info to move forward:`,
              `${namePrefix}to continue working on this, we'll need some extra details:`,
              `${namePrefix}could you help us with a few more details?`,
            ]);
            updateMessage = `🔔 **Update on your ticket (${ticketCode})**\n\n${detailIntro}\n\n${adminMsg}`;
            markUpdateInjected(detailsKey);
          }
        }

        if (updateMessage) {
          markUpdateInjected(updateKey);
          newUnread++;

          // Inject into chat as system_update message (no chat reset)
          setMessages(prev => {
            // Prevent duplicate injection in same render
            const alreadyHas = prev.some(m => m.role === 'system_update' && m.content === updateMessage);
            if (alreadyHas) return prev;
            const updated = [...prev, { role: 'system_update' as const, content: updateMessage!, timestamp: Date.now() }];
            persistMessages(updated);
            return updated;
          });
        }

        // Mark seen for hub dot indicator
        markTicketSeen(ticketCode, ticket.updated_at);
      }

      if (!isOpen && newUnread > 0) {
        setUnreadCount(prev => prev + newUnread);
      }
      if (newUnread > 0) {
        setHasTicketUpdate(true);
      }
    } catch (err) {
      console.error('Ticket poll error:', err);
    }
  }, [context?.email, context?.username, isOpen]);

  useEffect(() => {
    if (!context?.email) return;
    checkTicketUpdates();
    pollTimerRef.current = setInterval(checkTicketUpdates, TICKET_POLL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [checkTicketUpdates, context?.email]);

  useEffect(() => {
    const channel = supabase
      .channel(`support-session-${sessionId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'admin_message' }, (payload: any) => {
        const mapped = mapConversationMessage(payload.payload?.message);
        if (!mapped) return;

        syncConversationState({
          id: payload.payload?.conversationId || null,
          handled_by: 'admin',
          admin_handler_name: payload.payload?.adminName || mapped.adminName || 'Admin',
        });

        const alreadyExists = hasChatMessage(mapped);
        appendChatMessages(mapped);
        setAdminTyping(false);
        if (!alreadyExists && !isOpen) setUnreadCount((count) => count + 1);
      })
      .on('broadcast', { event: 'admin_joined' }, (payload: any) => {
        syncConversationState({
          id: payload.payload?.conversationId || null,
          handled_by: 'admin',
          admin_handler_name: payload.payload?.adminName || 'Admin',
        });

        const mapped = mapConversationMessage(payload.payload?.message);
        if (mapped) {
          const alreadyExists = hasChatMessage(mapped);
          appendChatMessages(mapped);
          if (!alreadyExists && !isOpen) setUnreadCount((count) => count + 1);
        } else {
          hydrateConversation();
        }
      })
      .on('broadcast', { event: 'admin_left' }, (payload: any) => {
        syncConversationState({
          id: payload.payload?.conversationId || null,
          handled_by: 'ai',
          admin_handler_name: null,
        });

        const mapped = mapConversationMessage(payload.payload?.message);
        if (mapped) {
          const alreadyExists = hasChatMessage(mapped);
          appendChatMessages(mapped);
          if (!alreadyExists && !isOpen) setUnreadCount((count) => count + 1);
        } else {
          hydrateConversation();
        }
      })
      .on('broadcast', { event: 'conversation_state' }, () => {
        hydrateConversation();
      })
      .subscribe();

    sessionChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      sessionChannelRef.current = null;
    };
  }, [appendChatMessages, hasChatMessage, hydrateConversation, isOpen, sessionId, syncConversationState]);

  /* ── Realtime: admin messages, system events (join/leave chips), typing broadcast ── */
  useEffect(() => {
    if (!conversationId) return;

    // Postgres changes channel — admin messages + system events + conversation state
    const dbChannel = supabase
      .channel(`admin-msgs-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_conversation_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload: any) => {
        const msg = payload.new;
        const mapped = mapConversationMessage(msg);
        if (!mapped) return;

        const alreadyExists = hasChatMessage(mapped);
        appendChatMessages(mapped);

        if (msg.role === 'admin') {
          setAdminTyping(false);
        }

        if (msg.role === 'system' && (msg.event_type === 'admin_joined' || msg.event_type === 'admin_left')) {
          syncConversationState({
            id: msg.conversation_id || conversationId,
            handled_by: msg.event_type === 'admin_joined' ? 'admin' : 'ai',
            admin_handler_name: msg.event_type === 'admin_joined' ? (msg.admin_name || 'Admin') : null,
          });
        }

        if (!alreadyExists && !isOpen && (mapped.role === 'admin' || mapped.role === 'system_event')) {
          setUnreadCount((count) => count + 1);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'ai_conversations',
        filter: `id=eq.${conversationId}`,
      }, (payload: any) => {
        syncConversationState(payload.new);
      })
      .subscribe();

    // Realtime broadcast channel — typing indicators (bi-directional, ephemeral)
    const typingChannel = supabase
      .channel(`typing-${conversationId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'admin_typing' }, (payload: any) => {
        if (payload.payload?.typing) {
          setAdminTyping(true);
          if (adminTypingTimeoutRef.current) clearTimeout(adminTypingTimeoutRef.current);
          adminTypingTimeoutRef.current = setTimeout(() => setAdminTyping(false), 4000);
        } else {
          setAdminTyping(false);
        }
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
      if (adminTypingTimeoutRef.current) clearTimeout(adminTypingTimeoutRef.current);
    };
  }, [appendChatMessages, conversationId, hasChatMessage, isOpen, syncConversationState]);

  useEffect(() => {
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  /* ── Body scroll lock + WhatsApp hide when open ── */
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
      document.body.classList.add('modal-open-wa-hide');
    } else {
      unlockBodyScroll();
      document.body.classList.remove('modal-open-wa-hide');
      if (pendingImage) {
        URL.revokeObjectURL(pendingImage.preview);
        setPendingImage(null);
      }
    }
    return () => {
      if (isOpen) {
        unlockBodyScroll();
        document.body.classList.remove('modal-open-wa-hide');
      }
    };
  }, [isOpen]);

  /* ── Focus input when opened ── */
  useEffect(() => {
    if (isOpen && view === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, view]);

  /* ── Hide when modals open ── */
  const [hiddenByModal, setHiddenByModal] = useState(false);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const hidden = document.body.classList.contains('modal-open-wa-hide');
      if (!isOpen) setHiddenByModal(hidden);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [isOpen]);

  const path = location.pathname;
  const isHiddenPage = path.startsWith('/admin');

  /* ── Image selection ── */
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      return;
    }
    const preview = URL.createObjectURL(file);
    setPendingImage({ file, preview });
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const clearPendingImage = useCallback(() => {
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.preview);
      setPendingImage(null);
    }
  }, [pendingImage]);

  /* ── Build enriched context with guest name ── */
  const getEnrichedContext = useCallback(() => {
    const enriched = { ...context };
    if (isGuest && guestName) {
      (enriched as any).guestName = guestName;
    }
    return enriched;
  }, [context, isGuest, guestName]);

  /* ── Send message ── */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const hasImage = !!pendingImage;
    if (!text && !hasImage) return;
    if (isLoading) return;

    const now = Date.now();
    if (now - lastSentAt < COOLDOWN_MS) {
      setError('Please wait a moment before sending another message.');
      return;
    }
    // Per-session limits removed — daily/weekly enforcement happens server-side.


    setInput('');
    setError(null);
    setLastSentAt(now);

    let imageBase64: string | undefined;
    let imagePreviewUrl: string | undefined;

    if (hasImage) {
      try {
        imageBase64 = await fileToBase64(pendingImage.file);
        imagePreviewUrl = pendingImage.preview;
      } catch {
        setError('Failed to process image. Please try again.');
        return;
      }
      setPendingImage(null);
    }

    const userMsg: ChatMessage = {
      role: 'user',
      content: text || (hasImage ? '📷 [Image attached]' : ''),
      timestamp: now,
      imageUrl: imagePreviewUrl,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);
    if (hasImage) setIsAnalyzingImage(true);
    setSessionMsgCount(prev => prev + 1);

    try {
      const apiMessages = newMessages
        .filter((m) => m.role !== 'system_update' && m.role !== 'admin')
        .filter((_, i) => !(i === 0 && newMessages[0].role === 'assistant'))
        .map(m => ({ role: m.role, content: m.content }));

      const body: Record<string, unknown> = { messages: apiMessages, context: getEnrichedContext(), sessionId };
      if (imageBase64) {
        body.image = imageBase64;
      }

      const { data, error: fnError } = await supabase.functions.invoke('ai-support-chat', { body });

      if (fnError) throw new Error(fnError.message);

      // Track conversation_id for realtime admin messages
      if (data?.conversation_id) setConversationId(data.conversation_id);

      if (data?.error) {
        if (data.code === 'COOLDOWN') {
          setError(data.error || 'Please slow down a little. You can send another message shortly.');
        } else if (data.code === 'DAILY_LIMIT' || data.code === 'WEEKLY_LIMIT') {
          setError(data.error);
        } else if (data.code === 'RATE_LIMITED') {
          setError("You've reached the support assistant limit for now. Please try again later or contact support@datasika.com directly.");
        } else if (data.code === 'AI_NOT_CONFIGURED') {
          setError('Support assistant is temporarily unavailable. Please contact support@datasika.com for help.');
        } else {
          setError(data.error);
        }
        // Roll back the optimistic user message so they can retry without losing context.
        setMessages(prev => prev.filter(m => m !== userMsg));
        setIsLoading(false);
        return;
      }

      // Admin takeover: AI paused — do NOT inject any message, just update state
      if (data?.admin_handling) {
        if (data.conversation_id) setConversationId(data.conversation_id);
        setIsAdminHandling(true);
        setIsLoading(false);
        setIsAnalyzingImage(false);
        return;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || "I'm sorry, I couldn't process that. Please try again.",
        timestamp: Date.now(),
      }]);
    } catch (err: any) {
      console.error('AI chat error:', err);
      setError('Something went wrong. Please try again or contact support@datasika.com.');
    } finally {
      setIsLoading(false);
      setIsAnalyzingImage(false);
    }
  }, [input, messages, isLoading, getEnrichedContext, lastSentAt, userMsgCount, pendingImage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ── Broadcast user typing to admin (throttled, ephemeral) ── */
  const broadcastUserTyping = useCallback(() => {
    if (!typingChannelRef.current || !conversationId) return;
    const now = Date.now();
    // Throttle to one broadcast per second
    if (now - lastTypingSentRef.current < 1000) return;
    lastTypingSentRef.current = now;
    typingChannelRef.current.send({
      type: 'broadcast',
      event: 'user_typing',
      payload: { typing: true, ts: now },
    });
    // Auto-clear after 3.5s of no input
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      try {
        typingChannelRef.current?.send({
          type: 'broadcast',
          event: 'user_typing',
          payload: { typing: false },
        });
      } catch {}
    }, 3500);
  }, [conversationId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (!isAdminHandling) return;

    if (e.target.value.length > 0) {
      broadcastUserTyping();
      return;
    }

    try {
      typingChannelRef.current?.send({
        type: 'broadcast',
        event: 'user_typing',
        payload: { typing: false },
      });
    } catch {}
  };

  const handleChatTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  /* ── Guest name submit ── */
  const handleGuestNameSubmit = useCallback(() => {
    const name = guestNameInput.trim();
    if (!name) return;
    setGuestNameState(name);
    setGuestName(name);
    setView('chat');
    // Add personalized greeting
    setMessages([{
      role: 'assistant',
      content: `Hi ${name}! 👋 I'm DataSika's support assistant. How can I help you today?`,
      timestamp: Date.now(),
    }]);
  }, [guestNameInput]);

  /* ── Fetch user tickets ── */
  const fetchUserTickets = useCallback(async () => {
    if (!context?.email) return;
    setTicketsLoading(true);
    try {
      const { data } = await (supabase.from('admin_support_tickets') as any)
        .select('id, ticket_number, ticket_code, status, issue_type, created_at, updated_at, resolution_message, resolution_code, user_notified, ticket_metadata, customer_phone')
        .contains('ticket_metadata', { source: 'ai_assistant' })
        .eq('customer_email', context.email.toLowerCase())
        .order('created_at', { ascending: false })
        .limit(20);
      setUserTickets((data as UserTicket[]) || []);
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setTicketsLoading(false);
    }
  }, [context?.email]);

  /* ── Track ticket by code ── */
  const trackTicket = useCallback(async () => {
    const code = trackInput.trim().toUpperCase();
    if (!code) { setTrackError('Please enter a ticket code (e.g. TK-4F8K2)'); return; }
    setTrackLoading(true);
    setTrackError(null);
    try {
      let query;
      if (code.startsWith('TK-')) {
        query = (supabase.from('admin_support_tickets') as any)
          .select('id, ticket_number, ticket_code, status, issue_type, created_at, updated_at, resolution_message, resolution_code, user_notified, ticket_metadata, customer_phone')
          .contains('ticket_metadata', { source: 'ai_assistant' })
          .eq('ticket_code', code)
          .maybeSingle();
      } else {
        const num = code.replace(/[^0-9]/g, '');
        if (!num) { setTrackError('Please enter a valid ticket code'); setTrackLoading(false); return; }
        query = (supabase.from('admin_support_tickets') as any)
          .select('id, ticket_number, ticket_code, status, issue_type, created_at, updated_at, resolution_message, resolution_code, user_notified, ticket_metadata, customer_phone')
          .contains('ticket_metadata', { source: 'ai_assistant' })
          .eq('ticket_number', parseInt(num))
          .maybeSingle();
      }
      const { data, error: qErr } = await query;
      if (qErr || !data) {
        setTrackError('Ticket not found. Please check the code and try again.');
      } else {
        setSelectedTicket(data as UserTicket);
        setView('ticket_detail');
      }
    } catch {
      setTrackError('Something went wrong. Please try again.');
    } finally {
      setTrackLoading(false);
    }
  }, [trackInput]);

  /* ── When switching to hub, fetch tickets ── */
  useEffect(() => {
    if (view === 'hub' && isLoggedIn) {
      fetchUserTickets();
    }
  }, [view, isLoggedIn, fetchUserTickets]);

  /* ── Floating hint alternation (must be before early returns) ── */
  const [showSupportHint, setShowSupportHint] = useState(false);
  useEffect(() => {
    if (isOpen || isHiddenPage) { setShowSupportHint(false); return; }
    const interval = setInterval(() => {
      setShowSupportHint(prev => !prev);
    }, 6000);
    const initialTimer = setTimeout(() => setShowSupportHint(true), 10000);
    return () => { clearInterval(interval); clearTimeout(initialTimer); };
  }, [isOpen, isHiddenPage]);

  if (isHiddenPage || (hiddenByModal && !isOpen)) return null;

  /* ── Floating button ── */
  if (!isOpen) {
    return (
      <div
        className="fixed right-4 z-[9998] md:right-6 safe-area-floating-widget flex flex-col items-end gap-2"
        style={{
          opacity: isScrolling ? 0.35 : 1,
          transform: isScrolling ? 'translateY(2px) scale(0.96)' : 'translateY(0) scale(1)',
          transition: 'opacity 450ms cubic-bezier(0.4, 0, 0.2, 1), transform 450ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Floating hint */}
        <div
          className="pointer-events-none select-none"
          style={{
            opacity: showSupportHint ? 1 : 0,
            transform: showSupportHint ? 'translateY(0)' : 'translateY(4px)',
            transition: 'opacity 200ms ease, transform 200ms ease',
          }}
        >
          <div className="rounded-xl px-3 py-1.5 text-xs font-semibold text-primary-foreground bg-primary shadow-md border border-primary/20">
            Need help?
          </div>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="group"
          aria-label="Open support chat"
        >
          <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary/30 group-active:scale-95">
            <MessageCircle className="w-6 h-6" />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold border-2 border-background">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-background" />
              </span>
            )}
          </div>
        </button>
      </div>
    );
  }

  // Daily/weekly limits are enforced server-side; the input stays visible.
  // Reaching a limit triggers a friendly inline `error` message above.
  const isAtLimit = false;
  const isCoolingDown = Date.now() - lastSentAt < COOLDOWN_MS;

  /* ── Guest Name View ── */
  const renderGuestNameView = () => (
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-6 min-h-0 flex flex-col items-center justify-center" style={{ WebkitOverflowScrolling: 'touch' }}>
       <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <ShieldCheck className="w-7 h-7 text-primary" />
      </div>
      <h3 className="text-lg font-bold mb-1">Welcome to Support</h3>
      <p className="text-sm text-muted-foreground text-center mb-6 max-w-[260px]">
        What's your name? This helps us personalize your experience.
      </p>
      <div className="w-full max-w-[280px] space-y-3">
        <Input
          placeholder="Enter your name"
          value={guestNameInput}
          onChange={e => setGuestNameInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGuestNameSubmit()}
          className="h-11 text-base text-center"
          autoFocus
        />
        <Button className="w-full h-10" onClick={handleGuestNameSubmit} disabled={!guestNameInput.trim()}>
          Start Chat
        </Button>
        <button
          onClick={() => { setView('chat'); }}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Skip
        </button>
      </div>
    </div>
  );

  /* ── Ticket Detail View ── */
  const renderTicketDetail = () => {
    if (!selectedTicket) return null;
    const st = STATUS_STYLE[selectedTicket.status] || STATUS_STYLE.new;
    const meta = selectedTicket.ticket_metadata || {};

    return (
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Back */}
        <button onClick={() => { setSelectedTicket(null); setView(isLoggedIn ? 'hub' : 'track'); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        {/* Header */}
        <div className="text-center">
          <h3 className="text-lg font-bold">Ticket {selectedTicket.ticket_code || `#${selectedTicket.ticket_number}`}</h3>
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full mt-1 ${st.className}`}>
            {st.label}
          </span>
          <p className="text-xs text-muted-foreground mt-1">{st.description}</p>
        </div>

        {/* Info cards */}
        <div className="space-y-3">
          <div className="bg-muted/30 rounded-xl p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Issue</span>
              <span className="font-medium">{ISSUE_LABELS[selectedTicket.issue_type] || selectedTicket.issue_type}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Created</span>
              <span>{format(new Date(selectedTicket.created_at), 'MMM d, yyyy h:mm a')}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Last update</span>
              <span>{formatDistanceToNow(new Date(selectedTicket.updated_at), { addSuffix: true })}</span>
            </div>
            {selectedTicket.customer_phone && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-mono">{selectedTicket.customer_phone}</span>
              </div>
            )}
          </div>

          {/* AI Summary */}
          {meta.ai_summary && (
            <div className="bg-primary/5 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
              <p className="text-sm">{meta.ai_summary}</p>
            </div>
          )}

          {/* Resolution */}
          {selectedTicket.resolution_message && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Admin Response</p>
              </div>
              <p className="text-sm">{selectedTicket.resolution_message}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-muted/30 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Timeline</p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                <div className="text-xs">
                  <span className="font-medium">Ticket created</span>
                  <span className="text-muted-foreground ml-1">{format(new Date(selectedTicket.created_at), 'MMM d, h:mm a')}</span>
                </div>
              </div>
              {selectedTicket.status === 'in_progress' && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <div className="text-xs">
                    <span className="font-medium">Being reviewed</span>
                    <span className="text-muted-foreground ml-1">{formatDistanceToNow(new Date(selectedTicket.updated_at), { addSuffix: true })}</span>
                  </div>
                </div>
              )}
              {selectedTicket.resolution_code && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <div className="text-xs">
                    <span className="font-medium">Resolved</span>
                    <span className="text-muted-foreground ml-1">{formatDistanceToNow(new Date(selectedTicket.updated_at), { addSuffix: true })}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ── Hub View ── */
  const renderHub = () => {
    const seen = getSeenTicketUpdates();
    const activeTickets = userTickets.filter(t => t.status !== 'closed');
    const hasUnreadTickets = activeTickets.some(t => {
      const key = t.ticket_code || String(t.ticket_number);
      return t.resolution_message && (!seen[key] || seen[key] !== t.updated_at);
    });

    return (
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Header */}
        <div className="text-center pb-1">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <LifeBuoy className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-bold">Support Hub</h3>
          <p className="text-xs text-muted-foreground">Get help and track your requests</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setView('chat')}
            className="flex items-center gap-2.5 bg-primary/5 hover:bg-primary/10 rounded-xl p-3 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold">Start Chat</p>
              <p className="text-[10px] text-muted-foreground">AI assistant</p>
            </div>
          </button>
          <button
            onClick={() => setView('track')}
            className="flex items-center gap-2.5 bg-muted/50 hover:bg-muted rounded-xl p-3 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Search className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-semibold">Track Ticket</p>
              <p className="text-[10px] text-muted-foreground">Enter ticket ID</p>
            </div>
          </button>
        </div>

        {/* Support Info */}
        <div className="bg-muted/30 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold">Support Hours</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            9 AM – 9 PM Ghana time. Most issues are reviewed within minutes during active hours.
          </p>
          <p className="text-[10px] text-muted-foreground">
            For urgent issues: <a href="mailto:support@datasika.com" className="text-primary hover:underline">support@datasika.com</a>
          </p>
        </div>

        {/* Logged-in: My Tickets */}
        {isLoggedIn && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold">My Tickets</h4>
                {hasUnreadTickets && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <button onClick={fetchUserTickets} className="text-[10px] text-primary font-medium hover:underline">Refresh</button>
            </div>

            {ticketsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : activeTickets.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquare className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No active tickets</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Chat with our AI assistant to get help</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeTickets.map(ticket => {
                  const st = STATUS_STYLE[ticket.status] || STATUS_STYLE.new;
                  const ticketKey = ticket.ticket_code || String(ticket.ticket_number);
                  const displayCode = ticket.ticket_code || `#${ticket.ticket_number}`;
                  const hasUpdate = ticket.resolution_message && (!seen[ticketKey] || seen[ticketKey] !== ticket.updated_at);
                  return (
                    <button
                      key={ticket.id}
                      onClick={() => { setSelectedTicket(ticket); setView('ticket_detail'); }}
                      className="w-full text-left bg-muted/30 hover:bg-muted/50 rounded-xl p-3 transition-colors relative"
                    >
                      {hasUpdate && (
                        <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-bold font-mono">{displayCode}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.className}`}>{st.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{ISSUE_LABELS[ticket.issue_type] || ticket.issue_type}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* WhatsApp Channel */}
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
          <p className="text-xs font-semibold mb-1">📢 Stay Updated</p>
          <p className="text-[10px] text-muted-foreground mb-2">
            Join our WhatsApp channel for announcements, updates, and support tips.
          </p>
          <a
            href="https://whatsapp.com/channel/0029Vb78XFeHFxOzC57sVg1R"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Join WhatsApp Channel
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    );
  };

  /* ── Track View (standalone for guests) ── */
  const renderTrackView = () => (
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
      <button onClick={() => setView('hub')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>
      <div className="text-center pt-4">
        <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-base font-bold mb-1">Track Ticket</h3>
        <p className="text-xs text-muted-foreground">Enter your ticket code to see the status</p>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Ticket code (e.g. TK-4F8K2)"
          value={trackInput}
          onChange={e => setTrackInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && trackTicket()}
          className="h-10 text-sm flex-1"
        />
        <Button className="h-10 px-4" onClick={trackTicket} disabled={trackLoading}>
          {trackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Track'}
        </Button>
      </div>
      {trackError && <p className="text-xs text-destructive mt-2">{trackError}</p>}
    </div>
  );

  /* ── Chat View (premium upgrade) ── */
  const renderChatView = () => (
    <>
      {/* Messages — premium chat surface with subtle gradient + safer spacing */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 py-4 space-y-2.5 min-h-0 bg-gradient-to-b from-background via-background to-muted/20"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {messages.map((msg, i) => {
          // Inline system chip for admin join/leave events (deduped, single-line, premium)
          if (msg.role === 'system_event') {
            const isJoin = msg.eventType === 'admin_joined';
            return (
              <div key={msg.eventKey || i} className="flex justify-center my-2 animate-in fade-in-0 duration-300">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border backdrop-blur-sm ${
                  isJoin
                    ? 'bg-orange-500/8 text-orange-700 border-orange-500/20 dark:text-orange-400'
                    : 'bg-muted/60 text-muted-foreground border-border/60'
                }`}>
                  <ShieldCheck className="w-2.5 h-2.5 shrink-0" />
                  <span>{msg.content}</span>
                </div>
              </div>
            );
          }

          if (msg.role === 'system_update') {
            return (
              <div key={i} className="flex justify-start animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1 shrink-0 ring-1 ring-primary/15">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="max-w-[82%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-card text-foreground border border-border/50 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          }

          if (msg.role === 'admin') {
            return (
              <div key={i} className="flex justify-start animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mr-2 mt-1 shrink-0 shadow-md ring-2 ring-orange-500/20">
                  <ShieldCheck className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="max-w-[82%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-gradient-to-br from-orange-500/10 to-orange-500/5 text-foreground border border-orange-500/25 shadow-[0_1px_3px_rgba(234,88,12,0.08)]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[11px] font-semibold text-orange-700 dark:text-orange-400">{msg.adminName || 'Admin'}</span>
                    <span className="text-[8.5px] bg-orange-500/15 text-orange-700 dark:text-orange-400 px-1.5 py-px rounded-md font-bold uppercase tracking-wide leading-none">Admin</span>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in-0 slide-in-from-bottom-1 duration-200`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1 shrink-0 ring-1 ring-primary/15">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[82%] px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-[0_2px_6px_rgba(0,0,0,0.08)] shadow-primary/10'
                    : 'rounded-2xl rounded-bl-md bg-card text-foreground border border-border/50 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                }`}
              >
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="Attached"
                    className="rounded-lg mb-2 max-h-40 w-auto object-contain"
                  />
                )}
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content !== '📷 [Image attached]' || !msg.imageUrl ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : null
                )}
              </div>
            </div>
          );
        })}

        {/* Admin typing indicator (real-time broadcast) */}
        {adminTyping && isAdminHandling && (
          <div className="flex justify-start animate-in fade-in-0 duration-200">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mr-2 mt-1 shrink-0 shadow-md ring-2 ring-orange-500/20">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-orange-500/10 rounded-2xl rounded-bl-md border border-orange-500/25 px-4 py-2.5 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-orange-500/70 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-orange-500/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-orange-500/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-[10px] font-medium text-orange-700 dark:text-orange-400 ml-1">{adminHandlerName || 'Admin'} is typing</span>
              </div>
            </div>
          </div>
        )}

        {isLoading && !adminTyping && (
          <div className="flex justify-start animate-in fade-in-0 duration-200">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1 shrink-0 ring-1 ring-primary/15">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-card rounded-2xl rounded-bl-md border border-border/50 px-4 py-2.5 shadow-sm">
              {isAnalyzingImage ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Analyzing image...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center animate-in fade-in-0 duration-200">
            <div className="bg-destructive/10 text-destructive rounded-xl px-3 py-2 text-xs flex items-center gap-2 max-w-[90%]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Image preview bar */}
      {pendingImage && (
        <div className="px-3 py-2 border-t border-border bg-muted/30 flex items-center gap-2 shrink-0">
          <div className="relative">
            <img src={pendingImage.preview} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-border" />
            <button
              onClick={clearPendingImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
              aria-label="Remove image"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground">Image attached</span>
        </div>
      )}

      {/* Input — premium pill-style composer (iOS no-zoom safe) */}
      <div
        className="border-t border-border/60 px-3 pt-2.5 bg-card/80 backdrop-blur-sm shrink-0"
        style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
      >
        {isAtLimit ? (
          <div className="text-center py-2 space-y-2">
            <p className="text-xs text-muted-foreground">Message limit reached for this session.</p>
            <a href="mailto:support@datasika.com" className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
              Contact support directly <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            {/* Composer pill: attach + textarea grouped */}
            <div className="flex items-end flex-1 gap-1 bg-muted/50 hover:bg-muted/70 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40 border border-border/60 rounded-2xl pl-1.5 pr-1 py-1 transition-all duration-200">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors shrink-0"
                aria-label="Attach image"
                disabled={isLoading}
                type="button"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isAdminHandling ? `Reply to ${adminHandlerName || 'admin'}…` : 'Type a message…'}
                className="flex-1 resize-none bg-transparent border-0 outline-none px-1.5 py-2 text-[16px] leading-snug placeholder:text-muted-foreground/60 min-h-[36px] max-h-[110px]"
                style={{ fontSize: '16px' }}
                rows={1}
                disabled={isLoading}
              />
            </div>
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={(!input.trim() && !pendingImage) || isLoading || isCoolingDown}
              className="h-10 w-10 rounded-full shrink-0 shadow-md hover:shadow-lg active:scale-95 transition-all"
              aria-label="Send message"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5 select-none">
          {isAdminHandling ? 'You are chatting with a real person · ' : 'AI assistant · '}support@datasika.com
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Backdrop overlay on mobile */}
      <div
        className="fixed inset-0 z-[9997] bg-black/40 md:hidden"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Chat panel */}
      <div
        className="fixed inset-0 z-[9998] md:bottom-6 md:right-6 md:top-auto md:left-auto md:inset-auto w-full md:w-[400px] h-[100dvh] md:h-[520px] md:max-h-[80vh] md:rounded-2xl border-0 md:border md:border-border bg-background shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        onTouchMove={handleChatTouchMove}
        role="dialog"
        aria-modal="true"
        aria-label="Support chat"
      >
        {/* Header */}
        <div className={`flex items-center gap-3 px-4 py-3 border-b shrink-0 transition-colors duration-300 ${isAdminHandling && view === 'chat' ? 'border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-orange-500/5' : 'border-border bg-gradient-to-r from-primary/5 to-transparent'}`} style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          {(view === 'ticket_detail' || view === 'track') && (
            <button onClick={() => setView('hub')} className="p-1 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          <button
            onClick={() => setView(view === 'hub' ? 'chat' : 'hub')}
            className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ring-2 shrink-0 transition-colors duration-300 ${isAdminHandling && view === 'chat' ? 'bg-orange-500/15 ring-orange-500/30' : 'bg-primary/10 ring-primary/20'}`}>
              {view === 'hub' ? <LifeBuoy className="w-5 h-5 text-primary" /> : isAdminHandling ? <ShieldCheck className="w-5 h-5 text-orange-600" /> : <Bot className="w-5 h-5 text-primary" />}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-bold truncate">
                {view === 'hub' ? 'Support Hub' : view === 'ticket_detail' ? `Ticket ${selectedTicket?.ticket_code || '#' + selectedTicket?.ticket_number}` : view === 'track' ? 'Track Ticket' : view === 'guest_name' ? 'Welcome' : isAdminHandling ? (adminHandlerName || 'Support Admin') : 'DataSika Support'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {view === 'chat' ? (
                  isAdminHandling ? (
                    <>
                      <span className="relative flex w-2 h-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-60 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                      </span>
                      <p className="text-[11px] text-orange-600 dark:text-orange-400 font-medium truncate">Admin assisting · Live</p>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <p className="text-[11px] text-muted-foreground truncate">Online · Usually replies in minutes</p>
                      {hasTicketUpdate && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setView('hub'); setHasTicketUpdate(false); }}
                          className="ml-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full animate-pulse shrink-0"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Update
                        </button>
                      )}
                    </>
                  )
                ) : (
                  <p className="text-[11px] text-muted-foreground">Tap to return to chat</p>
                )}
              </div>
            </div>
          </button>
          <button
            onClick={() => { setIsOpen(false); setView('chat'); }}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        {view === 'guest_name' && renderGuestNameView()}
        {view === 'chat' && renderChatView()}
        {view === 'hub' && renderHub()}
        {view === 'ticket_detail' && renderTicketDetail()}
        {view === 'track' && renderTrackView()}
      </div>
    </>
  );
};

export default AISupportChat;
