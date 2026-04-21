import { useEffect, useState, useCallback, useRef } from "react";
import { toast, Toaster } from "sonner";
import { Loader2, LogOut, Building2, ChevronDown, UserCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authSlice";

import { StatCell, SlotSkeleton, ErrorBlock } from "@/components/ui/DashboardUI";
import { ProfileSettingsModal } from "@/components/ui/ProfileSettingsModal";
import { 
  Slot, SlotAction, ConfirmState, PhoneModal, ActionConfirmModal, ClientSlotCard 
} from "./components/ClientComponents";

type TabMode = "active" | "history";

function resolveAction(slot: Slot, bookingIds: Set<string>, waitlistIds: Set<string>): SlotAction {
  if (slot.status === "cancelled") return "cancelled_slot";
  if (bookingIds.has(slot.id)) return "booked";
  if (waitlistIds.has(slot.id)) return "waitlisted";
  return slot.booked_count < slot.capacity ? "book" : "join_waitlist";
}

export function ClientDashboardPage() {
  const { profile, signOut } = useAuthStore();

  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selectedBiz, setSelectedBiz] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<any[]>([]);

  const [loadingBiz, setLoadingBiz] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>("active");

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);
  const [localPhone, setLocalPhone] = useState<string | null>(null);

  const selectedBizRef = useRef<string>("");
  selectedBizRef.current = selectedBiz;
  const profileIdRef = useRef<string | undefined>(undefined);
  profileIdRef.current = profile?.id;

  useEffect(() => { if (profile) setLocalPhone(profile.phone); }, [profile]);

  const bookedSlotIds = new Set(bookings.map((b) => b.slot_id));
  const waitlistedSlotIds = new Set(waitlistEntries.filter((w) => !["confirmed", "expired", "withdrawn"].includes(w.status)).map((w) => w.slot_id));

  useEffect(() => {
    (async () => {
      setLoadingBiz(true);
      const { data, error } = await supabase.from("businesses").select("*").order("name");
      if (error) setPageError(error.message);
      else { setBusinesses(data ?? []); if (data?.length) setSelectedBiz(data[0].id); }
      setLoadingBiz(false);
    })();
  }, []);

  const loadClientState = useCallback(async () => {
    if (!profile?.id) return;
    const [{ data: bData }, { data: wData }] = await Promise.all([
      supabase.from("bookings").select("*").eq("client_id", profile.id),
      supabase.from("waitlist_entries").select("*").eq("client_id", profile.id).not("status", "in", '("confirmed","expired","withdrawn")'),
    ]);
    if (bData) setBookings(bData);
    if (wData) setWaitlistEntries(wData);
  }, [profile?.id]);

  const loadSlots = useCallback(async (bizId: string) => {
    setLoadingSlots(true);
    const { data, error } = await supabase.from("slots").select("*").eq("business_id", bizId).neq("status", "cancelled").order("starts_at", { ascending: true });
    if (error) setPageError(error.message); else setSlots(data ?? []);
    setLoadingSlots(false);
  }, []);

  useEffect(() => { if (selectedBiz) loadSlots(selectedBiz); }, [selectedBiz, loadSlots]);
  useEffect(() => { loadClientState(); }, [loadClientState]);

  const refresh = useCallback(async () => {
    await Promise.all([loadClientState(), selectedBizRef.current ? loadSlots(selectedBizRef.current) : Promise.resolve()]);
  }, [loadClientState, loadSlots]);

  useEffect(() => {
    const channel = supabase.channel("client-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, () => selectedBizRef.current && loadSlots(selectedBizRef.current))
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => profileIdRef.current && refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist_entries" }, () => profileIdRef.current && refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadSlots, refresh]);

  const requirePhone = (action: () => void) => {
    if (!localPhone || localPhone.trim() === "") { setPendingAction(() => action); setShowPhoneModal(true); } 
    else action();
  };

  const savePhoneAndContinue = async () => {
    if (!profile?.id) return;
    if (phoneNumber.trim().length < 6) { toast.error("Enter a valid phone number"); return; }
    setSavingPhone(true);
    const { error } = await supabase.from("profiles").update({ phone: phoneNumber }).eq("id", profile.id);
    setSavingPhone(false);
    if (error) toast.error(error.message);
    else { setLocalPhone(phoneNumber); setShowPhoneModal(false); toast.success("Phone saved"); if (pendingAction) { pendingAction(); setPendingAction(null); } }
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
      toast.error(error?.message ?? res?.error ?? "booking failed");
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
      toast.error(error?.message ?? res?.error ?? "could not join waitlist");
    } else {
      toast.success(`joined waitlist for "${slotTitle}"`);
      await refresh();
    }
    setActionLoading(null);
  };

  const executeCancelBooking = async () => {
    if (!confirmState || !profile?.id) return;
    const { slotId, title } = confirmState; setConfirmState(null); setActionLoading(slotId);
    const { error } = await supabase.rpc("cancel_booking", { p_slot_id: slotId, p_client_id: profile.id });
    if (error) toast.error(error.message); else { toast.success(`Booking for "${title}" cancelled`); await refresh(); }
    setActionLoading(null);
  };

  const executeLeaveWaitlist = async () => {
    if (!confirmState || !profile?.id) return;
    const { slotId, title } = confirmState; setConfirmState(null); setActionLoading(slotId);
    const { error } = await supabase.from("waitlist_entries").update({ status: "withdrawn" }).eq("slot_id", slotId).eq("client_id", profile.id);
    if (error) toast.error(error.message); else { toast.success(`Left waitlist for "${title}"`); await refresh(); }
    setActionLoading(null);
  };

  const currentTime = new Date().getTime();
  const activeSlots = slots.filter((s) => new Date(s.ends_at).getTime() >= currentTime);
  const pastSlots = slots.filter((s) => new Date(s.ends_at).getTime() < currentTime);
  const displayedSlots = activeTab === "active" ? activeSlots : pastSlots;

  const selectedBizName = businesses.find((b) => b.id === selectedBiz)?.name ?? "";

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col lg:flex-row">
      <Toaster position="bottom-right" toastOptions={{ className: "border-2 border-foreground rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest" }} />

      {showProfileSettings && <ProfileSettingsModal profile={profile} onClose={() => setShowProfileSettings(false)} />}
      {showPhoneModal && <PhoneModal phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber} onSave={savePhoneAndContinue} onCancel={() => setShowPhoneModal(false)} isSaving={savingPhone} />}
      
      {confirmState && (
        <ActionConfirmModal 
          state={confirmState} 
          onConfirm={confirmState.kind === "cancel_booking" ? executeCancelBooking : executeLeaveWaitlist} 
          onCancel={() => setConfirmState(null)} 
        />
      )}

      {/* ── LEFT SIDEBAR ── */}
      <aside className="
        lg:w-[380px] lg:shrink-0 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto
        lg:border-r-4 border-b-4 lg:border-b-0 border-foreground
        flex flex-col
      ">
        <div className="p-6 border-b-2 border-foreground flex flex-col gap-6">
          <div>
            <span className="text-[10px] font-bold tracking-[0.3em] text-foreground/40 uppercase">
              Smart Waitlist
            </span>
            <h1
              className="text-3xl font-black uppercase tracking-tight leading-none mt-1"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Client<br />Terminal
            </h1>
          </div>

          <div className="flex flex-col gap-3">
             <button
              onClick={() => setShowProfileSettings(true)}
              className="flex items-center gap-2 border-2 border-foreground px-3 py-3 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors justify-center"
            >
              <UserCircle className="h-4 w-4" />
              {profile?.full_name ?? profile?.email}
            </button>
            <button
              onClick={() => signOut()}
              className="flex items-center justify-center gap-2 border-2 border-foreground px-3 py-3 text-xs font-bold uppercase tracking-widest hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Exit
            </button>
          </div>
        </div>

        <div className="p-6 border-b-2 border-foreground flex flex-col gap-3">
          <span
            className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/30"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Business
          </span>

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
                className="w-full appearance-none border-b-4 border-foreground bg-transparent pl-7 pr-8 py-3 text-lg font-bold outline-none focus:bg-foreground/5 cursor-pointer"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/50" />
            </div>
          )}
        </div>

        <div className="p-6 flex flex-col gap-3">
          <span
            className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/30"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            My Activity
          </span>

          <div className="grid grid-cols-2 border-2 border-foreground divide-x-2 divide-y-2 divide-foreground">
            <StatCell label="Bookings"  value={bookings.length}        accent="text-green-500" />
            <StatCell label="Waitlists" value={waitlistEntries.length} accent="text-yellow-400" />
            <StatCell label="Available" value={slots.filter((s) => s.booked_count < s.capacity).length} />
            <StatCell label="Full"      value={slots.filter((s) => s.status === "booked").length} accent="text-foreground/40" />
          </div>
        </div>

        <div className="mt-auto px-6 pb-6 pt-6">
          <div className="border-2 border-foreground/20 px-4 py-3 flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/40">
              Realtime Active
            </span>
          </div>
        </div>
      </aside>

      {/* ── RIGHT MAIN CONTENT ── */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="border-b-2 border-foreground px-6 lg:px-10 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <div className="flex items-baseline gap-4">
              <h2
                className="text-xl font-black uppercase tracking-widest leading-none"
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

        <div className="flex-1 px-6 lg:px-10 py-8 flex flex-col gap-6">
          {pageError && <ErrorBlock message={pageError} />}

          {!selectedBiz ? (
            <div className="border-2 border-dashed border-foreground/20 px-6 py-16 text-center">
              <p className="text-sm font-black uppercase tracking-widest text-foreground/25">
                Select a business to view slots
              </p>
            </div>
          ) : loadingSlots ? (
            <div className="flex flex-col gap-3">
              <SlotSkeleton />
              <SlotSkeleton />
              <SlotSkeleton />
            </div>
          ) : displayedSlots.length === 0 ? (
            <div className="border-2 border-dashed border-foreground/20 px-6 py-16 text-center">
              <p className="text-sm font-black uppercase tracking-widest text-foreground/25">
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
                  <ClientSlotCard
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
        </div>
      </main>
    </div>
  );
}