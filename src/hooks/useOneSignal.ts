import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

const ONESIGNAL_APP_ID = '6896f18f-ebe9-4196-b7e6-8874caea4904';

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

let initialized = false;

export const useOneSignal = () => {
  const { user, profile } = useAuth();
  const identifiedRef = useRef(false);

  useEffect(() => {
    if (initialized) return;
    initialized = true;

    // Load the SDK script
    const script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    document.head.appendChild(script);

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    window.OneSignalDeferred.push(async (OneSignal: any) => {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        serviceWorkerPath: '/OneSignalSDKWorker.js',
        allowLocalhostAsSecureOrigin: true,
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: 'push',
                autoPrompt: true,
                // Delay prompt: 20 seconds OR 2 page views, whichever comes first
                delay: {
                  timeDelay: 20,
                  pageViews: 2,
                },
                text: {
                  actionMessage: 'Get notified when your data bundle is delivered and for wallet updates.',
                  acceptButton: 'Allow',
                  cancelButton: 'Not now',
                },
              },
            ],
          },
        },
        notificationClickHandlerMatch: 'exact',
        notificationClickHandlerAction: 'navigate',
      });
    });
  }, []);

  // Identify user when logged in
  useEffect(() => {
    if (!user || identifiedRef.current) return;

    const identify = async () => {
      const deferred = window.OneSignalDeferred;
      if (!deferred) return;

      deferred.push(async (OneSignal: any) => {
        try {
          // Set external user ID (our Supabase user ID)
          await OneSignal.login(user.id);

          // Set user properties if available
          if (profile?.email) {
            await OneSignal.User.addEmail(profile.email);
          }

          // Add tags for segmentation — pick highest-priority role (admin > staff > agent > user)
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id);

          const roleSet = new Set((roles || []).map((r: any) => r.role));
          const primaryRole = roleSet.has('admin')
            ? 'admin'
            : roleSet.has('staff')
              ? 'staff'
              : roleSet.has('agent')
                ? 'agent'
                : 'user';
          await OneSignal.User.addTag('role', primaryRole);
          await OneSignal.User.addTag('user_id', user.id);
          // Boolean tags for OR-style segment targeting
          if (roleSet.has('admin') || roleSet.has('staff')) {
            await OneSignal.User.addTag('is_admin', '1');
          }
          if (roleSet.has('agent')) {
            await OneSignal.User.addTag('is_agent', '1');
          }

          identifiedRef.current = true;

          // Save player ID to database
          const subscriptionId = await OneSignal.User.PushSubscription.id;
          if (subscriptionId) {
            await supabase
              .from('onesignal_players' as any)
              .upsert(
                {
                  player_id: subscriptionId,
                  user_id: user.id,
                  platform: navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad') ? 'ios' : 'web',
                  user_agent: navigator.userAgent,
                  last_active_at: new Date().toISOString(),
                  is_active: true,
                },
                { onConflict: 'player_id' }
              );
          }
        } catch (err) {
          // Silent fail — push is non-critical
          console.warn('[OneSignal] identify error:', err);
        }
      });
    };

    identify();
  }, [user, profile]);
};
