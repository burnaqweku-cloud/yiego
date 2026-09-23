import { Link } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import HelpCenter from "@/components/help/HelpCenter";

/* Public copy of the agent Help Center — linkable from WhatsApp without a login. */
export default function AgentsHelp() {
  return (
    <div className="mk-wrap max-w-2xl py-8">
      <Seo title="Agent Help Center — DataYego" description="How agent earnings, orders, prices and plans work on DataYego." path="/help/agents" />
      <HelpCenter audience="agents" title="Agent Help Center" subtitle="How earnings, orders, prices and plans work." />
      <p className="mt-6 text-center text-[12px] text-muted-foreground">Not an agent yet? <Link to="/agents" className="text-primary-glow">Apply here</Link>.</p>
    </div>
  );
}
