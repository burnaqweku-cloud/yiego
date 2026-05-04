import AdminLayout from './AdminLayout';
import NetworkAvailabilitySettings from '@/components/admin/NetworkAvailabilitySettings';

const AdminNetworkAvailability = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Network Availability</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control which networks accept new orders. Toggling a network off blocks all new order placement for that network across the platform.
          </p>
        </div>
        <NetworkAvailabilitySettings />
      </div>
    </AdminLayout>
  );
};

export default AdminNetworkAvailability;
