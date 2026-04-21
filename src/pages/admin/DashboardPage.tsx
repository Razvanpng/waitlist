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
import { StatCell, SlotSkeleton, ErrorBlock, FormField } from "@/components/ui/DashboardUI";
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

  const onCreateSubmit = async (values: SlotFormValues) => {
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

  const confirmAndCancel = (slot: Slot) =>
    setConfirmCancel({ slotId: slot.id, title: slot.title });

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
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col lg:flex-row">
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            "border-2 border-foreground rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold uppercase tracking-widest",
        }}
      />

      {showProfileSettings && <ProfileSettingsModal profile={profile} onClose={() => setShowProfileSettings(false)} />}
      
      {confirmCancel && (
        <CancelConfirmModal
          title={confirmCancel.title}
          onConfirm={executeCancel}
          onCancel={() => setConfirmCancel(null)}
        />
      )}

      {editTarget && (
        <EditSlotModal
          slot={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => businessId && loadSlots(businessId)}
        />
      )}

      {clientsTarget && (
        <ClientsModal
          target={clientsTarget}
          onClose={() => setClientsTarget(null)}
        />
      )}

      {showBulkGenerator && businessId && (
        <BulkGeneratorModal
          businessId={businessId}
          onClose={() => setShowBulkGenerator(false)}
          onSaved={() => businessId && loadSlots(businessId)}
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
              Admin<br />Protocol
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

        <div className="p-6 flex flex-col gap-3">
          <span
            className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/30"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            System Status
          </span>

          <div className="grid grid-cols-2 border-2 border-foreground divide-x-2 divide-y-2 divide-foreground">
            <StatCell label="Total" value={stats.total} />
            <StatCell label="Open" value={stats.open} accent="text-green-500" />
            <StatCell label="Full" value={stats.full} accent="text-yellow-400" />
            <StatCell label="Cancelled" value={stats.cancelled} accent="text-foreground/30" />
          </div>
        </div>

        <div className="mt-auto px-6 pb-6">
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
                Slot Management
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

        <div className="flex-1 px-6 lg:px-10 py-8 flex flex-col gap-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => { setFormOpen((p) => !p); setShowBulkGenerator(false); }}
              className="flex items-center justify-between gap-3 border-2 border-foreground px-6 py-5 hover:bg-foreground hover:text-background transition-colors group"
            >
              <div className="flex flex-col items-start gap-0.5">
                <span
                  className="text-xs font-black uppercase tracking-[0.2em] text-foreground/40 group-hover:text-background/60 transition-colors"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  Manual
                </span>
                <span
                  className="text-lg font-black uppercase tracking-widest leading-none"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  Create Slot
                </span>
              </div>
              <Plus className={`h-6 w-6 shrink-0 transition-transform ${formOpen ? "rotate-45" : ""}`} />
            </button>

            <button
              onClick={() => { setShowBulkGenerator(true); setFormOpen(false); }}
              disabled={!businessId}
              className="flex items-center justify-between gap-3 bg-foreground text-background px-6 py-5 hover:bg-primary hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed group"
            >
              <div className="flex flex-col items-start gap-0.5">
                <span
                  className="text-xs font-black uppercase tracking-[0.2em] text-background/50 group-hover:text-foreground/50 transition-colors"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  Smart Generator
                </span>
                <span
                  className="text-lg font-black uppercase tracking-widest leading-none"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  Bulk Generate
                </span>
              </div>
              <Zap className="h-6 w-6 shrink-0" />
            </button>
          </div>

          {formOpen && (
            <div className="border-2 border-foreground">
              <div className="border-b-2 border-foreground px-6 py-3 bg-foreground/5">
                <span
                  className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/50"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  New Slot Details
                </span>
              </div>
              <form
                onSubmit={handleSubmit(onCreateSubmit)}
                noValidate
                className="px-6 py-7 flex flex-col gap-7"
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
                    className="flex flex-1 items-center justify-center gap-3 bg-foreground py-4 px-8 text-sm font-black uppercase tracking-widest text-background hover:bg-primary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isSubmitting ? "Saving…" : "Confirm Slot"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { reset(); setFormOpen(false); }}
                    className="border-2 border-foreground py-4 px-6 text-sm font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </form>
            </div>
          )}

          {fetchError && <ErrorBlock message={fetchError} />}

          <section className="flex flex-col gap-4">
            {loadingSlots ? (
              <div className="flex flex-col gap-3">
                <SlotSkeleton />
                <SlotSkeleton />
                <SlotSkeleton />
              </div>
            ) : slots.length === 0 && !fetchError ? (
              <div className="border-2 border-dashed border-foreground/20 px-6 py-16 text-center">
                <p className="text-sm font-black uppercase tracking-widest text-foreground/25">
                  No slots yet — create one above
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {displayedSlots.map((slot) => (
                  <SlotCard
                    key={slot.id}
                    slot={slot}
                    isPast={activeTab === "history"}
                    onEdit={() => setEditTarget(slot)}
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
        </div>
      </main>
    </div>
  );
}