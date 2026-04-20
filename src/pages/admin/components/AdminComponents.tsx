import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2, AlertTriangle, CheckSquare, XSquare, Calendar, UsersRound, X,
  Phone, Mail, Hash, Pencil, Clock, Users
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";
import { FormField } from "@/components/ui/DashboardUI";

export type Slot = Database["public"]["Tables"]["slots"]["Row"];

export const slotSchema = z
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

export type SlotFormValues = z.infer<typeof slotSchema>;

export interface ConfirmState { slotId: string; title: string; }
export interface ClientsModalTarget { slotId: string; title: string; }

const STATUS_STYLES: Record<Slot["status"], string> = {
  available: "border-l-4 border-l-green-500",
  booked:    "border-l-4 border-l-yellow-400",
  cancelled: "border-l-4 border-l-zinc-500 opacity-50",
};

const STATUS_LABEL: Record<Slot["status"], string> = {
  available: "OPEN",
  booked:    "FULL",
  cancelled: "CANCELLED",
};

// -- MODALS --

export function CancelConfirmModal({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="border-b-2 border-foreground px-6 py-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-foreground/40" style={{ fontFamily: "'Syne', sans-serif" }}>
            Destructive Action
          </p>
          <h2 className="mt-1 text-xl font-black uppercase tracking-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
            Cancel This Slot?
          </h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="text-sm font-medium text-foreground/60">
            You are about to cancel <span className="font-black text-foreground">"{title}"</span>. Clients already in the waitlist will be notified. This cannot be undone automatically.
          </p>
          <div className="flex gap-3">
            <button onClick={onConfirm} className="flex-1 bg-destructive text-destructive-foreground py-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-opacity">
              Yes, Cancel Slot
            </button>
            <button onClick={onCancel} className="flex-1 border-2 border-foreground py-4 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">
              Go Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EditSlotModal({ slot, onClose, onSaved }: { slot: Slot; onClose: () => void; onSaved: () => void; }) {
  const minCapacity = Math.max(1, slot.booked_count);
  const editSchema = z.object({
    title: z.string().min(2, "title must be at least 2 characters"),
    starts_at: z.string().min(1, "start time is required"),
    ends_at: z.string().min(1, "end time is required"),
    capacity: z.coerce.number().int().min(minCapacity, minCapacity > 1 ? `capacity cannot be less than current bookings (${minCapacity})` : "capacity must be at least 1"),
  }).refine((d) => new Date(d.ends_at) > new Date(d.starts_at), { message: "end time must be after start time", path: ["ends_at"] });

  const toLocalDatetime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SlotFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { title: slot.title, capacity: slot.capacity, starts_at: toLocalDatetime(slot.starts_at), ends_at: toLocalDatetime(slot.ends_at) },
  });

  const onSubmit = async (values: SlotFormValues) => {
    const { error } = await supabase.from("slots").update({
      title: values.title, capacity: values.capacity, starts_at: new Date(values.starts_at).toISOString(), ends_at: new Date(values.ends_at).toISOString(),
    }).eq("id", slot.id);

    if (error) { toast.error(error.message); return; }
    toast.success(`"${values.title}" updated`);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[90vh]">
        <div className="border-b-2 border-foreground px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/40" style={{ fontFamily: "'Syne', sans-serif" }}>Editing Slot</p>
            <h2 className="mt-0.5 text-xl font-black uppercase tracking-tight leading-tight" style={{ fontFamily: "'Syne', sans-serif" }}>{slot.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="border-2 border-foreground p-1.5 hover:bg-foreground hover:text-background transition-colors shrink-0"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          <form id="edit-slot-form" onSubmit={handleSubmit(onSubmit)} noValidate className="px-6 py-7 flex flex-col gap-7">
            {slot.booked_count > 0 && (
              <div className="border-2 border-yellow-400/40 bg-yellow-400/5 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-widest text-yellow-500">↳ {slot.booked_count} active bookings — capacity cannot go below {slot.booked_count}</p>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-7">
              <FormField label="Slot Title" error={errors.title?.message}><input {...register("title")} type="text" className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full" /></FormField>
              <FormField label="Capacity" error={errors.capacity?.message}><input {...register("capacity")} type="number" min={minCapacity} className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full" /></FormField>
              <FormField label="Starts At" error={errors.starts_at?.message}><input {...register("starts_at")} type="datetime-local" className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full" /></FormField>
              <FormField label="Ends At" error={errors.ends_at?.message}><input {...register("ends_at")} type="datetime-local" className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full" /></FormField>
            </div>
          </form>
        </div>
        <div className="border-t-2 border-foreground px-6 py-4 flex gap-3 shrink-0">
          <button type="submit" form="edit-slot-form" disabled={isSubmitting} className="flex flex-1 items-center justify-center gap-3 bg-foreground py-4 text-sm font-black uppercase tracking-widest text-background hover:bg-primary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
          <button type="button" onClick={onClose} className="border-2 border-foreground py-4 px-5 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">Discard</button>
        </div>
      </div>
    </div>
  );
}

export function ClientsModal({ target, onClose }: { target: ClientsModalTarget; onClose: () => void; }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      const [{ data: bData, error: bErr }, { data: wData, error: wErr }] = await Promise.all([
        supabase.from("bookings").select("id, profiles(full_name, email, phone)").eq("slot_id", target.slotId) as any,
        supabase.from("waitlist_entries").select("id, position, status, profiles(full_name, email, phone)").eq("slot_id", target.slotId).not("status", "in", '("expired","withdrawn")').order("position", { ascending: true }) as any,
      ]);
      if (bErr || wErr) setError((bErr ?? wErr).message);
      else { setBookings(bData ?? []); setWaitlist(wData ?? []); }
      setLoading(false);
    })();
  }, [target.slotId]);

  const displayName = (row: any) => row.profiles?.full_name?.trim() || row.profiles?.email || "unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[90vh]">
        <div className="border-b-2 border-foreground px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/40" style={{ fontFamily: "'Syne', sans-serif" }}>Client Roster</p>
            <h2 className="mt-0.5 text-xl font-black uppercase tracking-tight leading-tight" style={{ fontFamily: "'Syne', sans-serif" }}>{target.title}</h2>
          </div>
          <button onClick={onClose} className="border-2 border-foreground p-1.5 hover:bg-foreground hover:text-background transition-colors shrink-0"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center gap-3 px-6 py-10 text-foreground/40"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm font-bold uppercase tracking-widest">Fetching roster…</span></div>
          ) : error ? (
            <div className="flex items-start gap-3 bg-destructive text-destructive-foreground p-5 m-6"><AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" /><p className="text-sm font-bold uppercase tracking-wide">{error}</p></div>
          ) : (
            <div className="flex flex-col divide-y-2 divide-foreground/10">
              <section className="px-6 py-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40" style={{ fontFamily: "'Syne', sans-serif" }}>Confirmed Bookings</span>
                  <span className="border border-green-500/40 text-green-500 text-[10px] font-black uppercase tracking-widest px-2 py-0.5">{bookings.length}</span>
                </div>
                {bookings.length === 0 ? (<p className="text-xs font-black uppercase tracking-widest text-foreground/25 py-2">No Clients</p>) : (
                  <div className="flex flex-col gap-2">{bookings.map((b, i) => <ClientRow key={b.id} index={i + 1} name={displayName(b)} email={b.profiles?.email} phone={b.profiles?.phone} accentClass="border-l-green-500" />)}</div>
                )}
              </section>
              <section className="px-6 py-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40" style={{ fontFamily: "'Syne', sans-serif" }}>Waitlist Queue</span>
                  <span className="border border-yellow-400/40 text-yellow-400 text-[10px] font-black uppercase tracking-widest px-2 py-0.5">{waitlist.length}</span>
                </div>
                {waitlist.length === 0 ? (<p className="text-xs font-black uppercase tracking-widest text-foreground/25 py-2">No Clients</p>) : (
                  <div className="flex flex-col gap-2">{waitlist.map((w) => <ClientRow key={w.id} index={w.position} name={displayName(w)} email={w.profiles?.email} phone={w.profiles?.phone} badge={w.status} accentClass="border-l-yellow-400" />)}</div>
                )}
              </section>
            </div>
          )}
        </div>
        <div className="border-t-2 border-foreground px-6 py-4 shrink-0">
          <button onClick={onClose} className="w-full border-2 border-foreground py-3 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">Close Roster</button>
        </div>
      </div>
    </div>
  );
}

function ClientRow({ index, name, email, phone, badge, accentClass }: { index: number; name: string; email?: string; phone?: string | null; badge?: string; accentClass: string; }) {
  return (
    <div className={`border-2 border-foreground/20 border-l-4 ${accentClass} px-4 py-3 flex flex-col gap-1.5`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] font-black text-foreground/30 uppercase tracking-widest"><Hash className="h-2.5 w-2.5" />{index}</span>
        <span className="text-sm font-black uppercase tracking-wide leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>{name}</span>
        {badge && <span className="text-[10px] font-black uppercase tracking-widest border border-foreground/20 px-1.5 py-0.5 text-foreground/40">{badge}</span>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {email && <span className="flex items-center gap-1.5 text-xs text-foreground/50 font-medium"><Mail className="h-3 w-3" />{email}</span>}
        {phone && <span className="flex items-center gap-1.5 text-xs text-foreground/50 font-medium"><Phone className="h-3 w-3" />{phone}</span>}
      </div>
    </div>
  );
}

// -- SLOT CARD --

export function SlotCard({
  slot, isPast, onEdit, onCancel, onRestore, onViewClients,
}: {
  slot: Slot; isPast: boolean; onEdit: () => void; onCancel: () => void; onRestore: (id: string) => void; onViewClients: () => void;
}) {
  const starts = new Date(slot.starts_at);
  const ends = new Date(slot.ends_at);
  const fillPct = Math.round((slot.booked_count / slot.capacity) * 100);

  const fmt = (d: Date) => d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`border-2 border-foreground ${isPast ? "border-l-4 border-l-foreground/20 opacity-70" : STATUS_STYLES[slot.status]} bg-background`}>
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-base font-black uppercase tracking-wide leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>{slot.title}</span>
            <span className="text-[10px] font-black uppercase tracking-widest border border-foreground/30 px-2 py-0.5 text-foreground/50">{isPast ? "ENDED" : STATUS_LABEL[slot.status]}</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-foreground/50 uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />{fmt(starts)}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />ends {fmt(ends)}</span>
            <span className="flex items-center gap-1.5"><Users className="h-3 w-3" />{slot.booked_count} / {slot.capacity}</span>
          </div>
          <div className="h-1.5 w-full bg-foreground/10 mt-1">
             <div className={`h-full transition-all ${isPast || slot.status === "cancelled" ? "bg-foreground/20" : fillPct >= 100 ? "bg-yellow-400" : "bg-green-500"}`} style={{ width: `${Math.min(fillPct, 100)}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {!isPast && slot.status !== "cancelled" && (
            <button onClick={onEdit} className="flex items-center gap-1.5 border-2 border-foreground px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"><Pencil className="h-3.5 w-3.5" />Edit</button>
          )}
          <button onClick={onViewClients} className="flex items-center gap-1.5 border-2 border-foreground px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"><UsersRound className="h-3.5 w-3.5" />Clients</button>
          {!isPast && (
            slot.status !== "cancelled" ? (
              <button onClick={onCancel} className="flex items-center gap-1.5 border-2 border-foreground px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-destructive hover:border-destructive hover:text-destructive-foreground transition-colors"><XSquare className="h-3.5 w-3.5" />Cancel</button>
            ) : (
              <button onClick={() => onRestore(slot.id)} className="flex items-center gap-1.5 border-2 border-foreground px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-green-500 hover:border-green-500 hover:text-background transition-colors"><CheckSquare className="h-3.5 w-3.5" />Restore</button>
            )
          )}
        </div>
      </div>
    </div>
  );
}