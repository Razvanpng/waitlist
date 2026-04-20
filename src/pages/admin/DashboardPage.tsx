import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast, Toaster } from "sonner";
import {
  Loader2, LogOut, Plus, Clock, Users, AlertTriangle,
  CheckSquare, XSquare, Calendar, UsersRound, X,
  Phone, Mail, Hash,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authSlice";
import type { Database } from "@/types/database.types";

type Slot = Database["public"]["Tables"]["slots"]["Row"];

const slotSchema = z
  .object({
    title:     z.string().min(2, "title must be at least 2 characters"),
    starts_at: z.string().min(1, "start time is required"),
    ends_at:   z.string().min(1, "end time is required"),
    capacity:  z.coerce.number().int().min(1, "capacity must be at least 1"),
  })
  .refine((d) => new Date(d.ends_at) > new Date(d.starts_at), {
    message: "end time must be after start time",
    path: ["ends_at"],
  });

type SlotFormValues = z.infer<typeof slotSchema>;

const STATUS_STYLES: Record<Slot["status"], string> = {
  available: "border-l-4 border-l-green-500",
  booked:    "border-l-4 border-l-yellow-400",
  cancelled: "border-l-4 border-l-zinc-500 opacity-50",
};

const STATUS_LABEL: Record<Slot["status"], string> = {
  available: "OPEN",
  booked:    "FULL",
  cancelled: "CANCELLED",
};

interface ConfirmState {
  slotId: string;
  title: string;
}

interface ClientsModalTarget {
  slotId: string;
  title: string;
}

type TabMode = "active" | "history";

// -- clients modal --

interface BookingRow {
  id: string;
  profiles: { full_name: string | null; email: string; phone?: string | null } | null;
}

interface WaitlistRow {
  id: string;
  position: number;
  status: string;
  profiles: { full_name: string | null; email: string; phone?: string | null } | null;
}

function ClientsModal({
  target,
  onClose,
}: {
  target: ClientsModalTarget;
  onClose: () => void;
}) {
  const [bookings, setBookings]     = useState<BookingRow[]>([]);
  const [waitlist, setWaitlist]     = useState<WaitlistRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const [{ data: bData, error: bErr }, { data: wData, error: wErr }] =
        await Promise.all([
          supabase
            .from("bookings")
            .select("id, profiles(full_name, email, phone)")
            .eq("slot_id", target.slotId) as any,
          supabase
            .from("waitlist_entries")
            .select("id, position, status, profiles(full_name, email, phone)")
            .eq("slot_id", target.slotId)
            .not("status", "in", '("expired","withdrawn")')
            .order("position", { ascending: true }) as any,
        ]);

      if (bErr || wErr) {
        setError((bErr ?? wErr).message);
      } else {
        setBookings((bData as BookingRow[]) ?? []);
        setWaitlist((wData as WaitlistRow[]) ?? []);
      }
      setLoading(false);
    })();
  }, [target.slotId]);

  const displayName = (row: BookingRow | WaitlistRow) =>
    row.profiles?.full_name?.trim() || row.profiles?.email || "unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[90vh]">
        {/* header */}
        <div className="border-b-2 border-foreground px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <p
              className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/40"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Client Roster
            </p>
            <h2
              className="mt-0.5 text-xl font-black uppercase tracking-tight leading-tight"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {target.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="border-2 border-foreground p-1.5 hover:bg-foreground hover:text-background transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center gap-3 px-6 py-10 text-foreground/40">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-bold uppercase tracking-widest">
                Fetching roster…
              </span>
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 bg-destructive text-destructive-foreground p-5 m-6">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <p className="text-sm font-bold uppercase tracking-wide">{error}</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y-2 divide-foreground/10">
              {/* confirmed bookings */}
              <section className="px-6 py-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40"
                    style={{ fontFamily: "'Syne', sans-serif" }}
                  >
                    Confirmed Bookings
                  </span>
                  <span className="border border-green-500/40 text-green-500 text-[10px] font-black uppercase tracking-widest px-2 py-0.5">
                    {bookings.length}
                  </span>
                </div>

                {bookings.length === 0 ? (
                  <p className="text-xs font-black uppercase tracking-widest text-foreground/25 py-2">
                    No Clients
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {bookings.map((b, i) => (
                      <ClientRow
                        key={b.id}
                        index={i + 1}
                        name={displayName(b)}
                        email={b.profiles?.email}
                        phone={b.profiles?.phone}
                        accentClass="border-l-green-500"
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* waitlist */}
              <section className="px-6 py-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40"
                    style={{ fontFamily: "'Syne', sans-serif" }}
                  >
                    Waitlist Queue
                  </span>
                  <span className="border border-yellow-400/40 text-yellow-400 text-[10px] font-black uppercase tracking-widest px-2 py-0.5">
                    {waitlist.length}
                  </span>
                </div>

                {waitlist.length === 0 ? (
                  <p className="text-xs font-black uppercase tracking-widest text-foreground/25 py-2">
                    No Clients
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {waitlist.map((w) => (
                      <ClientRow
                        key={w.id}
                        index={w.position}
                        name={displayName(w)}
                        email={w.profiles?.email}
                        phone={w.profiles?.phone}
                        badge={w.status}
                        accentClass="border-l-yellow-400"
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t-2 border-foreground px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            className="w-full border-2 border-foreground py-3 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
          >
            Close Roster
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientRow({
  index,
  name,
  email,
  phone,
  badge,
  accentClass,
}: {
  index: number;
  name: string;
  email?: string;
  phone?: string | null;
  badge?: string;
  accentClass: string;
}) {
  return (
    <div className={`border-2 border-foreground/20 border-l-4 ${accentClass} px-4 py-3 flex flex-col gap-1.5`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] font-black text-foreground/30 uppercase tracking-widest">
          <Hash className="h-2.5 w-2.5" />{index}
        </span>
        <span
          className="text-sm font-black uppercase tracking-wide leading-none"
          style={{ fontFamily: "'Syne', sans-serif" }}
        >
          {name}
        </span>
        {badge && (
          <span className="text-[10px] font-black uppercase tracking-widest border border-foreground/20 px-1.5 py-0.5 text-foreground/40">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {email && (
          <span className="flex items-center gap-1.5 text-xs text-foreground/50 font-medium">
            <Mail className="h-3 w-3" />{email}
          </span>
        )}
        {phone && (
          <span className="flex items-center gap-1.5 text-xs text-foreground/50 font-medium">
            <Phone className="h-3 w-3" />{phone}
          </span>
        )}
      </div>
    </div>
  );
}

// -- main page --

export function DashboardPage() {
  const { profile, signOut } = useAuthStore();

  const [slots, setSlots]           = useState<Slot[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [formOpen, setFormOpen]         = useState(false);
  const [confirmCancel, setConfirmCancel]   = useState<ConfirmState | null>(null);
  const [clientsTarget, setClientsTarget]   = useState<ClientsModalTarget | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>("active");

  const businessIdRef = useRef<string | null>(null);
  businessIdRef.current = businessId;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SlotFormValues>({ resolver: zodResolver(slotSchema) });

  const loadBusiness = useCallback(async () => {
    if (!profile?.id) return null;
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", profile.id)
      .single();
    if (error || !data) return null;
    return data.id;
  }, [profile?.id]);

  const loadSlots = useCallback(async (bId: string) => {
    setLoadingSlots(true);
    const { data, error } = await supabase
      .from("slots")
      .select("*")
      .eq("business_id", bId)
      .order("starts_at", { ascending: true });
    if (error) {
      setFetchError(error.message);
    } else {
      setSlots(data ?? []);
      setFetchError(null);
    }
    setLoadingSlots(false);
  }, []);

  useEffect(() => {
    (async () => {
      const bId = await loadBusiness();
      if (!bId) {
        setFetchError("no business profile found — create one first");
        setLoadingSlots(false);
        return;
      }
      setBusinessId(bId);
      await loadSlots(bId);
    })();
  }, [loadBusiness, loadSlots]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, () => {
        if (businessIdRef.current) loadSlots(businessIdRef.current);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        if (businessIdRef.current) loadSlots(businessIdRef.current);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist_entries" }, () => {
        if (businessIdRef.current) loadSlots(businessIdRef.current);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadSlots]);

  const onSubmit = async (values: SlotFormValues) => {
    if (!businessId) return;
    const { error } = await supabase.from("slots").insert({
      business_id:  businessId,
      title:        values.title,
      starts_at:    new Date(values.starts_at).toISOString(),
      ends_at:      new Date(values.ends_at).toISOString(),
      capacity:     values.capacity,
      booked_count: 0,
      status:       "available",
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`slot "${values.title}" created`);
    reset();
    setFormOpen(false);
    await loadSlots(businessId);
  };

  const confirmAndCancel = (slot: Slot) => {
    setConfirmCancel({ slotId: slot.id, title: slot.title });
  };

  const executeCancel = async () => {
    if (!confirmCancel || !businessId) return;
    const { error } = await supabase
      .from("slots")
      .update({ status: "cancelled" })
      .eq("id", confirmCancel.slotId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`"${confirmCancel.title}" cancelled`);
      await loadSlots(businessId);
    }
    setConfirmCancel(null);
  };

  const handleRestore = async (slotId: string) => {
    if (!businessId) return;
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    const status = slot.booked_count >= slot.capacity ? "booked" : "available";
    const { error } = await supabase.from("slots").update({ status }).eq("id", slotId);
    if (error) { toast.error(error.message); return; }
    toast.success(`"${slot.title}" restored`);
    await loadSlots(businessId);
  };

  const now = new Date().toISOString().slice(0, 16);
  const currentTime = new Date().getTime();

  // Filter slots
  const activeSlots = slots.filter((s) => new Date(s.ends_at).getTime() >= currentTime);
  const pastSlots = slots.filter((s) => new Date(s.ends_at).getTime() < currentTime);
  const displayedSlots = activeTab === "active" ? activeSlots : pastSlots;

  const stats = {
    total:     slots.length,
    open:      activeSlots.filter((s) => s.status === "available").length,
    full:      activeSlots.filter((s) => s.status === "booked").length,
    cancelled: slots.filter((s) => s.status === "cancelled").length,
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            "border-2 border-foreground rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest",
        }}
      />

      {/* cancel confirmation modal */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="border-b-2 border-foreground px-6 py-5">
              <p
                className="text-xs font-black uppercase tracking-[0.25em] text-foreground/40"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Destructive Action
              </p>
              <h2
                className="mt-1 text-xl font-black uppercase tracking-tight"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Cancel This Slot?
              </h2>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <p className="text-sm font-medium text-foreground/60">
                You are about to cancel{" "}
                <span className="font-black text-foreground">
                  "{confirmCancel.title}"
                </span>
                . Clients already in the waitlist will be notified. This cannot
                be undone automatically.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={executeCancel}
                  className="flex-1 bg-destructive text-destructive-foreground py-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
                >
                  Yes, Cancel Slot
                </button>
                <button
                  onClick={() => setConfirmCancel(null)}
                  className="flex-1 border-2 border-foreground py-4 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* clients roster modal */}
      {clientsTarget && (
        <ClientsModal
          target={clientsTarget}
          onClose={() => setClientsTarget(null)}
        />
      )}

      <header className="border-b-4 border-foreground px-6 py-5 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-[0.3em] text-foreground/40 uppercase">
            Smart Waitlist
          </span>
          <h1
            className="text-2xl font-black uppercase tracking-tight leading-none"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Admin Protocol
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-xs font-medium text-foreground/50 uppercase tracking-widest">
            {profile?.full_name ?? profile?.email}
          </span>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 border-2 border-foreground px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Exit
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 border-2 border-foreground divide-x-2 divide-foreground">
          <StatCell label="Total Slots" value={stats.total} />
          <StatCell label="Active Open"      value={stats.open}      accent="text-green-500" />
          <StatCell label="Active Full"      value={stats.full}      accent="text-yellow-400" />
          <StatCell label="Cancelled" value={stats.cancelled} accent="text-foreground/40" />
        </div>

        <section className="border-2 border-foreground">
          <button
            onClick={() => setFormOpen((p) => !p)}
            className="w-full flex items-center justify-between px-6 py-5 bg-foreground text-background hover:bg-primary hover:text-foreground transition-colors"
          >
            <span
              className="text-lg font-black uppercase tracking-widest"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {formOpen ? "— Close Form" : "+ Create New Slot"}
            </span>
            <Plus className={`h-5 w-5 transition-transform ${formOpen ? "rotate-45" : ""}`} />
          </button>

          {formOpen && (
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="px-6 py-7 flex flex-col gap-7 border-t-2 border-foreground"
            >
              <div className="grid sm:grid-cols-2 gap-7">
                <FormField label="Slot Title" error={errors.title?.message}>
                  <input
                    {...register("title")}
                    type="text"
                    placeholder="e.g. Morning Consultation"
                    className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full"
                  />
                </FormField>
                <FormField label="Capacity" error={errors.capacity?.message}>
                  <input
                    {...register("capacity")}
                    type="number"
                    min={1}
                    placeholder="1"
                    className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full"
                  />
                </FormField>
                <FormField label="Starts At" error={errors.starts_at?.message}>
                  <input
                    {...register("starts_at")}
                    type="datetime-local"
                    min={now}
                    className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full"
                  />
                </FormField>
                <FormField label="Ends At" error={errors.ends_at?.message}>
                  <input
                    {...register("ends_at")}
                    type="datetime-local"
                    min={now}
                    className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full"
                  />
                </FormField>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-3 bg-foreground py-5 px-8 text-lg font-bold uppercase tracking-widest text-background transition-all hover:bg-primary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
                  {isSubmitting ? "Saving..." : "Confirm Slot"}
                </button>
                <button
                  type="button"
                  onClick={() => { reset(); setFormOpen(false); }}
                  className="border-2 border-foreground py-5 px-6 text-sm font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
                >
                  Discard
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b-4 border-foreground pb-4">
             <div className="flex items-baseline gap-4">
              <h2
                className="text-2xl font-black uppercase tracking-widest leading-none"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Slots
              </h2>
              <span className="text-xs text-foreground/40 uppercase tracking-widest font-bold">
                {displayedSlots.length} items
              </span>
            </div>
            
            <div className="flex bg-foreground p-1 w-full sm:w-auto">
              <button
                onClick={() => setActiveTab("active")}
                className={`flex-1 sm:w-32 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                  activeTab === "active"
                    ? "bg-background text-foreground"
                    : "text-background hover:bg-background/20"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`flex-1 sm:w-32 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                  activeTab === "history"
                    ? "bg-background text-foreground"
                    : "text-background hover:bg-background/20"
                }`}
              >
                History
              </button>
            </div>
          </div>

          {fetchError && <ErrorBlock message={fetchError} />}

          {loadingSlots ? (
            <div className="flex flex-col gap-3">
              <SlotSkeleton />
              <SlotSkeleton />
              <SlotSkeleton />
            </div>
          ) : displayedSlots.length === 0 && !fetchError ? (
            <div className="border-2 border-dashed border-foreground/30 px-6 py-12 text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-foreground/30">
                 No slots found in this category
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayedSlots.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  isPast={activeTab === "history"}
                  onCancel={() => confirmAndCancel(slot)}
                  onRestore={handleRestore}
                  onViewClients={() =>
                    setClientsTarget({ slotId: slot.id, title: slot.title })
                  }
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// -- shared sub-components --

function SlotSkeleton() {
  return (
    <div className="border-2 border-foreground/20 border-l-4 border-l-foreground/10 px-5 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-4 w-40 animate-pulse bg-foreground/10" />
            <div className="h-4 w-14 animate-pulse bg-foreground/10" />
          </div>
          <div className="flex gap-5">
            <div className="h-3 w-28 animate-pulse bg-foreground/10" />
            <div className="h-3 w-28 animate-pulse bg-foreground/10" />
            <div className="h-3 w-16 animate-pulse bg-foreground/10" />
          </div>
          <div className="h-1.5 w-full animate-pulse bg-foreground/10" />
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="h-9 w-28 animate-pulse bg-foreground/10" />
          <div className="h-9 w-20 animate-pulse bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  accent = "text-foreground",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40">
        {label}
      </span>
      <span className={`text-3xl font-black leading-none ${accent}`}>{value}</span>
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs font-bold uppercase tracking-wider text-destructive">
          ↳ {error}
        </p>
      )}
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-destructive text-destructive-foreground p-5">
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
      <p className="text-base font-bold uppercase tracking-wide leading-snug">{message}</p>
    </div>
  );
}

function SlotCard({
  slot,
  isPast,
  onCancel,
  onRestore,
  onViewClients,
}: {
  slot: Slot;
  isPast: boolean;
  onCancel: () => void;
  onRestore: (id: string) => void;
  onViewClients: () => void;
}) {
  const starts  = new Date(slot.starts_at);
  const ends    = new Date(slot.ends_at);
  const fillPct = Math.round((slot.booked_count / slot.capacity) * 100);

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      month:  "short",
      day:    "numeric",
      hour:   "2-digit",
      minute: "2-digit",
    });

  return (
    <div className={`border-2 border-foreground ${isPast ? "border-l-4 border-l-foreground/20 opacity-70" : STATUS_STYLES[slot.status]} bg-background`}>
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-base font-black uppercase tracking-wide leading-none"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {slot.title}
            </span>
             <span className="text-[10px] font-black uppercase tracking-widest border border-foreground/30 px-2 py-0.5 text-foreground/50">
              {isPast ? "ENDED" : STATUS_LABEL[slot.status]}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-foreground/50 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />{fmt(starts)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />ends {fmt(ends)}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3 w-3" />{slot.booked_count} / {slot.capacity}
            </span>
          </div>
          <div className="h-1.5 w-full bg-foreground/10 mt-1">
             <div
              className={`h-full transition-all ${
                 isPast ? "bg-foreground/20"
                : slot.status === "cancelled"
                  ? "bg-foreground/20"
                  : fillPct >= 100
                  ? "bg-yellow-400"
                  : "bg-green-500"
              }`}
              style={{ width: `${Math.min(fillPct, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={onViewClients}
            className="flex items-center gap-1.5 border-2 border-foreground px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
          >
            <UsersRound className="h-3.5 w-3.5" />
            Clients
          </button>

          {!isPast && (
            slot.status !== "cancelled" ? (
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 border-2 border-foreground px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-destructive hover:border-destructive hover:text-destructive-foreground transition-colors"
              >
                <XSquare className="h-3.5 w-3.5" />
                Cancel
              </button>
            ) : (
              <button
                onClick={() => onRestore(slot.id)}
                className="flex items-center gap-1.5 border-2 border-foreground px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-green-500 hover:border-green-500 hover:text-background transition-colors"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Restore
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}