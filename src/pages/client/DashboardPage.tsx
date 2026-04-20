import { useEffect, useState, useCallback, useRef } from "react";
import { toast, Toaster } from "sonner";
import { Loader2, LogOut, Building2, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authSlice";

import { StatCell, SlotSkeleton, ErrorBlock } from "@/components/ui/DashboardUI";
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

  const handleBook = async (slotId: string, title: string) => {
    if (!profile?.id) return;
    setActionLoading(slotId);
    const { data, error } = await supabase.rpc("book_slot", { p_slot_id: slotId, p_client_id: profile.id });
    const res = data as any;
    if (error || res?.success === false) toast.error(error?.message || res?.error || "Booking failed");
    else { toast.success(`"${title}" booked`); await refresh(); }
    setActionLoading(null);
  };

  const handleJoinWaitlist = async (slotId: string, title: string) => {
    if (!profile?.id) return;
    setActionLoading(slotId);
    const { data, error } = await supabase.rpc("join_waitlist", { p_slot_id: slotId, p_client_id: profile.id });
    const res = data as any;
    if (error || res?.success === false) toast.error(error?.message || res?.error || "Waitlist failed");
    else { toast.success(`Joined waitlist for "${title}"`); await refresh(); }
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

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Toaster position="bottom-right" toastOptions={{ className: "border-2 border-foreground rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest" }} />

      {showPhoneModal && <PhoneModal phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber} onSave={savePhoneAndContinue} onCancel={() => setShowPhoneModal(false)} isSaving={savingPhone} />}
      {confirmState && <ActionConfirmModal state={confirmState} onConfirm={confirmState.kind === "cancel_booking" ? executeCancelBooking : executeLeaveWaitlist} onCancel={() => setConfirmState(null)} />}

      <header className="border-b-4 border-foreground px-6 py-5 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-[0.3em] text-foreground/40 uppercase">Smart Waitlist</span>
          <h1 className="text-2xl font-black uppercase tracking-tight leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>Client Terminal</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-xs font-medium text-foreground/50 uppercase tracking-widest">{profile?.full_name ?? profile?.email}</span>
          <button onClick={() => signOut()} className="flex items-center gap-2 border-2 border-foreground px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"><LogOut className="h-3.5 w-3.5" /> Exit</button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 flex flex-col gap-10">
        <div className="grid grid-cols-3 border-2 border-foreground divide-x-2 divide-foreground">
          <StatCell label="My Bookings" value={bookings.length} accent="text-green-500" />
          <StatCell label="Waitlists" value={waitlistEntries.length} accent="text-yellow-400" />
          <StatCell label="Active Slots" value={activeSlots.length} accent="text-foreground" />
        </div>

        <section className="flex flex-col gap-3">
          <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50">Select Business</label>
          {loadingBiz ? (
            <div className="flex items-center gap-2 border-b-4 border-foreground py-3 text-foreground/40"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm font-bold uppercase tracking-widest">Loading…</span></div>
          ) : (
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/40" />
              <select value={selectedBiz} onChange={(e) => setSelectedBiz(e.target.value)} className="w-full appearance-none border-b-4 border-foreground bg-transparent pl-7 pr-8 py-3 text-xl font-bold outline-none focus:bg-foreground/5 cursor-pointer">
                {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
                <h2 className="text-2xl font-black uppercase tracking-widest leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>Available Slots</h2>
                <span className="text-xs text-foreground/40 uppercase tracking-widest font-bold">{displayedSlots.length} items</span>
              </div>
               <div className="flex bg-foreground p-1 w-full sm:w-auto">
                <button onClick={() => setActiveTab("active")} className={`flex-1 sm:w-32 py-2 text-xs font-black uppercase tracking-widest transition-colors ${activeTab === "active" ? "bg-background text-foreground" : "text-background hover:bg-background/20"}`}>Active</button>
                <button onClick={() => setActiveTab("history")} className={`flex-1 sm:w-32 py-2 text-xs font-black uppercase tracking-widest transition-colors ${activeTab === "history" ? "bg-background text-foreground" : "text-background hover:bg-background/20"}`}>History</button>
              </div>
            </div>

            {loadingSlots ? (
              <div className="flex flex-col gap-3"><SlotSkeleton /><SlotSkeleton /><SlotSkeleton /></div>
            ) : displayedSlots.length === 0 ? (
              <div className="border-2 border-dashed border-foreground/30 px-6 py-12 text-center"><p className="text-sm font-bold uppercase tracking-widest text-foreground/30">No slots found</p></div>
            ) : (
              <div className="flex flex-col gap-3">
                {displayedSlots.map((slot) => {
                  const action = resolveAction(slot, bookedSlotIds, waitlistedSlotIds);
                  const entry = waitlistEntries.find((w) => w.slot_id === slot.id);
                  return (
                    <ClientSlotCard key={slot.id} slot={slot} action={action} loading={actionLoading === slot.id} isPast={activeTab === "history"} waitlistPosition={entry?.position} onBook={() => requirePhone(() => handleBook(slot.id, slot.title))} onJoinWaitlist={() => requirePhone(() => handleJoinWaitlist(slot.id, slot.title))} onCancelBooking={() => setConfirmState({ slotId: slot.id, title: slot.title, kind: "cancel_booking" })} onLeaveWaitlist={() => setConfirmState({ slotId: slot.id, title: slot.title, kind: "leave_waitlist" })} />
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