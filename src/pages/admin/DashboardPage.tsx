import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast, Toaster } from "sonner";
import { Loader2, LogOut, Plus, Zap, UserCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authSlice";
import type { Database } from "@/types/database.types";
import { ProfileSettingsModal } from "@/components/ui/ProfileSettingsModal";
import { SlotSkeleton, ErrorBlock, FormField } from "@/components/ui/DashboardUI";
import {
  SlotCard,
  EditSlotModal,
  ClientsModal,
  BulkGeneratorModal,
  CancelConfirmModal,
  type ClientsModalTarget,
} from "./components/AdminComponents";

type Slot = Database["public"]["Tables"]["slots"]["Row"];
type TabMode = "active" | "history";

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

interface ConfirmState {
  slotId: string;
  title: string;
}

export function DashboardPage() {
  const { profile, signOut } = useAuthStore();

  const [slots, setSlots]               = useState<Slot[]>([]);
  const [businessId, setBusinessId]     = useState<string | null>(null);
  const [fetchError, setFetchError]     = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [formOpen, setFormOpen]         = useState(false);
  const [showBulkGenerator, setShowBulkGenerator] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [activeTab, setActiveTab]       = useState<TabMode>("active");

  const [confirmCancel, setConfirmCancel] = useState<ConfirmState | null>(null);
  const [clientsTarget, setClientsTarget] = useState<ClientsModalTarget | null>(null);
  const [editTarget, setEditTarget]       = useState<Slot | null>(null);

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
    const { data, error } = await supabase.from("businesses").select("id").eq("owner_id", profile.id).single();
    if (error || !data) return null;
    return data.id;
  }, [profile?.id]);

  const loadSlots = useCallback(async (bId: string) => {
    setLoadingSlots(true);
    const { data, error } = await supabase.from("slots").select("*").eq("business_id", bId).order("starts_at", { ascending: true });
    if (error) { setFetchError(error.message); } 
    else { setSlots(data ?? []); setFetchError(null); }
    setLoadingSlots(false);
  }, []);

  useEffect(() => {
    (async () => {
      const bId = await loadBusiness();
      if (!bId) { setFetchError("no business profile found — create one first"); setLoadingSlots(false); return; }
      setBusinessId(bId); await loadSlots(bId);
    })();
  }, [loadBusiness, loadSlots]);

  useEffect(() => {
    const channel = supabase.channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, () => { if (businessIdRef.current) loadSlots(businessIdRef.current); })
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => { if (businessIdRef.current) loadSlots(businessIdRef.current); })
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist_entries" }, () => { if (businessIdRef.current) loadSlots(businessIdRef.current); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadSlots]);

  const onCreateSubmit = async (values: SlotFormValues) => {
    if (!businessId) return;
    const { error } = await supabase.from("slots").insert({
      business_id: businessId, title: values.title, starts_at: new Date(values.starts_at).toISOString(), ends_at: new Date(values.ends_at).toISOString(), capacity: values.capacity, booked_count: 0, status: "available",
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`slot "${values.title}" created`);
    reset(); setFormOpen(false); await loadSlots(businessId);
  };

  const confirmAndCancel = (slot: Slot) => setConfirmCancel({ slotId: slot.id, title: slot.title });

  const executeCancel = async () => {
    if (!confirmCancel || !businessId) return;
    const { error } = await supabase.from("slots").update({ status: "cancelled" }).eq("id", confirmCancel.slotId);
    if (error) { toast.error(error.message); } 
    else { toast.success(`"${confirmCancel.title}" cancelled`); await loadSlots(businessId); }
    setConfirmCancel(null);
  };

  const handleRestore = async (slotId: string) => {
    if (!businessId) return;
    const slot = slots.find((s) => s.id === slotId); if (!slot) return;
    const status = slot.booked_count >= slot.capacity ? "booked" : "available";
    const { error } = await supabase.from("slots").update({ status }).eq("id", slotId);
    if (error) { toast.error(error.message); return; }
    toast.success(`"${slot.title}" restored`); await loadSlots(businessId);
  };

  const now = new Date().toISOString().slice(0, 16);
  const currentTime = new Date().getTime();

  const activeSlots = slots.filter((s) => new Date(s.ends_at).getTime() >= currentTime);
  const pastSlots = slots.filter((s) => new Date(s.ends_at).getTime() < currentTime);
  const displayedSlots = activeTab === "active" ? activeSlots : pastSlots;

  const stats = {
    total: slots.length,
    open: activeSlots.filter((s) => s.status === "available").length,
    full: activeSlots.filter((s) => s.status === "booked").length,
    cancelled: slots.filter((s) => s.status === "cancelled").length,
  };

  return (
    <div className="min-h-screen lg:h-screen w-full bg-background text-foreground font-sans p-3 sm:p-6 lg:p-8 box-border flex flex-col">
      <Toaster position="bottom-right" toastOptions={{ className: "border-2 border-foreground rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest" }} />

      {/* Modals */}
      {showProfileSettings && <ProfileSettingsModal profile={profile} onClose={() => setShowProfileSettings(false)} />}
      {confirmCancel && <CancelConfirmModal title={confirmCancel.title} onConfirm={executeCancel} onCancel={() => setConfirmCancel(null)} />}
      {editTarget && <EditSlotModal slot={editTarget} onClose={() => setEditTarget(null)} onSaved={() => businessId && loadSlots(businessId)} />}
      {clientsTarget && <ClientsModal target={clientsTarget} onClose={() => setClientsTarget(null)} />}
      {showBulkGenerator && businessId && <BulkGeneratorModal businessId={businessId} onClose={() => setShowBulkGenerator(false)} onSaved={() => businessId && loadSlots(businessId)} />}

      {/* Main Frame (Mondrian Container) */}
      <div className="w-full flex-1 border-4 border-foreground flex flex-col lg:flex-row shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-background lg:overflow-hidden">
        
        {/* ── LEFT COLUMN (GRID) ── */}
        <aside className="lg:w-[420px] flex flex-col border-b-4 lg:border-b-0 lg:border-r-4 border-foreground shrink-0 bg-background z-10">
          
          {/* Brutalist Title Box */}
          <div className="p-6 lg:p-8 border-b-4 border-foreground flex flex-col justify-end min-h-[220px] lg:min-h-[280px] bg-foreground text-background relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Zap className="w-32 h-32" />
            </div>
            <span className="text-[10px] font-black tracking-[0.4em] uppercase opacity-70 mb-auto relative z-10">
              Smart Waitlist
            </span>
            <h1 className="text-5xl lg:text-[4.5rem] font-black uppercase tracking-tighter leading-[0.85] relative z-10" style={{ fontFamily: "'Syne', sans-serif" }}>
              Admin<br/>Protocol
            </h1>
          </div>

          {/* User Auth Box */}
          <div className="border-b-4 border-foreground p-6 flex flex-col gap-4 bg-background">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/40">Operator</span>
              <span className="text-sm font-black uppercase tracking-wider truncate text-right ml-4 text-foreground/80">{profile?.full_name ?? profile?.email}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button onClick={() => setShowProfileSettings(true)} className="border-2 border-foreground py-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"><UserCircle className="w-4 h-4"/> Profile</button>
              <button onClick={() => signOut()} className="border-2 border-foreground py-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"><LogOut className="w-4 h-4"/> Exit</button>
            </div>
          </div>

          {/* Telemetry Grid (Mondrian Stats) */}
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b-4 border-foreground bg-foreground/5">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/50">Telemetry</span>
            </div>
            <div className="grid grid-cols-2 flex-1 min-h-[200px]">
              <div className="border-r-4 border-b-4 border-foreground p-6 flex flex-col justify-center items-center text-center">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40 mb-1">Total</span>
                <span className="text-5xl font-black">{stats.total}</span>
              </div>
              <div className="border-b-4 border-foreground p-6 flex flex-col justify-center items-center text-center bg-green-400/20">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-700/60 mb-1">Open</span>
                <span className="text-5xl font-black text-green-600">{stats.open}</span>
              </div>
              <div className="border-r-4 lg:border-b-0 border-foreground p-6 flex flex-col justify-center items-center text-center bg-yellow-400/20">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-700/60 mb-1">Full</span>
                <span className="text-5xl font-black text-yellow-600">{stats.full}</span>
              </div>
              <div className="p-6 flex flex-col justify-center items-center text-center bg-foreground/5">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40 mb-1">Cancelled</span>
                <span className="text-5xl font-black text-foreground/30">{stats.cancelled}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── RIGHT COLUMN (CONTENT) ── */}
        <main className="flex-1 flex flex-col min-w-0 bg-background lg:overflow-hidden relative">
          
          {/* Top Action Bar (Mondrian Header) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b-4 border-foreground shrink-0 divide-y-4 sm:divide-y-0 sm:divide-x-4 border-foreground bg-background z-20 relative">
            <button onClick={() => { setFormOpen((p) => !p); setShowBulkGenerator(false); }} className={`p-6 lg:p-5 flex items-center justify-between lg:justify-center gap-3 font-black uppercase tracking-widest text-xs lg:text-[10px] xl:text-xs hover:bg-foreground hover:text-background transition-colors ${formOpen ? 'bg-foreground text-background' : ''}`}>
              <Plus className={`w-4 h-4 transition-transform ${formOpen ? 'rotate-45' : ''}`} /> <span className="mt-0.5">Manual Slot</span>
            </button>
            <button onClick={() => { setShowBulkGenerator(true); setFormOpen(false); }} disabled={!businessId} className="p-6 lg:p-5 flex items-center justify-between lg:justify-center gap-3 font-black uppercase tracking-widest text-xs lg:text-[10px] xl:text-xs hover:bg-primary hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <Zap className="w-4 h-4" /> <span className="mt-0.5">Bulk Gen</span>
            </button>
            <button onClick={() => setActiveTab("active")} className={`p-6 lg:p-5 font-black uppercase tracking-widest text-xs lg:text-[10px] xl:text-xs transition-colors ${activeTab === 'active' ? 'bg-green-400/20 shadow-[inset_0_-4px_0_0_#22c55e] text-green-700' : 'text-foreground/50 hover:text-foreground hover:bg-foreground/5'}`}>
              Active Slots
            </button>
            <button onClick={() => setActiveTab("history")} className={`p-6 lg:p-5 font-black uppercase tracking-widest text-xs lg:text-[10px] xl:text-xs transition-colors ${activeTab === 'history' ? 'bg-foreground/10 shadow-[inset_0_-4px_0_0_#000] text-foreground' : 'text-foreground/50 hover:text-foreground hover:bg-foreground/5'}`}>
              History Log
            </button>
          </div>

          {/* Scrollable Canvas */}
          <div className="flex-1 overflow-y-auto bg-[#f4f4f0] p-4 sm:p-6 lg:p-10 relative">
            
            {formOpen && (
              <div className="border-4 border-foreground bg-background mb-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <div className="border-b-4 border-foreground px-6 py-4 bg-foreground text-background">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ fontFamily: "'Syne', sans-serif" }}>Create New Configuration</span>
                </div>
                <form onSubmit={handleSubmit(onCreateSubmit)} noValidate className="px-6 py-8 flex flex-col gap-8">
                  <div className="grid sm:grid-cols-2 gap-8">
                    <FormField label="Slot Title" error={errors.title?.message}>
                      <input {...register("title")} type="text" placeholder="e.g. Consultation" className="border-b-4 border-foreground bg-foreground/5 py-3 px-2 text-xl outline-none focus:bg-background w-full" />
                    </FormField>
                    <FormField label="Capacity" error={errors.capacity?.message}>
                      <input {...register("capacity")} type="number" min={1} placeholder="1" className="border-b-4 border-foreground bg-foreground/5 py-3 px-2 text-xl outline-none focus:bg-background w-full" />
                    </FormField>
                    <FormField label="Starts At" error={errors.starts_at?.message}>
                      <input {...register("starts_at")} type="datetime-local" min={now} className="border-b-4 border-foreground bg-foreground/5 py-3 px-2 text-xl outline-none focus:bg-background w-full" />
                    </FormField>
                    <FormField label="Ends At" error={errors.ends_at?.message}>
                      <input {...register("ends_at")} type="datetime-local" min={now} className="border-b-4 border-foreground bg-foreground/5 py-3 px-2 text-xl outline-none focus:bg-background w-full" />
                    </FormField>
                  </div>
                  <div className="flex gap-4">
                    <button type="submit" disabled={isSubmitting} className="flex flex-1 items-center justify-center gap-3 bg-foreground py-5 text-sm font-black uppercase tracking-widest text-background hover:bg-primary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} {isSubmitting ? "Deploying…" : "Deploy Slot"}
                    </button>
                    <button type="button" onClick={() => { reset(); setFormOpen(false); }} className="border-4 border-foreground py-5 px-8 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">Abort</button>
                  </div>
                </form>
              </div>
            )}

            {fetchError && <ErrorBlock message={fetchError} />}

            {loadingSlots ? (
              <div className="flex flex-col gap-4"><SlotSkeleton /><SlotSkeleton /></div>
            ) : displayedSlots.length === 0 && !fetchError ? (
              <div className="border-4 border-dashed border-foreground/20 px-6 py-20 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                <span className="text-4xl mb-4 opacity-20">🕳️</span>
                <p className="text-sm font-black uppercase tracking-widest text-foreground/30">No data found in this sector</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {displayedSlots.map((slot) => (
                  <SlotCard key={slot.id} slot={slot} isPast={activeTab === "history"} onEdit={() => setEditTarget(slot)} onCancel={() => confirmAndCancel(slot)} onRestore={handleRestore} onViewClients={() => setClientsTarget({ slotId: slot.id, title: slot.title })} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}