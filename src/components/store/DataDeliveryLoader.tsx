/**
 * Custom "data delivery" animated loader.
 * Shows signal-bar pulses that convey "data is being sent".
 */
const DataDeliveryLoader = () => (
  <div className="flex flex-col items-center gap-3">
    {/* Signal bars animation */}
    <div className="flex items-end gap-1.5 h-10">
      {[
        { h: 'h-4', delay: '0s' },
        { h: 'h-6', delay: '0.15s' },
        { h: 'h-8', delay: '0.3s' },
        { h: 'h-10', delay: '0.45s' },
        { h: 'h-7', delay: '0.6s' },
      ].map((bar, i) => (
        <div
          key={i}
          className={`w-2 rounded-full bg-primary signal-bar ${bar.h}`}
          style={{ animationDelay: bar.delay }}
        />
      ))}
    </div>
    <p className="text-xs text-muted-foreground font-medium tracking-wide">
      Processing your order…
    </p>
  </div>
);

export default DataDeliveryLoader;
