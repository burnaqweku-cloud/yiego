import CheckMtn from "@/pages/CheckMtn";

/* Same tool as datayego.com/check-mtn, inside the agent dashboard: check a customer's
   MTN number before selling, or paste a list. Agent pages only; nothing admin here. */
export default function AgentCheckMtn() {
  return <CheckMtn embedded />;
}
