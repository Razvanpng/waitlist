import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast, Toaster } from "sonner";
import { Loader2, LogOut, Plus, Zap, UserCircle, Target } from "lucide-react";
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

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<SlotFormValues>({ resolver: zodResolver(slotSchema) });

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
    <div className="min-h-screen w-full bg-[#f4f4f0] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] text-foreground font-sans p-4 sm:p-6 lg:p-8 flex flex-col">
      <Toaster position="bottom-right" toastOptions={{ className: "border-4 border-foreground rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest" }} />

      {/* Modals */}
      {showProfileSettings && <ProfileSettingsModal profile={profile} onClose={() => setShowProfileSettings(false)} />}
      {confirmCancel && <CancelConfirmModal title={confirmCancel.title} onConfirm={executeCancel} onCancel={() => setConfirmCancel(null)} />}
      {editTarget && <EditSlotModal slot={editTarget} onClose={() => setEditTarget(null)} onSaved={() => businessId && loadSlots(businessId)} />}
      {clientsTarget && <ClientsModal target={clientsTarget} onClose={() => setClientsTarget(null)} />}
      {showBulkGenerator && businessId && <BulkGeneratorModal businessId={businessId} onClose={() => setShowBulkGenerator(false)} onSaved={() => businessId && loadSlots(businessId)} />}

      {/* MEGA-FRAME */}
      <div className="max-w-[1600px] w-full mx-auto bg-background border-4 border-foreground shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex-1 flex flex-col overflow-hidden">
        
        {/* Header Grid */}
        <header className="flex flex-col xl:flex-row border-b-4 border-foreground">
          <div className="xl:w-1/3 p-6 lg:p-8 border-b-4 xl:border-b-0 xl:border-r-4 border-foreground bg-foreground text-background flex flex-col justify-center">
            <span className="text-[10px] font-black tracking-[0.4em] uppercase opacity-70">System Identity</span>
            <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-none mt-2" style={{ fontFamily: "'Syne', sans-serif" }}>Admin Protocol</h1>
          </div>
          <div className="xl:w-2/3 grid grid-cols-2 md:grid-cols-4">
            <BlockStat label="Total Records" value={stats.total} className="border-r-4 border-b-4 md:border-b-0 border-foreground" />
            <BlockStat label="Open Vectors" value={stats.open} bg="bg-green-400/20" color="text-green-700" className="md:border-r-4 border-b-4 md:border-b-0 border-foreground" />
            <BlockStat label="Full Vectors" value={stats.full} bg="bg-yellow-400/20" color="text-yellow-700" className="border-r-4 border-foreground" />
            <BlockStat label="Terminated" value={stats.cancelled} bg="bg-foreground/5" color="text-foreground/40" />
          </div>
        </header>

        {/* Action Bar Grid */}
        <div className="flex flex-col lg:flex-row items-stretch justify-between border-b-4 border-foreground bg-background">
          <div className="flex flex-col sm:flex-row border-b-4 lg:border-b-0 lg:border-r-4 border-foreground">
            <button onClick={() => setActiveTab("active")} className={`px-6 py-4 sm:py-5 border-b-4 sm:border-b-0 sm:border-r-4 border-foreground font-black uppercase tracking-widest text-sm transition-colors ${activeTab === 'active' ? 'bg-foreground text-background' : 'hover:bg-foreground/10 text-foreground/50 hover:text-foreground'}`}>Active Blocks</button>
            <button onClick={() => setActiveTab("history")} className={`px-6 py-4 sm:py-5 font-black uppercase tracking-widest text-sm transition-colors ${activeTab === 'history' ? 'bg-foreground text-background' : 'hover:bg-foreground/10 text-foreground/50 hover:text-foreground'}`}>History Log</button>
          </div>

          <div className="flex flex-col sm:flex-row">
            <div className="px-6 py-4 flex items-center justify-between gap-4 border-b-4 sm:border-b-0 sm:border-r-4 border-foreground bg-foreground/5">
                <span className="text-[10px] font-black uppercase tracking-widest text-foreground/50">Operator</span>
                <span className="text-xs font-black uppercase tracking-widest">{profile?.full_name ?? profile?.email}</span>
            </div>
            <button onClick={() => setShowProfileSettings(true)} className="px-6 py-4 sm:py-5 border-b-4 sm:border-b-0 sm:border-r-4 border-foreground font-black uppercase text-xs hover:bg-foreground hover:text-background transition-colors flex items-center gap-2 justify-center"><UserCircle className="w-4 h-4"/> Profile</button>
            <button onClick={() => { setFormOpen((p) => !p); setShowBulkGenerator(false); }} className={`px-6 py-4 sm:py-5 border-b-4 sm:border-b-0 sm:border-r-4 border-foreground font-black uppercase text-xs flex items-center gap-2 justify-center transition-colors ${formOpen ? 'bg-background text-foreground shadow-[inset_0_-4px_0_0_#000]' : 'hover:bg-foreground hover:text-background'}`}><Plus className={`w-4 h-4 transition-transform ${formOpen ? 'rotate-45' : ''}`}/> Manual Deploy</button>
            <button onClick={() => { setShowBulkGenerator(true); setFormOpen(false); }} disabled={!businessId} className="px-6 py-4 sm:py-5 border-b-4 sm:border-b-0 sm:border-r-4 border-foreground font-black uppercase text-xs bg-primary hover:bg-primary/80 transition-colors flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed"><Zap className="w-4 h-4"/> Smart Gen</button>
            <button onClick={() => signOut()} className="px-6 py-4 sm:py-5 font-black uppercase text-xs hover:bg-destructive hover:text-destructive-foreground transition-colors flex items-center justify-center"><LogOut className="w-4 h-4"/></button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-[#f4f4f0] p-6 lg:p-10 flex flex-col gap-6">
          
          {formOpen && (
            <div className="border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full mb-4">
              <div className="border-b-4 border-foreground px-6 py-4 bg-foreground text-background flex items-center gap-3">
                <Plus className="w-5 h-5 text-primary"/>
                <span className="text-sm font-black uppercase tracking-[0.25em]" style={{ fontFamily: "'Syne', sans-serif" }}>Manual Deployment Configuration</span>
              </div>
              <form onSubmit={handleSubmit(onCreateSubmit)} noValidate className="px-6 py-8 flex flex-col gap-8">
                <div className="grid sm:grid-cols-2 gap-8">
                  <FormField label="Block Title / Identity" error={errors.title?.message}>
                    <input {...register("title")} type="text" placeholder="e.g. Consultation Alpha" className="border-b-4 border-foreground bg-foreground/5 py-3.5 px-3 text-xl font-bold outline-none focus:bg-background w-full" />
                  </FormField>
                  <FormField label="Unit Capacity" error={errors.capacity?.message}>
                    <input {...register("capacity")} type="number" min={1} placeholder="1" className="border-b-4 border-foreground bg-foreground/5 py-3.5 px-3 text-xl font-bold outline-none focus:bg-background w-full" />
                  </FormField>
                  <FormField label="Activation Timestamp" error={errors.starts_at?.message}>
                    <input {...register("starts_at")} type="datetime-local" min={now} className="border-b-4 border-foreground bg-foreground/5 py-3.5 px-3 text-xl font-bold outline-none focus:bg-background w-full cursor-pointer" />
                  </FormField>
                  <FormField label="Deactivation Timestamp" error={errors.ends_at?.message}>
                    <input {...register("ends_at")} type="datetime-local" min={now} className="border-b-4 border-foreground bg-foreground/5 py-3.5 px-3 text-xl font-bold outline-none focus:bg-background w-full cursor-pointer" />
                  </FormField>
                </div>
                <div className="flex gap-4 pt-2">
                  <button type="submit" disabled={isSubmitting} className="flex flex-1 items-center justify-center gap-3 bg-foreground py-5 text-base font-black uppercase tracking-widest text-background hover:bg-primary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Deploying Protocol…</> : <><Target className="h-5 w-5" /> Confirm Deployment</>}
                  </button>
                  <button type="button" onClick={() => { reset(); setFormOpen(false); }} className="border-4 border-foreground py-5 px-8 text-base font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">Abort</button>
                </div>
              </form>
            </div>
          )}

          {fetchError && <ErrorBlock message={fetchError} />}

          {loadingSlots ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              <SlotSkeleton /><SlotSkeleton /><SlotSkeleton /><SlotSkeleton />
            </div>
          ) : displayedSlots.length === 0 && !fetchError ? (
            <div className="border-4 border-dashed border-foreground/30 px-6 py-24 bg-background text-center flex flex-col items-center justify-center">
              <span className="text-6xl mb-6 opacity-20">🕳️</span>
              <p className="text-xl font-black uppercase tracking-widest text-foreground/40">No data records found in this vector</p>
              <p className="text-sm font-medium text-foreground/30 mt-2">Deploy a new block or check history logs</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {displayedSlots.map((slot) => (
                <SlotCard key={slot.id} slot={slot} isPast={activeTab === "history"} onEdit={() => setEditTarget(slot)} onCancel={() => confirmAndCancel(slot)} onRestore={handleRestore} onViewClients={() => setClientsTarget({ slotId: slot.id, title: slot.title })} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockStat({ label, value, className = "", bg = "bg-background", color = "text-foreground" }: { label: string; value: number | string; className?: string; bg?: string; color?: string; }) {
  return (
    <div className={`flex flex-col justify-center p-6 lg:p-8 ${bg} ${className}`}>
      <span className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-2 ${color}`}>{label}</span>
      <span className={`text-5xl lg:text-6xl font-black leading-none tracking-tighter ${color}`}>{value}</span>
    </div>
  );
}