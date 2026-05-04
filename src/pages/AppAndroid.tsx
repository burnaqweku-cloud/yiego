import Layout from '@/components/layout/Layout';
import { Download, ShieldCheck, Settings, CheckCircle, AlertTriangle, Star, Users, HardDrive, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const APK_URL = `https://nrsfvhztpzwkadwciizp.supabase.co/storage/v1/object/public/app-downloads/datasika.apk`;

const STEPS = [
  {
    icon: Download,
    title: 'Download the APK',
    description: 'Tap the download button to get the DataSika APK file.',
  },
  {
    icon: Settings,
    title: 'Allow unknown sources',
    description: 'Go to Settings → Security → Enable "Install from unknown sources" for your browser.',
  },
  {
    icon: CheckCircle,
    title: 'Install & open',
    description: 'Open the downloaded file, tap "Install", then "Open" to launch DataSika.',
  },
];

const AppAndroid = () => {
  return (
    <Layout>
      <div className="container py-8 max-w-lg mx-auto px-4">
        {/* App Header Card */}
        <div className="border border-border rounded-2xl p-6 bg-card card-shadow mb-6">
          <div className="flex gap-4 items-start">
            <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 shadow-md">
              <img src="/datasika-icon.png" alt="DataSika" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold mb-0.5">DataSika</h1>
              <p className="text-sm text-primary font-medium mb-2">DataSika Technologies</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                  4.8
                </span>
                <span>•</span>
                <span>10K+ downloads</span>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border">
            <div className="text-center">
              <p className="text-sm font-bold">4.8 ★</p>
              <p className="text-[11px] text-muted-foreground">1.2K reviews</p>
            </div>
            <div className="text-center border-x border-border">
              <p className="text-sm font-bold">32 MB</p>
              <p className="text-[11px] text-muted-foreground">Size</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold">v7.2.0</p>
              <p className="text-[11px] text-muted-foreground">Version</p>
            </div>
          </div>

          {/* Download Button */}
          <a href={APK_URL} download="DataSika.apk" className="block mt-5">
            <Button className="w-full btn-press gap-2 font-bold h-12 text-base rounded-xl">
              <Download className="w-5 h-5" />
              Download APK
            </Button>
          </a>
        </div>

        {/* About */}
        <div className="border border-border rounded-2xl p-5 bg-card card-shadow mb-6">
          <h2 className="text-base font-bold mb-2">About this app</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            DataSika is the fastest way to buy affordable internet data bundles in Ghana. 
            Supports MTN, Telecel, AirtelTigo & AT networks with instant delivery directly to your phone.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="secondary" className="text-[11px]">Data Bundles</Badge>
            <Badge variant="secondary" className="text-[11px]">Mobile Money</Badge>
            <Badge variant="secondary" className="text-[11px]">Instant Delivery</Badge>
            <Badge variant="secondary" className="text-[11px]">Ghana</Badge>
          </div>
        </div>

        {/* Install Steps */}
        <div className="border border-border rounded-2xl p-5 bg-card card-shadow mb-6">
          <h2 className="text-base font-bold mb-4">How to install</h2>
          <div className="space-y-4">
            {STEPS.map((step, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <step.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{`${i + 1}. ${step.title}`}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Safety & Warning */}
        <div className="space-y-3">
          <div className="border border-border rounded-xl p-4 bg-card flex gap-3 items-start">
            <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold mb-0.5">Verified & Safe</p>
              <p className="text-xs text-muted-foreground">
                Only download from <span className="font-semibold text-foreground">datasika.shop</span>. 
                Do not install APKs from unknown third-party sources.
              </p>
            </div>
          </div>

          <div className="border border-primary/20 rounded-xl p-4 bg-primary/5 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              If blocked, go to <span className="font-medium text-foreground">Settings → Apps → Special Access → Install unknown apps</span> and allow your browser.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AppAndroid;
