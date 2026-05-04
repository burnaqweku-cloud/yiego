
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import Logo from '@/components/layout/Logo';

const Maintenance = () => {
  const { message, eta } = useMaintenanceMode();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden px-4">
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-20"
          style={{
            background: 'hsl(var(--primary) / 0.4)',
            filter: 'blur(80px)',
            animation: 'maintenance-pulse 4s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-15"
          style={{
            background: 'hsl(var(--primary) / 0.3)',
            filter: 'blur(100px)',
            animation: 'maintenance-pulse 6s ease-in-out infinite reverse',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{
            background: 'hsl(var(--primary))',
            filter: 'blur(120px)',
          }}
        />
      </div>

      <style>{`
        @keyframes maintenance-pulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.15); opacity: 0.25; }
        }
        @keyframes maintenance-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes maintenance-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes maintenance-glow {
          0%, 100% { box-shadow: 0 0 20px hsl(var(--primary) / 0.3); }
          50% { box-shadow: 0 0 40px hsl(var(--primary) / 0.6), 0 0 80px hsl(var(--primary) / 0.2); }
        }
      `}</style>

      {/* Main card */}
      <div
        className="relative z-10 w-full max-w-md"
        style={{ animation: 'maintenance-float 4s ease-in-out infinite' }}
      >
        <div
          className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl p-8 text-center shadow-2xl"
          style={{ animation: 'maintenance-glow 3s ease-in-out infinite' }}
        >
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Logo height="h-10" />
          </div>

          {/* Spinner icon */}
          <div className="flex justify-center mb-6">
            <div className="relative w-16 h-16">
              <div
                className="absolute inset-0 rounded-full border-4 border-primary/20"
              />
              <div
                className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary"
                style={{ animation: 'maintenance-spin 1.5s linear infinite' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">
            We'll Be Back Shortly
          </h1>
          <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
            {message || "We're improving YieGo for a better experience."}
          </p>

          {/* ETA */}
          {eta && (
            <div className="mb-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Expected back: {eta}
            </div>
          )}

        </div>

        {/* Bottom label */}
        <p className="text-center text-xs text-muted-foreground mt-4 opacity-60">
          YieGo · Ghana Data Bundles
        </p>
      </div>
    </div>
  );
};

export default Maintenance;
