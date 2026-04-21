import { useEffect, useState, useCallback, useRef } from "react";
import { toast, Toaster } from "sonner";
import { Loader2, LogOut, Building2, ChevronDown, UserCircle, QrCode } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authSlice";

import { SlotSkeleton, ErrorBlock } from "@/components/ui/DashboardUI";
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
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, () => { if (selectedBizRef.current) loadSlots(selectedBizRef.current); })
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => { if (profileIdRef.current) refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist_entries" }, () => { if (profileIdRef.current) refresh(); })
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
    <div className="min-h-screen lg:h-screen w-full bg-background text-foreground font-sans p-3 sm:p-6 lg:p-8 box-border flex flex-col">
      <Toaster position="bottom-right" toastOptions={{ className: "border-2 border-foreground rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest" }} />

      {/* Modals */}
      {showProfileSettings && <ProfileSettingsModal profile={profile} onClose={() => setShowProfileSettings(false)} />}
      {showPhoneModal && <PhoneModal phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber} onSave={savePhoneAndContinue} onCancel={() => setShowPhoneModal(false)} isSaving={savingPhone} />}
      {confirmState && <ActionConfirmModal state={confirmState} onConfirm={confirmState.kind === "cancel_booking" ? executeCancelBooking : executeLeaveWaitlist} onCancel={() => setConfirmState(null)} />}

      {/* Main Frame (Mondrian Container) */}
      <div className="w-full flex-1 border-4 border-foreground flex flex-col lg:flex-row shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-background lg:overflow-hidden">
        
        {/* ── LEFT COLUMN (GRID) ── */}
        <aside className="lg:w-[420px] flex flex-col border-b-4 lg:border-b-0 lg:border-r-4 border-foreground shrink-0 bg-background z-10">
          
          {/* Brutalist Title Box */}
          <div className="p-6 lg:p-8 border-b-4 border-foreground flex flex-col justify-end min-h-[220px] lg:min-h-[280px] bg-primary text-foreground relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <QrCode className="w-32 h-32" />
            </div>
            <span className="text-[10px] font-black tracking-[0.4em] uppercase opacity-70 mb-auto relative z-10">
              Smart Waitlist
            </span>
            <h1 className="text-5xl lg:text-[4.5rem] font-black uppercase tracking-tighter leading-[0.85] relative z-10" style={{ fontFamily: "'Syne', sans-serif" }}>
              Client<br/>Terminal
            </h1>
          </div>

          {/* User Auth Box */}
          <div className="border-b-4 border-foreground p-6 flex flex-col gap-4 bg-background">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/40">Active User</span>
              <span className="text-sm font-black uppercase tracking-wider truncate text-right ml-4 text-foreground/80">{profile?.full_name ?? profile?.email}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button onClick={() => setShowProfileSettings(true)} className="border-2 border-foreground py-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"><UserCircle className="w-4 h-4"/> Profile</button>
              <button onClick={() => signOut()} className="border-2 border-foreground py-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"><LogOut className="w-4 h-4"/> Exit</button>
            </div>
          </div>

          {/* Business Selector */}
          <div className="border-b-4 border-foreground p-6 bg-foreground/5 flex flex-col gap-3">
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/50">Target Business</span>
             {loadingBiz ? (
              <div className="flex items-center gap-2 py-2 text-foreground/40">
                <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-xs font-bold uppercase tracking-widest">Scanning…</span>
              </div>
            ) : (
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/40" />
                <select id="biz-select" value={selectedBiz} onChange={(e) => setSelectedBiz(e.target.value)} className="w-full appearance-none border-4 border-foreground bg-background pl-12 pr-8 py-3 text-lg font-black uppercase outline-none focus:ring-4 focus:ring-primary/50 cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all">
                  {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/60" />
              </div>
            )}
          </div>

          {/* Telemetry Grid (Mondrian Stats) */}
          <div className="flex-1 flex flex-col">
            <div className="grid grid-cols-2 flex-1 min-h-[160px]">
              <div className="border-r-4 border-b-4 lg:border-b-0 border-foreground p-6 flex flex-col justify-center items-center text-center bg-green-400/20">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-700/60 mb-1">Bookings</span>
                <span className="text-5xl font-black text-green-600">{bookings.length}</span>
              </div>
              <div className="lg:border-b-0 border-b-4 border-foreground p-6 flex flex-col justify-center items-center text-center bg-yellow-400/20">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-700/60 mb-1">Waitlisted</span>
                <span className="text-5xl font-black text-yellow-600">{waitlistEntries.length}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── RIGHT COLUMN (CONTENT) ── */}
        <main className="flex-1 flex flex-col min-w-0 bg-background lg:overflow-hidden relative">
          
          {/* Top Action Bar (Mondrian Header) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 border-b-4 border-foreground shrink-0 divide-y-4 sm:divide-y-0 sm:divide-x-4 border-foreground bg-background z-20 relative">
            <button onClick={() => setActiveTab("active")} className={`p-6 lg:p-7 font-black uppercase tracking-widest text-sm transition-colors ${activeTab === 'active' ? 'bg-green-400/20 shadow-[inset_0_-4px_0_0_#22c55e] text-green-700' : 'text-foreground/50 hover:text-foreground hover:bg-foreground/5'}`}>
              Available Slots
            </button>
            <button onClick={() => setActiveTab("history")} className={`p-6 lg:p-7 font-black uppercase tracking-widest text-sm transition-colors ${activeTab === 'history' ? 'bg-foreground/10 shadow-[inset_0_-4px_0_0_#000] text-foreground' : 'text-foreground/50 hover:text-foreground hover:bg-foreground/5'}`}>
              History Log
            </button>
          </div>

          {/* Scrollable Canvas */}
          <div className="flex-1 overflow-y-auto bg-[#f4f4f0] p-4 sm:p-6 lg:p-10 relative">
            {pageError && <ErrorBlock message={pageError} />}

            {!selectedBiz ? (
              <div className="border-4 border-dashed border-foreground/20 px-6 py-20 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                <span className="text-4xl mb-4 opacity-20">🏢</span>
                <p className="text-sm font-black uppercase tracking-widest text-foreground/30">Connect to a business first</p>
              </div>
            ) : loadingSlots ? (
              <div className="flex flex-col gap-4"><SlotSkeleton /><SlotSkeleton /><SlotSkeleton /></div>
            ) : displayedSlots.length === 0 ? (
              <div className="border-4 border-dashed border-foreground/20 px-6 py-20 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                <span className="text-4xl mb-4 opacity-20">🕳️</span>
                <p className="text-sm font-black uppercase tracking-widest text-foreground/30">No slots available in this sector</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {displayedSlots.map((slot) => {
                  const action  = resolveAction(slot, bookedSlotIds, waitlistedSlotIds);
                  const loading = actionLoading === slot.id;
                  const entry   = waitlistEntries.find((w) => w.slot_id === slot.id);
                  return (
                    <ClientSlotCard key={slot.id} slot={slot} action={action} loading={loading} isPast={activeTab === "history"} waitlistPosition={entry?.position} onBook={() => requirePhone(() => handleBook(slot.id, slot.title))} onJoinWaitlist={() => requirePhone(() => handleJoinWaitlist(slot.id, slot.title))} onCancelBooking={() => setConfirmState({ slotId: slot.id, title: slot.title, kind: "cancel_booking" })} onLeaveWaitlist={() => setConfirmState({ slotId: slot.id, title: slot.title, kind: "leave_waitlist" })} />
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}