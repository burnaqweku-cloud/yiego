import { LogOut } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader } from "@/components/flows/flow-parts";
import { useAuth } from "@/store/auth-context";

/** Sign out of the real Supabase session. */
export default function SignOutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut: signOutOfSupabase, isAuthenticated } = useAuth();

  const signOut = async () => {
    try {
      if (isAuthenticated) {
        await signOutOfSupabase();
      }
      toast.success("Signed out");
      window.location.assign("/");
    } catch {
      toast.error("Could not sign out. Please try again.");
      return;
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="Sign out">
      <FlowHeader title="Sign out" onClose={onClose} />
      <div className="flex flex-col items-center px-5 pb-2 pt-7 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full border border-danger/25 bg-danger/[0.1] text-danger">
          <LogOut size={26} />
        </span>
        <h3 className="mt-4 font-display text-[19px] font-semibold tracking-tight text-white">
          Sign out of YieGo?
        </h3>
        <p className="mt-1.5 max-w-[32ch] text-[13.5px] leading-relaxed text-muted-foreground">
          You can sign back in at any time to access your wallet and orders.
        </p>
      </div>
      <FlowFooter>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={signOut}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-danger px-5 text-[14.5px] font-semibold tracking-[-0.01em] text-white shadow-[0_12px_30px_-10px_hsl(4_78%_62%/0.55)] transition hover:brightness-110"
          >
            <LogOut size={17} />
            Sign out
          </button>
          <button type="button" className="onyx-btn-ghost w-full" onClick={onClose}>
            Cancel
          </button>
        </div>
      </FlowFooter>
    </Modal>
  );
}
