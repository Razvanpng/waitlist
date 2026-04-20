import { useEffect, useState, useCallback, useRef } from "react";
import { toast, Toaster } from "sonner";
import {
  Loader2, LogOut, CheckCircle2, Clock4, CalendarPlus,
  ListPlus, XCircle, UserMinus, AlertTriangle,
  Building2, ChevronDown, Calendar, Users, Hourglass, Smartphone
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authSlice";
import type { Database } from "@/types/database.types";

type Slot          = Database["public"]["Tables"]["slots"]["Row"];
type Business      = Database["public"]["Tables"]["businesses"]["Row"];
type Booking       = Database["public"]["Tables"]["bookings"]["Row"];
type WaitlistEntry = Database["public"]["Tables"]["waitlist_entries"]["Row"];

type SlotAction = "booked" | "waitlisted" | "book" | "join_waitlist" | "cancelled_slot";

type ConfirmKind = "cancel_booking" | "leave_waitlist";
interface ConfirmState {
  slotId: string;
  title: string;
  kind: ConfirmKind;
}

type TabMode = "active" | "history";

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

  const [businesses, setBusinesses]           = useState<Business[]>([]);
  const [selectedBiz, setSelectedBiz]         = useState<string>("");
  const [slots, setSlots]                     = useState<Slot[]>([]);
  const [bookings, setBookings]               = useState<Booking[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);

  const [loadingBiz, setLoadingBiz]     = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pageError, setPageError]       = useState<string | null>(null);
  
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>("active");

  // Phone modal state
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);
  // We keep a local copy of the phone to update immediately without waiting for auth refresh
  const [localPhone, setLocalPhone] = useState<string | null>(null);

  const selectedBizRef = useRef<string>("");
  selectedBizRef.current = selectedBiz;

  const profileIdRef = useRef<string | undefined>(undefined);
  profileIdRef.current = profile?.id;

  // Initialize local phone from profile
  useEffect(() => {
    if (profile && profile.phone !== undefined) {
      setLocalPhone(profile.phone);
    }
  }, [profile]);

  const bookedSlotIds = new Set(bookings.map((b) => b.slot_id));
  const waitlistedSlotIds = new Set(
    waitlistEntries
      .filter((w) => !["confirmed", "expired", "withdrawn"].includes(w.status))
      .map((w) => w.slot_id)
  );

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

  const loadSlots = useCallback(async (bizId: string) => {
    setLoadingSlots(true);
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

  const refresh = useCallback(async () => {
    await Promise.all([
      loadClientState(),
      selectedBizRef.current ? loadSlots(selectedBizRef.current) : Promise.resolve(),
    ]);
  }, [loadClientState, loadSlots]);

  useEffect(() => {
    const channel = supabase
      .channel("client-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, () => {
        if (selectedBizRef.current) loadSlots(selectedBizRef.current);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        if (profileIdRef.current) refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist_entries" }, () => {
        if (profileIdRef.current) refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadSlots, refresh]);

  // Interceptor function
  const requirePhone = (action: () => void) => {
    if (!localPhone || localPhone.trim() === "") {
      setPendingAction(() => action);
      setShowPhoneModal(true);
    } else {
      action();
    }
  };

  const savePhoneAndContinue = async () => {
    if (!profile?.id) return;
    if (phoneNumber.trim().length < 6) {
      toast.error("Please enter a valid phone number");
      return;
    }
    
    setSavingPhone(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone: phoneNumber })
      .eq("id", profile.id);

    setSavingPhone(false);

    if (error) {
      toast.error(error.message);
    } else {
      setLocalPhone(phoneNumber);
      setShowPhoneModal(false);
      toast.success("Phone number saved");
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    }
  };

  const handleBook = async (slotId: string, slotTitle: string) => {
    if (!profile?.id) return;
    setActionLoading(slotId);
    const { data, error } = await supabase.rpc("book_slot", {
      p_slot_id:   slotId,
      p_client_id: profile.id,
    });
    const res = data as any;
    if (error || res?.success === false) {
      toast.error(
        error?.message ??
        res?.error ??
        "booking failed"
      );
    } else {
      toast.success(`"${slotTitle}" booked`);
      await refresh();
    }
    setActionLoading(null);
  };

  const handleJoinWaitlist = async (slotId: string, slotTitle: string) => {
    if (!profile?.id) return;
    setActionLoading(slotId);
    const { data, error } = await supabase.rpc("join_waitlist", {
      p_slot_id:   slotId,
      p_client_id: profile.id,
    });
    const res = data as any;
    if (error || res?.success === false) {
      toast.error(
        error?.message ??
        res?.error ??
        "could not join waitlist"
      );
    } else {
      toast.success(`joined waitlist for "${slotTitle}"`);
      await refresh();
    }
    setActionLoading(null);
  };

  const executeCancelBooking = async () => {
    if (!confirmState || !profile?.id) return;
    const { slotId, title } = confirmState;
    setConfirmState(null);
    setActionLoading(slotId);

    const { error } = await supabase.rpc("cancel_booking", {
      p_slot_id: slotId,
      p_client_id: profile.id,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`booking for "${title}" cancelled`);
      await refresh();
    }
    setActionLoading(null);
  };

  const executeLeaveWaitlist = async () => {
    if (!confirmState || !profile?.id) return;
    const { slotId, title } = confirmState;
    setConfirmState(null);
    setActionLoading(slotId);

    const { error } = await supabase
      .from("waitlist_entries")
      .update({ status: "withdrawn" })
      .eq("slot_id", slotId)
      .eq("client_id", profile.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`left waitlist for "${title}"`);
      await refresh();
    }
    setActionLoading(null);
  };

  const handleConfirmAction = () => {
    if (!confirmState) return;
    if (confirmState.kind === "cancel_booking") executeCancelBooking();
    else executeLeaveWaitlist();
  };

  const CONFIRM_COPY: Record<ConfirmKind, { heading: string; body: (t: string) => string; cta: string }> = {
    cancel_booking: {
      heading: "Cancel This Booking?",
      body: (t) => `You are about to cancel your booking for "${t}". Your spot will be released to the next person on the waitlist.`,
      cta: "Yes, Cancel Booking",
    },
    leave_waitlist: {
      heading: "Leave The Waitlist?",
      body: (t) => `You are about to remove yourself from the waitlist for "${t}". You will lose your current position in the queue.`,
      cta: "Yes, Leave Waitlist",
    },
  };

  const selectedBizName = businesses.find((b) => b.id === selectedBiz)?.name ?? "";

  const currentTime = new Date().getTime();
  const activeSlots = slots.filter((s) => new Date(s.ends_at).getTime() >= currentTime);
  const pastSlots = slots.filter((s) => new Date(s.ends_at).getTime() < currentTime);
  const displayedSlots = activeTab === "active" ? activeSlots : pastSlots;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            "border-2 border-foreground rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest",
        }}
      />

      {/* Phone modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="border-b-2 border-foreground px-6 py-5">
              <p
                className="text-xs font-black uppercase tracking-[0.25em] text-foreground/40"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Contact Details
              </p>
              <h2
                className="mt-1 text-xl font-black uppercase tracking-tight flex items-center gap-2"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                <Smartphone className="h-5 w-5" /> Phone Required
              </h2>
            </div>
            <div className="px-6 py-5 flex flex-col gap-5">
              <p className="text-sm font-medium text-foreground/60">
                To reserve a spot or join the waitlist, please provide a valid phone number so the business can contact you if needed.
              </p>
              
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g. +40 700 000 000"
                  className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={savePhoneAndContinue}
                  disabled={savingPhone}
                  className="flex-1 flex items-center justify-center gap-2 bg-foreground text-background py-4 text-sm font-black uppercase tracking-widest hover:bg-primary hover:text-foreground transition-all disabled:opacity-50"
                >
                  {savingPhone && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save & Continue
                </button>
                <button
                  onClick={() => {
                    setShowPhoneModal(false);
                    setPendingAction(null);
                  }}
                  className="px-4 border-2 border-foreground py-4 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* confirmation modal */}
      {confirmState && (() => {
        const copy = CONFIRM_COPY[confirmState.kind];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
            <div className="w-full max-w-sm border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <div className="border-b-2 border-foreground px-6 py-5">
                <p
                  className="text-xs font-black uppercase tracking-[0.25em] text-foreground/40"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  Confirmation Required
                </p>
                <h2
                  className="mt-1 text-xl font-black uppercase tracking-tight"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  {copy.heading}
                </h2>
              </div>
              <div className="px-6 py-5 flex flex-col gap-4">
                <p className="text-sm font-medium text-foreground/60">
                  {copy.body(confirmState.title)}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleConfirmAction}
                    className="flex-1 bg-destructive text-destructive-foreground py-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
                  >
                    {copy.cta}
                  </button>
                  <button
                    onClick={() => setConfirmState(null)}
                    className="flex-1 border-2 border-foreground py-4 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
        <div className="grid grid-cols-3 border-2 border-foreground divide-x-2 divide-foreground">
          <StatCell label="My Bookings" value={bookings.length}        accent="text-green-500" />
          <StatCell label="Waitlists"   value={waitlistEntries.length} accent="text-yellow-400" />
          <StatCell label="Active Slots" value={activeSlots.length}    accent="text-foreground" />
        </div>

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
              <span className="text-sm font-bold uppercase tracking-widest">Loading…</span>
            </div>
          ) : (
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/40" />
              <select
                id="biz-select"
                value={selectedBiz}
                onChange={(e) => setSelectedBiz(e.target.value)}
                className="w-full appearance-none border-b-4 border-foreground bg-transparent pl-7 pr-8 py-3 text-xl font-bold outline-none focus:bg-foreground/5 cursor-pointer"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/50" />
            </div>
          )}
        </section>

        {pageError && <ErrorBlock message={pageError} />}

        {selectedBiz && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b-4 border-foreground pb-4">
              <div className="flex items-baseline gap-4">
                <h2
                  className="text-2xl font-black uppercase tracking-widest leading-none"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  {selectedBizName ? `${selectedBizName} — Slots` : "Available Slots"}
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

            {loadingSlots ? (
              <div className="flex flex-col gap-3">
                <SlotSkeleton />
                <SlotSkeleton />
                <SlotSkeleton />
              </div>
            ) : displayedSlots.length === 0 ? (
              <div className="border-2 border-dashed border-foreground/30 px-6 py-12 text-center">
                <p className="text-sm font-bold uppercase tracking-widest text-foreground/30">
                  No slots found in this category
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {displayedSlots.map((slot) => {
                  const action  = resolveAction(slot, bookedSlotIds, waitlistedSlotIds);
                  const loading = actionLoading === slot.id;
                  const entry   = waitlistEntries.find((w) => w.slot_id === slot.id);
                  return (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      action={action}
                      loading={loading}
                      isPast={activeTab === "history"}
                      waitlistPosition={entry?.position}
                      onBook={() => requirePhone(() => handleBook(slot.id, slot.title))}
                      onJoinWaitlist={() => requirePhone(() => handleJoinWaitlist(slot.id, slot.title))}
                      onCancelBooking={() =>
                        setConfirmState({ slotId: slot.id, title: slot.title, kind: "cancel_booking" })
                      }
                      onLeaveWaitlist={() =>
                        setConfirmState({ slotId: slot.id, title: slot.title, kind: "leave_waitlist" })
                      }
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

function SlotSkeleton() {
  return (
    <div className="border-2 border-foreground/20 border-l-4 border-l-foreground/10 px-5 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-4 w-44 animate-pulse bg-foreground/10" />
            <div className="h-4 w-16 animate-pulse bg-foreground/10" />
          </div>
          <div className="flex gap-5">
            <div className="h-3 w-32 animate-pulse bg-foreground/10" />
            <div className="h-3 w-28 animate-pulse bg-foreground/10" />
            <div className="h-3 w-16 animate-pulse bg-foreground/10" />
          </div>
          <div className="h-1 w-full animate-pulse bg-foreground/10" />
        </div>
        <div className="h-9 w-28 animate-pulse bg-foreground/10 shrink-0" />
      </div>
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40">{label}</span>
      <span className={`text-3xl font-black leading-none ${accent}`}>{value}</span>
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

const ACTION_BORDER: Record<SlotAction, string> = {
  booked:         "border-l-4 border-l-green-500",
  waitlisted:     "border-l-4 border-l-yellow-400",
  book:           "border-l-4 border-l-foreground/20",
  join_waitlist:  "border-l-4 border-l-orange-400",
  cancelled_slot: "border-l-4 border-l-foreground/10 opacity-40",
};

function SlotCard({
  slot, action, loading, isPast, waitlistPosition,
  onBook, onJoinWaitlist, onCancelBooking, onLeaveWaitlist,
}: {
  slot: Slot;
  action: SlotAction;
  loading: boolean;
  isPast: boolean;
  waitlistPosition?: number;
  onBook: () => void;
  onJoinWaitlist: () => void;
  onCancelBooking: () => void;
  onLeaveWaitlist: () => void;
}) {
  const starts  = new Date(slot.starts_at);
  const ends    = new Date(slot.ends_at);
  const fillPct = Math.min(100, Math.round((slot.booked_count / slot.capacity) * 100));

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className={`border-2 border-foreground ${isPast ? "border-l-4 border-l-foreground/20 opacity-70" : ACTION_BORDER[action]} bg-background`}>
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-base font-black uppercase tracking-wide leading-none truncate"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {slot.title}
            </span>
            <StatusPill action={action} position={waitlistPosition} isPast={isPast} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-foreground/50 uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />{fmt(starts)}</span>
            <span className="flex items-center gap-1.5"><Clock4 className="h-3 w-3" />ends {fmt(ends)}</span>
            <span className="flex items-center gap-1.5"><Users className="h-3 w-3" />{slot.booked_count}/{slot.capacity} booked</span>
          </div>
          <div className="h-1 w-full bg-foreground/10">
            <div
              className={`h-full transition-all ${isPast ? "bg-foreground/20" : fillPct >= 100 ? "bg-yellow-400" : "bg-green-500"}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>
        <div className="shrink-0">
          {!isPast && (
            <ActionButton
              action={action}
              loading={loading}
              onBook={onBook}
              onJoinWaitlist={onJoinWaitlist}
              onCancelBooking={onCancelBooking}
              onLeaveWaitlist={onLeaveWaitlist}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ action, position, isPast }: { action: SlotAction; position?: number, isPast?: boolean }) {
  if (isPast) {
    return (
       <span className="flex items-center gap-1 border text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border-foreground/20 text-foreground/40">
        ENDED
      </span>
    )
  }

  const configs: Record<SlotAction, { label: string; icon: React.ReactNode; cls: string }> = {
    booked:        { label: "Booked",                              icon: <CheckCircle2 className="h-3 w-3" />, cls: "border-green-500/40 text-green-500" },
    waitlisted:    { label: position ? `Queue #${position}` : "On Waitlist", icon: <Hourglass className="h-3 w-3" />,    cls: "border-yellow-400/40 text-yellow-400" },
    book:          { label: "Available",                           icon: <CalendarPlus className="h-3 w-3" />, cls: "border-foreground/20 text-foreground/40" },
    join_waitlist: { label: "Full",                                icon: <ListPlus className="h-3 w-3" />,     cls: "border-orange-400/40 text-orange-400" },
    cancelled_slot:{ label: "Cancelled",                           icon: <XCircle className="h-3 w-3" />,      cls: "border-foreground/20 text-foreground/30" },
  };
  const c = configs[action];
  return (
    <span className={`flex items-center gap-1 border text-[10px] font-black uppercase tracking-widest px-2 py-0.5 ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

function ActionButton({
  action, loading, onBook, onJoinWaitlist, onCancelBooking, onLeaveWaitlist,
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
        <Loader2 className="h-3.5 w-3.5 animate-spin" />Working…
      </button>
    );
  }
  if (action === "booked") {
    return (
      <button onClick={onCancelBooking} className={`${base} hover:bg-destructive hover:border-destructive hover:text-destructive-foreground`}>
        <XCircle className="h-3.5 w-3.5" />Cancel Booking
      </button>
    );
  }
  if (action === "waitlisted") {
    return (
      <button onClick={onLeaveWaitlist} className={`${base} hover:bg-yellow-400/10 hover:border-yellow-400 hover:text-yellow-400`}>
        <UserMinus className="h-3.5 w-3.5" />Leave Waitlist
      </button>
    );
  }
  if (action === "book") {
    return (
      <button onClick={onBook} className={`${base} bg-foreground text-background hover:bg-primary hover:text-foreground`}>
        <CalendarPlus className="h-3.5 w-3.5" />Book Slot
      </button>
    );
  }
  return (
    <button onClick={onJoinWaitlist} className={`${base} hover:bg-foreground hover:text-background`}>
      <ListPlus className="h-3.5 w-3.5" />Join Waitlist
    </button>
  );
}