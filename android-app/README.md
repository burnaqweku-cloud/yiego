# DataYego Android app

A native Android shell that opens the live site, https://datayego.com. Nothing from the site is
packed inside it, so every site publish reaches the app straight away with no app update.

What the shell adds:
- the DataYego icon and start-up screen
- the phone's back button goes back one page; from the first page it sends the app to the background
- an offline screen with a retry button
- Paystack and Kora payment pages open inside the app; WhatsApp, phone and other outside links open in their own apps

What lives in the site code (`src/`), not here: the bottom tab bar, the status-bar spacing and everything else on screen.

## Building
GitHub builds it (`.github/workflows/android-app.yml`): run the "Android app" workflow, then download the APK
from the run, or from the "android-latest" release. By hand: `npm ci && npx cap sync android && cd android && ./gradlew assembleDebug`.

## Changing things
- App name, ID, site address, allowed payment sites: `capacitor.config.json`
- Icon and start-up screen: `android/app/src/main/res/` (`mipmap-*`, `drawable*/splash.png`, `values/colors.xml`)
- Back button: `android/app/src/main/java/com/datayego/app/MainActivity.java`
- Offline screen: `www/offline.html`

## Signing
The real app is signed with the key held in the `ANDROID_SIGNING` GitHub secret (one line: `<password>:<base64 PKCS12 keystore>`, alias `datayego`).
With it, the build makes `DataYego.apk` and writes it, with `version.json`, to `public/app/` for the Get the app page.
Without it, the build only makes `DataYego-test.apk`, which is never put on the site. The owner keeps the only backup of the key.

The app ID `com.datayego.app` cannot be changed once the app is on the Play Store.
