import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { rememberInvite } from "@/lib/referrals";
import { useAuth } from "@/store/auth-context";

/* /r/CODE: remember who invited this visitor, then send them to sign up.
   Signed-in users just land on the shop (an existing account can't be referred). */
export default function Invite() {
  const { code = "" } = useParams();
  const { isAuthenticated } = useAuth();
  useEffect(() => { rememberInvite(code); }, [code]);
  return <Navigate to={isAuthenticated ? "/" : "/auth?mode=signup&invite=1"} replace />;
}
