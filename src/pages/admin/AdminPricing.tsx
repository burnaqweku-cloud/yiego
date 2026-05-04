import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PricingTable from '@/components/admin/PricingTable';
import PricingGlobalSettings from '@/components/admin/PricingGlobalSettings';
import PricingPreview from '@/components/admin/PricingPreview';
import SupplierSync from '@/components/admin/SupplierSync';

const AdminPricing = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, loading, navigate]);

  if (loading || !user || !isAdmin) return null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold">Pricing Management</h2>
          <p className="text-muted-foreground text-sm">Control normal and agent pricing, overrides, and supplier costs</p>
        </div>

        <Tabs defaultValue="normal" className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-auto">
            <TabsTrigger value="normal" className="text-xs py-2">Normal Pricing</TabsTrigger>
            <TabsTrigger value="agent" className="text-xs py-2">Agent Pricing</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs py-2">Global Settings</TabsTrigger>
            <TabsTrigger value="preview" className="text-xs py-2">Preview</TabsTrigger>
            <TabsTrigger value="supplier" className="text-xs py-2">Supplier Sync</TabsTrigger>
          </TabsList>

          <TabsContent value="normal" className="mt-4">
            <div className="mb-3">
              <h3 className="font-semibold text-sm">Normal Customer Prices</h3>
              <p className="text-[10px] text-muted-foreground">Set auto or manual prices per bundle. Use bulk tools for faster management.</p>
            </div>
            <PricingTable customerType="normal" />
          </TabsContent>

          <TabsContent value="agent" className="mt-4">
            <div className="mb-3">
              <h3 className="font-semibold text-sm">Agent/Wholesale Prices</h3>
              <p className="text-[10px] text-muted-foreground">Agent prices must be lower than normal prices. Warnings shown for violations.</p>
            </div>
            <PricingTable customerType="agent" />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <PricingGlobalSettings />
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <PricingPreview />
          </TabsContent>

          <TabsContent value="supplier" className="mt-4">
            <SupplierSync />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminPricing;
