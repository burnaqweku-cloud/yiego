package com.datayego.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * The whole app is one screen that shows the live DataYego site (see capacitor.config.json).
 * Native behaviour added here:
 *  - the phone's back button goes back one page inside the site; from the first page it puts the
 *    app in the background instead of closing it, so coming back is instant;
 *  - the notification channel the phone files DataYego's notifications under;
 *  - tapping a notification opens the page it is about (the notification carries a site path in "url").
 */
public class MainActivity extends BridgeActivity {

    private static final String SITE = "https://datayego.com";
    public static final String CHANNEL_ID = "orders";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
        openFromNotification(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openFromNotification(intent);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Orders and updates", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Payment received, data delivered, refunds and announcements from DataYego.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    /** A tapped notification carries the page to open as a path on the site, e.g. /track-order?reference=YG-123. */
    private void openFromNotification(Intent intent) {
        if (intent == null || intent.getExtras() == null) return;
        String path = intent.getExtras().getString("url");
        if (path == null || !path.startsWith("/") || path.startsWith("//")) return;
        intent.removeExtra("url");
        final String target = SITE + path;
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) webView.post(() -> webView.loadUrl(target));
    }
}
