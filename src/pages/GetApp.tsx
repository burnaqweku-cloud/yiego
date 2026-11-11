import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Ban, Bell, CheckCircle2, Download, type LucideIcon, PlusSquare, RefreshCw, Settings2, Share, ShieldCheck, Smartphone, Wallet, Zap } from "lucide-react";
import Seo from "@/components/seo/Seo";
import { Card } from "@/components/ui/card";
import { metaFor } from "@/lib/site";
import { deviceKind, formatAppSize, loadAppVersion, markAppDownloaded, runningAsApp, trackApp, type AppVersion } from "@/lib/appInstall";
import { cn } from "@/lib/utils";

/* "Get the app": laid out like a store listing so installing feels familiar.
   Android downloads the app file from this site; an iPhone adds the site to its home screen.
   Only facts we can stand behind are shown (size, version, what Android it needs): no ratings or download counts. */

type Phone = "android" | "iphone";

function Step({ n, icon: Icon, title, children }: { n: number; icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><Icon size={18} aria-hidden="true" /></span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[15px] font-semibold text-foreground">{n}. {title}</p>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return <div className="min-w-0 px-2 text-center"><p className="truncate text-[15px] font-semibold text-foreground">{value}</p><p className="mt-0.5 text-[12px] text-muted-foreground">{label}</p></div>;
}

export default function GetApp() {
  const [phone, setPhone] = useState<Phone>("android");
  const [version, setVersion] = useState<AppVersion | null | undefined>(undefined);
  const [inApp, setInApp] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    // An iPhone visitor reading the home-screen steps is the iPhone version of a download.
    if (deviceKind() === "iphone") { setPhone("iphone"); if (!runningAsApp()) trackApp("ios_guide_view", "iphone"); }
    setInApp(runningAsApp());
    void loadAppVersion().then(setVersion);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4">
      <Seo {...metaFor("/app")} />

      {/* The listing */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <img src="/yiego-icon-512.png?v=3" alt="" width={84} height={84} className="h-[84px] w-[84px] shrink-0 rounded-[22px] shadow-[0_10px_24px_-12px_rgb(0_0_0/0.45)]" />
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-foreground">DataYego</h1>
            <p className="mt-0.5 text-[14px] font-medium text-primary-glow">Data bundles for Ghana</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Free · MTN, Telecel and AirtelTigo</p>
          </div>
        </div>

        <div role="tablist" aria-label="Your phone" className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-white/[0.05] p-1">
          {(["android", "iphone"] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={phone === p} onClick={() => setPhone(p)}
              className={cn("h-10 rounded-full text-[13.5px] font-semibold transition-colors", phone === p ? "bg-[hsl(var(--card))] text-foreground shadow-[0_1px_4px_rgb(0_0_0/0.12)]" : "text-muted-foreground")}>
              {p === "android" ? "Android" : "iPhone"}
            </button>
          ))}
        </div>

        {phone === "android" ? (
          <>
            <div className="mt-5 grid grid-cols-3 divide-x divide-white/[0.09] border-y border-white/[0.09] py-3.5">
              <Fact value={version ? formatAppSize(version.size) : "About 5 MB"} label="Size" />
              <Fact value={version ? `v${version.version}` : "v1.0"} label="Version" />
              <Fact value="Android 7+" label="Works on" />
            </div>
            {inApp ? (
              <p className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-primary/[0.1] px-4 py-3.5 text-[14px] font-semibold text-primary-glow"><CheckCircle2 size={18} aria-hidden="true" />You're using the app</p>
            ) : version ? (
              <a href={version.file} download="DataYego.apk" onClick={() => { markAppDownloaded(); trackApp("download_tap", deviceKind()); setStarted(true); }}
                className="mk-btn mk-btn-primary mt-5 flex h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl text-[16px] font-semibold">
                <Download size={19} aria-hidden="true" />Download APK
              </a>
            ) : (
              <p className="mt-5 rounded-2xl border border-white/[0.09] px-4 py-3.5 text-center text-[14px] text-muted-foreground">{version === undefined ? "Checking the latest version…" : "The Android app will be here shortly. Please check back soon."}</p>
            )}
            {started && <p role="status" className="mt-3 text-center text-[13px] text-muted-foreground">Download started. When it finishes, open the file and tap Install.</p>}
          </>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-3 divide-x divide-white/[0.09] border-y border-white/[0.09] py-3.5">
              <Fact value="Nothing" label="To download" />
              <Fact value="Latest" label="Version" />
              <Fact value="Safari" label="Install with" />
            </div>
            <p className="mt-5 rounded-2xl bg-primary/[0.1] px-4 py-3.5 text-[14px] leading-relaxed text-foreground">On iPhone there is nothing to download. You add DataYego to your home screen from Safari and it opens like any other app. The steps are just below.</p>
          </>
        )}
      </Card>

      {/* How to install */}
      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-[19px] font-semibold tracking-tight text-foreground">{phone === "android" ? "How to install" : "Add it to your iPhone"}</h2>
        {phone === "android" ? (
          <ol className="mt-4 space-y-4">
            <Step n={1} icon={Download} title="Download the APK">Tap <b className="font-semibold text-foreground">Download APK</b> above. If your browser asks, choose to keep the file.</Step>
            <Step n={2} icon={Settings2} title="Allow the install">Open the downloaded file. If your phone says it blocks unknown apps, tap <b className="font-semibold text-foreground">Settings</b> and switch on “Allow from this source” for your browser.</Step>
            <Step n={3} icon={CheckCircle2} title="Install and open">Tap <b className="font-semibold text-foreground">Install</b>, then <b className="font-semibold text-foreground">Open</b>. Sign in with your usual DataYego account, or buy without one.</Step>
          </ol>
        ) : (
          <ol className="mt-4 space-y-4">
            <Step n={1} icon={Smartphone} title="Open DataYego in Safari">Go to <b className="font-semibold text-foreground">datayego.com</b> in Safari. Other iPhone browsers may not show the option.</Step>
            <Step n={2} icon={Share} title="Tap the Share button">It is the square with an arrow pointing up, at the bottom of the screen.</Step>
            <Step n={3} icon={PlusSquare} title="Choose “Add to Home Screen”">Scroll down the list a little if you do not see it straight away.</Step>
            <Step n={4} icon={CheckCircle2} title="Tap Add">DataYego now sits on your home screen. Open it from there next time.</Step>
            <Step n={5} icon={Bell} title="Turn on notifications">Open DataYego from your home screen and tap <b className="font-semibold text-foreground">Turn on</b> when it offers notifications, so you know the moment your data arrives.</Step>
          </ol>
        )}
      </Card>

      {/* What it gives you */}
      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-[19px] font-semibold tracking-tight text-foreground">Why use the app</h2>
        <ul className="mt-4 space-y-4">
          {([
            [Zap, "One tap to buy data", "Opens straight from your home screen, with no address to type."],
            [Wallet, "Same account, wallet and orders", "Everything you have on the website is already there when you sign in."],
            [RefreshCw, "Always up to date", "New features arrive by themselves. There are no updates to install."],
            [Ban, "No ads", "The app only does what DataYego does: buy data and track it."],
          ] as const).map(([Icon, title, text]) => (
            <li key={title} className="flex gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><Icon size={18} aria-hidden="true" /></span>
              <div className="min-w-0 pt-0.5"><p className="text-[15px] font-semibold text-foreground">{title}</p><p className="mt-0.5 text-[13.5px] leading-relaxed text-muted-foreground">{text}</p></div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Safety */}
      <Card className="flex gap-3.5 p-5 sm:p-6">
        <ShieldCheck size={22} className="mt-0.5 shrink-0 text-primary-glow" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-[15.5px] font-semibold text-foreground">Only install it from here</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">Get the DataYego app from <b className="font-semibold text-foreground">datayego.com</b> only. Do not install a DataYego file someone sends you or one from another website.</p>
          {phone === "android" && <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">If your phone says “App not installed”, remove any older DataYego app first, then install again. Your account, wallet and orders are safe.</p>}
        </div>
      </Card>

      <p className="pb-2 text-center text-[13px] text-muted-foreground">Prefer the website? <Link to="/shop" className="font-semibold text-primary-glow">Buy data here</Link> without installing anything.</p>
    </div>
  );
}
