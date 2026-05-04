import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDevicePlatform } from '@/hooks/useDeviceDetect';
import Layout from '@/components/layout/Layout';
import { Smartphone, Monitor, Download, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const AppRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const platform = getDevicePlatform();
    if (platform === 'ios') {
      navigate('/app/ios', { replace: true });
    } else if (platform === 'android') {
      navigate('/app/android', { replace: true });
    }
    // Desktop stays on this page
  }, [navigate]);

  return (
    <Layout>
      <div className="container py-16 max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-6 overflow-hidden card-shadow">
            <img src="/datasika-icon.png" alt="DataSika" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold mb-3">Get the DataSika App</h1>
          <p className="text-muted-foreground">Choose your platform to install DataSika on your device.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link to="/app/android" className="block">
            <div className="border border-border rounded-xl p-6 text-center interactive-card card-shadow">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-6 h-6 text-success" />
              </div>
              <h2 className="text-lg font-bold mb-1">Android</h2>
              <p className="text-sm text-muted-foreground mb-4">Download the APK file</p>
              <Button className="w-full btn-press gap-2">
                <Download className="w-4 h-4" />
                Download App
              </Button>
            </div>
          </Link>

          <Link to="/app/ios" className="block">
            <div className="border border-border rounded-xl p-6 text-center interactive-card card-shadow">
              <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center mx-auto mb-4">
                <Monitor className="w-6 h-6 text-info" />
              </div>
              <h2 className="text-lg font-bold mb-1">iPhone / iPad</h2>
              <p className="text-sm text-muted-foreground mb-4">Add to Home Screen</p>
              <Button variant="outline" className="w-full btn-press gap-2">
                <Plus className="w-4 h-4" />
                Get App
              </Button>
            </div>
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default AppRedirect;
