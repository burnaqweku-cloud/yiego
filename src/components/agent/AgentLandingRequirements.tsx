import { ShieldAlert } from 'lucide-react';

const rules = [
  'Must agree to agent rules before activation',
  'Fraud or scam activity leads to immediate suspension',
  'Minimum pricing rule applies — no undercutting',
  'Accurate identity info required for verification',
];

const AgentLandingRequirements = () => (
  <section className="px-4 py-8 sm:py-10 max-w-2xl mx-auto">
    <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 card-shadow">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-destructive" />
        </div>
        <h3 className="text-sm font-bold text-foreground">Requirements & Compliance</h3>
      </div>
      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
            {r}
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default AgentLandingRequirements;
