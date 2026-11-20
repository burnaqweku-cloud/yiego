import { useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck, UserRound, Users as UsersIcon } from "lucide-react";
import AdminListPagination from "@/components/admin/AdminListPagination";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";

type Role = "admin" | "registered" | "guest";

// Built in the database (phase1.admin_user_directory): every account and every guest, with order counts and spend
// over all orders. It used to be put together here from the newest 1,000 orders, because a read stops at 1,000 rows
// (20 Nov 2026), so older customers showed too few orders and most guests were missing.
interface Directory {
  registered: { id: string; name: string | null; email: string | null; phone: string | null; since: string; admin: boolean; orders: number; spent: number }[];
  guests: { key: string; email: string | null; phone: string | null; since: string; orders: number; spent: number }[];
}

interface UserRow {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  orders: number;
  spent: number;
  since: string;
}

const roleBadge: Record<Role, { label: string; variant: "success" | "amber" | "neutral" }> = {
  admin: { label: "Admin", variant: "amber" },
  registered: { label: "Registered", variant: "success" },
  guest: { label: "Guest", variant: "neutral" },
};

export default function AdminUsers() {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | Role>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    let mounted = true;
    (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: Directory | null }> })
      .rpc("admin_user_directory", {})
      .then((r) => { if (mounted) { setDirectory(r.data ?? null); setLoading(false); } }, () => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => { setPage(1); }, [search, role, pageSize]);

  // One list: every registered account (flagged admin where it is an active admin), plus each guest grouped by email,
  // else phone, else the number bought for.
  const users = useMemo<UserRow[]>(() => {
    if (!directory) return [];
    const registered: UserRow[] = directory.registered.map((p) => ({
      key: `u:${p.id}`, name: p.name?.trim() || "—", email: p.email, phone: p.phone,
      role: p.admin ? "admin" : "registered", orders: Number(p.orders), spent: Number(p.spent), since: p.since,
    }));
    const guests: UserRow[] = directory.guests.map((g) => ({
      key: `g:${g.key}`, name: "Guest", email: g.email, phone: g.phone, role: "guest", orders: Number(g.orders), spent: Number(g.spent), since: g.since,
    }));
    return [...registered, ...guests].sort((a, b) => (a.since < b.since ? 1 : -1));
  }, [directory]);

  const counts = useMemo(() => ({
    total: users.length,
    admin: users.filter((u) => u.role === "admin").length,
    registered: users.filter((u) => u.role === "registered").length,
    guest: users.filter((u) => u.role === "guest").length,
  }), [users]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((u) =>
      (role === "all" || u.role === role) &&
      (!needle || u.name.toLowerCase().includes(needle) || (u.email ?? "").toLowerCase().includes(needle) || (u.phone ?? "").includes(needle)),
    );
  }, [users, role, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Users" title="All users" description="Everyone who has touched DataYego — registered account holders, administrators, and the guests who checked out without an account. Search by name, email or phone." />
    <AdminStatStrip loading={loading} items={[
      { label: "Total", value: counts.total },
      { label: "Registered", value: counts.registered, tone: "success" },
      { label: "Guests", value: counts.guest },
      { label: "Admins", value: counts.admin, tone: "warning" },
    ]} />
    <Card><CardContent>
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_200px]">
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or phone" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" /></label>
        <select className="onyx-field" value={role} onChange={(event) => setRole(event.target.value as "all" | Role)}>
          <option value="all">All roles</option>
          <option value="admin">Admins</option>
          <option value="registered">Registered</option>
          <option value="guest">Guests</option>
        </select>
      </div>

      {!loading && filtered.length === 0 ? (
        <div className="grid min-h-72 place-items-center text-center"><div><UsersIcon className="mx-auto text-faint-foreground" size={28} /><h2 className="mt-4 font-display text-xl font-semibold text-white">No users found</h2><p className="mt-2 text-sm text-muted-foreground">Change the search or role filter.</p></div></div>
      ) : (
        <>
          {/* Column header — hidden on small screens, where each row stacks. */}
          <div className="mt-5 hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_110px_70px_110px_130px] gap-4 px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint-foreground lg:grid">
            <span>User</span><span>Phone</span><span>Role</span><span className="text-right">Orders</span><span className="text-right">Spent</span><span className="text-right">Joined</span>
          </div>
          <div className="space-y-2">
            {visible.map((u) => (
              <div key={u.key} className="grid grid-cols-1 gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_110px_70px_110px_130px] lg:items-center lg:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${u.role === "guest" ? "bg-white/[0.05] text-faint-foreground" : "bg-primary/[0.1] text-primary-glow"}`}>{u.role === "admin" ? <ShieldCheck size={18} /> : <UserRound size={18} />}</span>
                  <div className="min-w-0"><p className="truncate font-semibold text-white">{u.name}</p><p className="truncate text-xs text-muted-foreground">{u.email ?? "No email on file"}</p></div>
                </div>
                <p className="truncate text-sm text-foreground lg:text-muted-foreground"><span className="text-faint-foreground lg:hidden">Phone: </span>{u.phone ?? "—"}</p>
                <div><Badge variant={roleBadge[u.role].variant}>{roleBadge[u.role].label}</Badge></div>
                <p className="text-sm font-semibold text-foreground lg:text-right"><span className="text-faint-foreground lg:hidden">Orders: </span>{u.orders}</p>
                <p className="font-display text-sm font-semibold text-foreground lg:text-right"><span className="text-faint-foreground lg:hidden">Spent: </span>GH₵{u.spent.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground lg:text-right">{formatAdminDate(u.since)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <AdminListPagination page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="users" />
    </CardContent></Card>
  </div>;
}
