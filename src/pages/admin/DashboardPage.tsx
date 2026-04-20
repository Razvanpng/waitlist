import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast, Toaster } from "sonner";
import { Loader2, LogOut, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authSlice";

// Importăm noile noastre componente
import { StatCell, SlotSkeleton, FormField, ErrorBlock } from "@/components/ui/DashboardUI";
import { 
  Slot, slotSchema, SlotFormValues, ConfirmState, ClientsModalTarget,
  EditSlotModal, ClientsModal, CancelConfirmModal, SlotCard 
} from "./components/AdminComponents";

type TabMode = "active" | "history";

export function DashboardPage() {
  const { profile, signOut } = useAuthStore();

  // State-uri
  const [slots, setSlots]           = useState<Slot[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [formOpen, setFormOpen]         = useState(false);
  const [activeTab, setActiveTab]       = useState<TabMode>("active");

  // State-uri Modale
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
    if (error) setFetchError(error.message);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, () => businessIdRef.current && loadSlots(businessIdRef.current))
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => businessIdRef.current && loadSlots(businessIdRef.current))
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist_entries" }, () => businessIdRef.current && loadSlots(businessIdRef.current))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadSlots]);

  const onCreateSubmit = async (values: SlotFormValues) => {
    if (!businessId) return;
    const { error } = await supabase.from("slots").insert({
      business_id: businessId, title: values.title, starts_at: new Date(values.starts_at).toISOString(), ends_at: new Date(values.ends_at).toISOString(), capacity: values.capacity, booked_count: 0, status: "available",
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`slot "${values.title}" created`); reset(); setFormOpen(false); await loadSlots(businessId);
  };

  const executeCancel = async () => {
    if (!confirmCancel || !businessId) return;
    const { error } = await supabase.from("slots").update({ status: "cancelled" }).eq("id", confirmCancel.slotId);
    if (error) toast.error(error.message); else { toast.success(`"${confirmCancel.title}" cancelled`); await loadSlots(businessId); }
    setConfirmCancel(null);
  };

  const handleRestore = async (slotId: string) => {
    if (!businessId) return;
    const slot = slots.find((s) => s.id === slotId); if (!slot) return;
    const status = slot.booked_count >= slot.capacity ? "booked" : "available";
    const { error } = await supabase.from("slots").update({ status }).eq("id", slotId);
    if (error) toast.error(error.message); else { toast.success(`"${slot.title}" restored`); await loadSlots(businessId); }
  };

  const now = new Date().toISOString().slice(0, 16);
  const currentTime = new Date().getTime();

  const activeSlots = slots.filter((s) => new Date(s.ends_at).getTime() >= currentTime);
  const pastSlots = slots.filter((s) => new Date(s.ends_at).getTime() < currentTime);
  const displayedSlots = activeTab === "active" ? activeSlots : pastSlots;

  const stats = {
    total: slots.length, open: activeSlots.filter((s) => s.status === "available").length,
    full: activeSlots.filter((s) => s.status === "booked").length, cancelled: slots.filter((s) => s.status === "cancelled").length,
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Toaster position="bottom-right" toastOptions={{ className: "border-2 border-foreground rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest" }} />

      {confirmCancel && <CancelConfirmModal title={confirmCancel.title} onConfirm={executeCancel} onCancel={() => setConfirmCancel(null)} />}
      {editTarget && <EditSlotModal slot={editTarget} onClose={() => setEditTarget(null)} onSaved={() => businessId && loadSlots(businessId)} />}
      {clientsTarget && <ClientsModal target={clientsTarget} onClose={() => setClientsTarget(null)} />}

      <header className="border-b-4 border-foreground px-6 py-5 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-[0.3em] text-foreground/40 uppercase">Smart Waitlist</span>
          <h1 className="text-2xl font-black uppercase tracking-tight leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>Admin Protocol</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-xs font-medium text-foreground/50 uppercase tracking-widest">{profile?.full_name ?? profile?.email}</span>
          <button onClick={() => signOut()} className="flex items-center gap-2 border-2 border-foreground px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">
            <LogOut className="h-3.5 w-3.5" /> Exit
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 border-2 border-foreground divide-x-2 divide-foreground">
          <StatCell label="Total Slots" value={stats.total} />
          <StatCell label="Active Open" value={stats.open} accent="text-green-500" />
          <StatCell label="Active Full" value={stats.full} accent="text-yellow-400" />
          <StatCell label="Cancelled" value={stats.cancelled} accent="text-foreground/40" />
        </div>

        <section className="border-2 border-foreground">
          <button onClick={() => setFormOpen((p) => !p)} className="w-full flex items-center justify-between px-6 py-5 bg-foreground text-background hover:bg-primary hover:text-foreground transition-colors">
            <span className="text-lg font-black uppercase tracking-widest" style={{ fontFamily: "'Syne', sans-serif" }}>{formOpen ? "— Close Form" : "+ Create New Slot"}</span>
            <Plus className={`h-5 w-5 transition-transform ${formOpen ? "rotate-45" : ""}`} />
          </button>
          {formOpen && (
            <form onSubmit={handleSubmit(onCreateSubmit)} noValidate className="px-6 py-7 flex flex-col gap-7 border-t-2 border-foreground">
              <div className="grid sm:grid-cols-2 gap-7">
                <FormField label="Slot Title" error={errors.title?.message}><input {...register("title")} type="text" placeholder="e.g. Morning Consultation" className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full" /></FormField>
                <FormField label="Capacity" error={errors.capacity?.message}><input {...register("capacity")} type="number" min={1} placeholder="1" className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full" /></FormField>
                <FormField label="Starts At" error={errors.starts_at?.message}><input {...register("starts_at")} type="datetime-local" min={now} className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full" /></FormField>
                <FormField label="Ends At" error={errors.ends_at?.message}><input {...register("ends_at")} type="datetime-local" min={now} className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full" /></FormField>
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-3 bg-foreground py-5 px-8 text-lg font-bold uppercase tracking-widest text-background transition-all hover:bg-primary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
                  {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}{isSubmitting ? "Saving..." : "Confirm Slot"}
                </button>
                <button type="button" onClick={() => { reset(); setFormOpen(false); }} className="border-2 border-foreground py-5 px-6 text-sm font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">Discard</button>
              </div>
            </form>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b-4 border-foreground pb-4">
             <div className="flex items-baseline gap-4">
              <h2 className="text-2xl font-black uppercase tracking-widest leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>Slots</h2>
              <span className="text-xs text-foreground/40 uppercase tracking-widest font-bold">{displayedSlots.length} items</span>
            </div>
            <div className="flex bg-foreground p-1 w-full sm:w-auto">
              <button onClick={() => setActiveTab("active")} className={`flex-1 sm:w-32 py-2 text-xs font-black uppercase tracking-widest transition-colors ${activeTab === "active" ? "bg-background text-foreground" : "text-background hover:bg-background/20"}`}>Active</button>
              <button onClick={() => setActiveTab("history")} className={`flex-1 sm:w-32 py-2 text-xs font-black uppercase tracking-widest transition-colors ${activeTab === "history" ? "bg-background text-foreground" : "text-background hover:bg-background/20"}`}>History</button>
            </div>
          </div>

          {fetchError && <ErrorBlock message={fetchError} />}

          {loadingSlots ? (
            <div className="flex flex-col gap-3"><SlotSkeleton /><SlotSkeleton /><SlotSkeleton /></div>
          ) : displayedSlots.length === 0 && !fetchError ? (
            <div className="border-2 border-dashed border-foreground/30 px-6 py-12 text-center"><p className="text-sm font-bold uppercase tracking-widest text-foreground/30">No slots found in this category</p></div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayedSlots.map((slot) => (
                <SlotCard key={slot.id} slot={slot} isPast={activeTab === "history"} onEdit={() => setEditTarget(slot)} onCancel={() => setConfirmCancel({ slotId: slot.id, title: slot.title })} onRestore={handleRestore} onViewClients={() => setClientsTarget({ slotId: slot.id, title: slot.title })} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}