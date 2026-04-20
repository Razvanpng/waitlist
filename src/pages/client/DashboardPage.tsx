import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  LogOut,
  CheckCircle2,
  Clock4,
  CalendarPlus,
  ListPlus,
  XCircle,
  UserMinus,
  AlertTriangle,
  Building2,
  ChevronDown,
  Calendar,
  Users,
  Hourglass,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authSlice";
import type { Database } from "@/types/database.types";

type Slot = Database["public"]["Tables"]["slots"]["Row"];
type Business = Database["public"]["Tables"]["businesses"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type WaitlistEntry = Database["public"]["Tables"]["waitlist_entries"]["Row"];

type SlotAction =
  | "booked"
  | "waitlisted"
  | "book"
  | "join_waitlist"
  | "cancelled_slot";

function resolveAction(
  slot: Slot,
  bookingIds: Set<string>,
  waitlistIds: Set<string>
): SlotAction {
  if (slot.status === "cancelled") return "cancelled_slot";
  if (bookingIds.has(slot.id)) return "booked";
  if (waitlistIds.has(slot.id)) return "waitlisted";
  if (slot.booked_count < slot.capacity) return "book";
  return "join_waitlist";
}

export function ClientDashboardPage() {
  const { profile, signOut } = useAuthStore();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBiz, setSelectedBiz] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);

  const [loadingBiz, setLoadingBiz] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const bookedSlotIds = new Set(bookings.map((b) => b.slot_id));
  const waitlistedSlotIds = new Set(
    waitlistEntries
      .filter((w) => !["confirmed", "expired", "withdrawn"].includes(w.status))
      .map((w) => w.slot_id)
  );

  // load businesses on mount
  useEffect(() => {
    (async () => {
      setLoadingBiz(true);
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .order("name");
      if (error) {
        setPageError(error.message);
      } else {
        setBusinesses(data ?? []);
        if (data?.length) setSelectedBiz(data[0].id);
      }
      setLoadingBiz(false);
    })();
  }, []);

  // load client's bookings + waitlist entries
  const loadClientState = useCallback(async () => {
    if (!profile?.id) return;
    const [{ data: bData }, { data: wData }] = await Promise.all([
      supabase.from("bookings").select("*").eq("client_id", profile.id),
      supabase
        .from("waitlist_entries")
        .select("*")
        .eq("client_id", profile.id)
        .not("status", "in", '("confirmed","expired","withdrawn")'),
    ]);
    if (bData) setBookings(bData);
    if (wData) setWaitlistEntries(wData);
  }, [profile?.id]);

  // load slots for selected business
  const loadSlots = useCallback(async (bizId: string) => {
    setLoadingSlots(true);
    setActionError(null);
    const { data, error } = await supabase
      .from("slots")
      .select("*")
      .eq("business_id", bizId)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true });
    if (error) {
      setPageError(error.message);
    } else {
      setSlots(data ?? []);
    }
    setLoadingSlots(false);
  }, []);

  useEffect(() => {
    if (!selectedBiz) return;
    loadSlots(selectedBiz);
  }, [selectedBiz, loadSlots]);

  useEffect(() => {
    loadClientState();
  }, [loadClientState]);

  const refresh = async () => {
    await Promise.all([
      loadClientState(),
      selectedBiz ? loadSlots(selectedBiz) : Promise.resolve(),
    ]);
  };

  // -- actions --

  const handleBook = async (slotId: string) => {
    if (!profile?.id) return;
    setActionLoading(slotId);
    setActionError(null);

    const { data, error } = await supabase.rpc("book_slot", {
      p_slot_id: slotId,
      p_client_id: profile.id,
    });

    if (error || (data as { success: boolean })?.success === false) {
      const msg =
        error?.message ??
        (data as { error?: string })?.error ??
        "booking failed";
      setActionError(msg);
    } else {
      await refresh();
    }
    setActionLoading(null);
  };

  const handleJoinWaitlist = async (slotId: string) => {
    if (!profile?.id) return;
    setActionLoading(slotId);
    setActionError(null);

    const { data, error } = await supabase.rpc("join_waitlist", {
      p_slot_id: slotId,
      p_client_id: profile.id,
    });

    if (error || (data as { success: boolean })?.success === false) {
      const msg =
        error?.message ??
        (data as { error?: string })?.error ??
        "could not join waitlist";
      setActionError(msg);
    } else {
      await refresh();
    }
    setActionLoading(null);
  };

  const handleCancelBooking = async (slotId: string) => {
    if (!profile?.id) return;
    setActionLoading(slotId);
    setActionError(null);

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("slot_id", slotId)
      .eq("client_id", profile.id);

    if (error) {
      setActionError(error.message);
    } else {
      // decrement booked_count + restore status
      const slot = slots.find((s) => s.id === slotId);
      if (slot) {
        const newCount = Math.max(0, slot.booked_count - 1);
        await supabase
          .from("slots")
          .update({ booked_count: newCount, status: "available" })
          .eq("id", slotId);
      }
      await refresh();
    }
    setActionLoading(null);
  };

  const handleLeaveWaitlist = async (slotId: string) => {
    if (!profile?.id) return;
    setActionLoading(slotId);
    setActionError(null);

    const { error } = await supabase
      .from("waitlist_entries")
      .update({ status: "withdrawn" })
      .eq("slot_id", slotId)
      .eq("client_id", profile.id);

    if (error) {
      setActionError(error.message);
    } else {
      await refresh();
    }
    setActionLoading(null);
  };

  const selectedBizName =
    businesses.find((b) => b.id === selectedBiz)?.name ?? "";

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* header */}
      <header className="border-b-4 border-foreground px-6 py-5 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-[0.3em] text-foreground/40 uppercase">
            Smart Waitlist
          </span>
          <h1
            className="text-2xl font-black uppercase tracking-tight leading-none"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Client Terminal
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

      <main className="mx-auto max-w-4xl px-6 py-10 flex flex-col gap-10">
        {/* stat strip */}
        <div className="grid grid-cols-3 border-2 border-foreground divide-x-2 divide-foreground">
          <StatCell
            label="My Bookings"
            value={bookings.length}
            accent="text-green-500"
          />
          <StatCell
            label="Waitlists"
            value={waitlistEntries.length}
            accent="text-yellow-400"
          />
          <StatCell
            label="Slots Shown"
            value={slots.length}
            accent="text-foreground"
          />
        </div>

        {/* business selector */}
        <section className="flex flex-col gap-3">
          <label
            className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50"
            htmlFor="biz-select"
          >
            Select Business
          </label>

          {loadingBiz ? (
            <div className="flex items-center gap-2 border-b-4 border-foreground py-3 text-foreground/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-bold uppercase tracking-widest">
                Loading…
              </span>
            </div>
          ) : (
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/40" />
              <select
                id="biz-select"
                value={selectedBiz}
                onChange={(e) => setSelectedBiz(e.target.value)}
                className="
                  w-full appearance-none border-b-4 border-foreground bg-transparent
                  pl-7 pr-8 py-3 text-xl font-bold outline-none
                  focus:bg-foreground/5 cursor-pointer
                "
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/50" />
            </div>
          )}
        </section>

        {/* errors */}
        {pageError && <ErrorBlock message={pageError} />}
        {actionError && <ErrorBlock message={actionError} />}

        {/* slot list */}
        {selectedBiz && (
          <section className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2
                className="text-xl font-black uppercase tracking-widest"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                {selectedBizName
                  ? `${selectedBizName} — Slots`
                  : "Available Slots"}
              </h2>
              <span className="text-xs text-foreground/40 uppercase tracking-widest font-bold">
                {slots.length} listed
              </span>
            </div>

            {loadingSlots ? (
              <div className="flex items-center gap-3 border-2 border-foreground px-6 py-10 text-foreground/40">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-bold uppercase tracking-widest">
                  Fetching slots…
                </span>
              </div>
            ) : slots.length === 0 ? (
              <div className="border-2 border-dashed border-foreground/30 px-6 py-12 text-center">
                <p className="text-sm font-bold uppercase tracking-widest text-foreground/30">
                  No open slots for this business
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {slots.map((slot) => {
                  const action = resolveAction(
                    slot,
                    bookedSlotIds,
                    waitlistedSlotIds
                  );
                  const loading = actionLoading === slot.id;
                  const entry = waitlistEntries.find(
                    (w) => w.slot_id === slot.id
                  );

                  return (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      action={action}
                      loading={loading}
                      waitlistPosition={entry?.position}
                      onBook={() => handleBook(slot.id)}
                      onJoinWaitlist={() => handleJoinWaitlist(slot.id)}
                      onCancelBooking={() => handleCancelBooking(slot.id)}
                      onLeaveWaitlist={() => handleLeaveWaitlist(slot.id)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

// -- sub-components --

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40">
        {label}
      </span>
      <span className={`text-3xl font-black leading-none ${accent}`}>
        {value}
      </span>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-destructive text-destructive-foreground p-5">
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
      <p className="text-base font-bold uppercase tracking-wide leading-snug">
        {message}
      </p>
    </div>
  );
}

const ACTION_BORDER: Record<SlotAction, string> = {
  booked:        "border-l-4 border-l-green-500",
  waitlisted:    "border-l-4 border-l-yellow-400",
  book:          "border-l-4 border-l-foreground/20",
  join_waitlist: "border-l-4 border-l-orange-400",
  cancelled_slot:"border-l-4 border-l-foreground/10 opacity-40",
};

function SlotCard({
  slot,
  action,
  loading,
  waitlistPosition,
  onBook,
  onJoinWaitlist,
  onCancelBooking,
  onLeaveWaitlist,
}: {
  slot: Slot;
  action: SlotAction;
  loading: boolean;
  waitlistPosition?: number;
  onBook: () => void;
  onJoinWaitlist: () => void;
  onCancelBooking: () => void;
  onLeaveWaitlist: () => void;
}) {
  const starts = new Date(slot.starts_at);
  const ends = new Date(slot.ends_at);
  const fillPct = Math.min(
    100,
    Math.round((slot.booked_count / slot.capacity) * 100)
  );

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div
      className={`border-2 border-foreground bg-background ${ACTION_BORDER[action]}`}
    >
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* info block */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-base font-black uppercase tracking-wide leading-none truncate"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {slot.title}
            </span>
            <StatusPill action={action} position={waitlistPosition} />
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-foreground/50 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              {fmt(starts)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock4 className="h-3 w-3" />
              ends {fmt(ends)}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              {slot.booked_count}/{slot.capacity} booked
            </span>
          </div>

          {/* fill bar */}
          <div className="h-1 w-full bg-foreground/10">
            <div
              className={`h-full transition-all ${
                fillPct >= 100 ? "bg-yellow-400" : "bg-green-500"
              }`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>

        {/* action button */}
        <div className="shrink-0">
          <ActionButton
            action={action}
            loading={loading}
            onBook={onBook}
            onJoinWaitlist={onJoinWaitlist}
            onCancelBooking={onCancelBooking}
            onLeaveWaitlist={onLeaveWaitlist}
          />
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  action,
  position,
}: {
  action: SlotAction;
  position?: number;
}) {
  const configs: Record<
    SlotAction,
    { label: string; icon: React.ReactNode; cls: string }
  > = {
    booked: {
      label: "Booked",
      icon: <CheckCircle2 className="h-3 w-3" />,
      cls: "border-green-500/40 text-green-500",
    },
    waitlisted: {
      label: position ? `Queue #${position}` : "On Waitlist",
      icon: <Hourglass className="h-3 w-3" />,
      cls: "border-yellow-400/40 text-yellow-400",
    },
    book: {
      label: "Available",
      icon: <CalendarPlus className="h-3 w-3" />,
      cls: "border-foreground/20 text-foreground/40",
    },
    join_waitlist: {
      label: "Full",
      icon: <ListPlus className="h-3 w-3" />,
      cls: "border-orange-400/40 text-orange-400",
    },
    cancelled_slot: {
      label: "Cancelled",
      icon: <XCircle className="h-3 w-3" />,
      cls: "border-foreground/20 text-foreground/30",
    },
  };

  const c = configs[action];
  return (
    <span
      className={`flex items-center gap-1 border text-[10px] font-black uppercase tracking-widest px-2 py-0.5 ${c.cls}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function ActionButton({
  action,
  loading,
  onBook,
  onJoinWaitlist,
  onCancelBooking,
  onLeaveWaitlist,
}: {
  action: SlotAction;
  loading: boolean;
  onBook: () => void;
  onJoinWaitlist: () => void;
  onCancelBooking: () => void;
  onLeaveWaitlist: () => void;
}) {
  if (action === "cancelled_slot") return null;

  const base =
    "flex items-center gap-2 border-2 border-foreground px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";

  if (loading) {
    return (
      <button disabled className={base}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Working…
      </button>
    );
  }

  if (action === "booked") {
    return (
      <button
        onClick={onCancelBooking}
        className={`${base} hover:bg-destructive hover:border-destructive hover:text-destructive-foreground`}
      >
        <XCircle className="h-3.5 w-3.5" />
        Cancel Booking
      </button>
    );
  }

  if (action === "waitlisted") {
    return (
      <button
        onClick={onLeaveWaitlist}
        className={`${base} hover:bg-yellow-400/10 hover:border-yellow-400 hover:text-yellow-400`}
      >
        <UserMinus className="h-3.5 w-3.5" />
        Leave Waitlist
      </button>
    );
  }

  if (action === "book") {
    return (
      <button
        onClick={onBook}
        className={`${base} bg-foreground text-background hover:bg-primary hover:text-foreground`}
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        Book Slot
      </button>
    );
  }

  // join_waitlist
  return (
    <button
      onClick={onJoinWaitlist}
      className={`${base} hover:bg-foreground hover:text-background`}
    >
      <ListPlus className="h-3.5 w-3.5" />
      Join Waitlist
    </button>
  );
}