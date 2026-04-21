import { useEffect, useState, useCallback, useRef } from "react";
import { toast, Toaster } from "sonner";
import { Loader2, LogOut, Building2, ChevronDown, UserCircle } from "lucide-react";
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
    if (error || res?.success === false) { toast.error(error?.message ?? res?.error ?? "booking failed"); } 
    else { toast.success(`"${title}" booked`); await refresh(); }
    setActionLoading(null);
  };

  const handleJoinWaitlist = async (slotId: string, title: string) => {
    if (!profile?.id) return;
    setActionLoading(slotId);
    const { data, error } = await supabase.rpc("join_waitlist", { p_slot_id: slotId, p_client_id: profile.id });
    const res = data as any;
    if (error || res?.success === false) { toast.error(error?.message ?? res?.error ?? "could not join waitlist"); } 
    else { toast.success(`Joined waitlist for "${title}"`); await refresh(); }
    setActionLoading(null);
  };

  const currentTime = new Date().getTime();
  const activeSlots = slots.filter((s) => new Date(s.ends_at).getTime() >= currentTime);
  const pastSlots = slots.filter((s) => new Date(s.ends_at).getTime() < currentTime);
  const displayedSlots = activeTab === "active" ? activeSlots : pastSlots;

  return (
    <div className="min-h-screen w-full bg-[#f4f4f0] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] text-foreground font-sans pb-12">
      <Toaster position="bottom-right" toastOptions={{ className: "border-4 border-foreground rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest" }} />

      {/* Modals */}
      {showProfileSettings && <ProfileSettingsModal profile={profile} onClose={() => setShowProfileSettings(false)} />}
      {showPhoneModal && <PhoneModal phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber} onSave={savePhoneAndContinue} onCancel={() => setShowPhoneModal(false)} isSaving={savingPhone} />}
      {confirmState && (
        <ActionConfirmModal state={confirmState} onConfirm={async () => {
          if (!confirmState || !profile?.id) return;
          const { slotId, title, kind } = confirmState; setConfirmState(null); setActionLoading(slotId);
          
          // REPARAT: Funcția if/else curată pentru erori, fără warning de rpcName
          let error;
          if (kind === "cancel_booking") {
            const res = await supabase.rpc("cancel_booking", { p_slot_id: slotId, p_client_id: profile.id });
            error = res.error;
          } else {
            const res = await supabase.from("waitlist_entries").update({ status: "withdrawn" }).eq("slot_id", slotId).eq("client_id", profile.id);
            error = res.error;
          }
          
          if (error) toast.error(error.message); else { toast.success(`${kind === "cancel_booking" ? "Booking" : "Waitlist"} for "${title}" updated`); await refresh(); }
          setActionLoading(null);
        }} onCancel={() => setConfirmState(null)} />
      )}

      {/* ── MEGA CONTROL PANEL ── */}
      <header className="max-w-[1400px] mx-auto mt-0 sm:mt-6 mb-8 border-b-4 sm:border-4 border-foreground bg-background sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
        
        {/* Top Header Row */}
        <div className="flex flex-col md:flex-row border-b-4 border-foreground">
          <div className="p-6 md:p-8 md:w-1/2 lg:w-2/5 border-b-4 md:border-b-0 md:border-r-4 border-foreground bg-primary text-foreground flex flex-col justify-center">
            <span className="text-[10px] font-black tracking-[0.4em] uppercase opacity-60">Smart Waitlist</span>
            <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-none mt-2" style={{ fontFamily: "'Syne', sans-serif" }}>Client Terminal</h1>
          </div>
          
          <div className="p-6 md:p-8 md:w-1/2 lg:w-3/5 flex flex-col justify-center gap-6 bg-foreground/5">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/50">Active User</span>
                  <span className="text-lg font-black uppercase tracking-widest text-foreground">{profile?.full_name ?? profile?.email}</span>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowProfileSettings(true)} className="border-4 border-foreground bg-background px-5 py-2.5 text-xs font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:translate-x-1 active:shadow-none flex items-center gap-2">
                    <UserCircle className="w-4 h-4"/> Profile
                  </button>
                  <button onClick={() => signOut()} className="border-4 border-foreground bg-background px-5 py-2.5 text-xs font-black uppercase tracking-widest hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:translate-x-1 active:shadow-none">
                    Exit
                  </button>
                </div>
             </div>

             <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/50">Target Business</span>
                {loadingBiz ? (
                  <div className="flex items-center gap-2 border-4 border-foreground bg-background py-3 px-4 text-foreground/40"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm font-bold uppercase tracking-widest">Scanning…</span></div>
                ) : (
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-foreground/40" />
                    <select id="biz-select" value={selectedBiz} onChange={(e) => setSelectedBiz(e.target.value)} className="w-full appearance-none border-4 border-foreground bg-background pl-12 pr-8 py-3.5 text-lg font-black uppercase outline-none focus:ring-4 focus:ring-primary/40 cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
                      {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-6 w-6 text-foreground/60" />
                  </div>
                )}
             </div>
          </div>
        </div>

        {/* Middle Stats Row */}
        <div className="grid grid-cols-2 divide-x-4 divide-y-4 md:divide-y-0 border-b-4 border-foreground">
           <BlockStat label="My Bookings" value={bookings.length} bg="bg-green-400/20" color="text-green-700" />
           <BlockStat label="My Waitlists" value={waitlistEntries.length} bg="bg-yellow-400/20" color="text-yellow-700" />
        </div>

        {/* Bottom Actions Row */}
        <div className="flex flex-col md:flex-row items-stretch justify-start bg-background">
           <button onClick={() => setActiveTab("active")} className={`flex-1 sm:flex-none px-8 py-5 border-b-4 md:border-b-0 md:border-r-4 border-foreground text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'active' ? 'bg-foreground text-background' : 'hover:bg-foreground/5 text-foreground/50 hover:text-foreground'}`}>Available Slots</button>
           <button onClick={() => setActiveTab("history")} className={`flex-1 sm:flex-none px-8 py-5 md:border-r-4 border-foreground text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'history' ? 'bg-foreground text-background' : 'hover:bg-foreground/5 text-foreground/50 hover:text-foreground'}`}>History Log</button>
        </div>
      </header>

      {/* ── DATA FEED ── */}
      <main className="max-w-[1400px] mx-auto px-4 md:px-0 flex flex-col gap-6">
        {pageError && <ErrorBlock message={pageError} />}

        {!selectedBiz ? (
          <div className="border-4 border-dashed border-foreground/30 px-6 py-24 bg-background text-center flex flex-col items-center justify-center">
            <span className="text-6xl mb-6 opacity-20">🏢</span>
            <p className="text-xl font-black uppercase tracking-widest text-foreground/40">Connect to a business first</p>
            <p className="text-sm font-medium text-foreground/30 mt-2">Use the sector selector in the control panel</p>
          </div>
        ) : loadingSlots ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <SlotSkeleton /><SlotSkeleton /><SlotSkeleton />
          </div>
        ) : displayedSlots.length === 0 ? (
          <div className="border-4 border-dashed border-foreground/30 px-6 py-24 bg-background text-center flex flex-col items-center justify-center">
            <span className="text-6xl mb-6 opacity-20">🕳️</span>
            <p className="text-xl font-black uppercase tracking-widest text-foreground/40">No vectors available</p>
            <p className="text-sm font-medium text-foreground/30 mt-2">Try another business or check your history log</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
      </main>
    </div>
  );
}

// Subcomponentă pătrată, grea, pentru statistici
function BlockStat({ label, value, bg = "bg-background", color = "text-foreground" }: { label: string; value: number | string; bg?: string; color?: string; }) {
  return (
    <div className={`flex flex-col justify-center p-6 lg:p-8 ${bg}`}>
      <span className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-2 ${color}`}>{label}</span>
      <span className={`text-6xl font-black leading-none tracking-tighter ${color}`}>{value}</span>
    </div>
  );
}