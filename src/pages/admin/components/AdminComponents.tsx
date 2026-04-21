import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2, Clock, Users, AlertTriangle, CheckSquare,
  XSquare, Calendar, UsersRound, X, Phone, Mail,
  Hash, Pencil, Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type Slot = Database["public"]["Tables"]["slots"]["Row"];

// -- shared constants --

export const STATUS_STYLES: Record<Slot["status"], string> = {
  available: "border-l-4 border-l-green-500",
  booked:    "border-l-4 border-l-yellow-400",
  cancelled: "border-l-4 border-l-zinc-500 opacity-50",
};

export const STATUS_LABEL: Record<Slot["status"], string> = {
  available: "OPEN",
  booked:    "FULL",
  cancelled: "CANCELLED",
};

// -- shared types --

export interface ConfirmState { slotId: string; title: string; }
export interface ClientsModalTarget { slotId: string; title: string; }

interface BookingRow {
  id: string;
  profiles: { full_name: string | null; email: string; phone?: string | null } | null;
}

interface WaitlistRow {
  id: string;
  position: number;
  status: string;
  profiles: { full_name: string | null; email: string; phone?: string | null } | null;
}

// -- shared schemas & helpers --

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

function buildEditSchema(minCapacity: number) {
  return z
    .object({
      title:     z.string().min(2, "title must be at least 2 characters"),
      starts_at: z.string().min(1, "start time is required"),
      ends_at:   z.string().min(1, "end time is required"),
      capacity:  z.coerce.number().int().min(
        minCapacity,
        minCapacity > 1
          ? `capacity cannot be less than current bookings (${minCapacity})`
          : "capacity must be at least 1"
      ),
    })
    .refine((d) => new Date(d.ends_at) > new Date(d.starts_at), {
      message: "end time must be after start time",
      path: ["ends_at"],
    });
}

type EditSlotFormValues = {
  title: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
};

// -- UI Primitives --

export function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode; }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50">{label}</label>
      {children}
      {error && <p className="text-xs font-bold uppercase tracking-wider text-destructive">↳ {error}</p>}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-destructive text-destructive-foreground p-5">
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
      <p className="text-base font-bold uppercase tracking-wide leading-snug">{message}</p>
    </div>
  );
}

// -- Components --

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

export function SlotCard({
  slot, isPast, onEdit, onCancel, onRestore, onViewClients,
}: {
  slot: Slot; isPast: boolean; onEdit: () => void; onCancel: () => void; onRestore: (id: string) => void; onViewClients: () => void;
}) {
  const starts  = new Date(slot.starts_at);
  const ends    = new Date(slot.ends_at);
  const fillPct = Math.round((slot.booked_count / slot.capacity) * 100);

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`border-2 border-foreground ${isPast ? "border-l-4 border-l-foreground/20 opacity-70" : STATUS_STYLES[slot.status]} bg-background`}>
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-base font-black uppercase tracking-wide leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>{slot.title}</span>
            <span className="text-[10px] font-black uppercase tracking-widest border border-foreground/30 px-2 py-0.5 text-foreground/50">
              {isPast ? "ENDED" : STATUS_LABEL[slot.status]}
            </span>
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

export function EditSlotModal({
  slot,
  onClose,
  onSaved,
}: {
  slot: Slot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const minCapacity = Math.max(1, slot.booked_count);
  const editSchema  = buildEditSchema(minCapacity);

  const toLocalDatetime = (iso: string) => {
    const d   = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EditSlotFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { title: slot.title, capacity: slot.capacity, starts_at: toLocalDatetime(slot.starts_at), ends_at: toLocalDatetime(slot.ends_at) },
  });

  const onSubmit = async (values: EditSlotFormValues) => {
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
                <p className="text-xs font-black uppercase tracking-widest text-yellow-500">↳ {slot.booked_count} active booking{slot.booked_count > 1 ? "s" : ""} — capacity cannot go below {slot.booked_count}</p>
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

export function ClientsModal({
  target,
  onClose,
}: {
  target: ClientsModalTarget;
  onClose: () => void;
}) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      const [{ data: bData, error: bErr }, { data: wData, error: wErr }] = await Promise.all([
          (supabase.from("bookings").select("id, profiles(full_name, email, phone)").eq("slot_id", target.slotId)) as any,
          (supabase.from("waitlist_entries").select("id, position, status, profiles(full_name, email, phone)").eq("slot_id", target.slotId).not("status", "in", '("expired","withdrawn")').order("position", { ascending: true })) as any,
        ]);
      if (bErr || wErr) setError((bErr ?? wErr).message);
      else { setBookings((bData as BookingRow[]) ?? []); setWaitlist((wData as WaitlistRow[]) ?? []); }
      setLoading(false);
    })();
  }, [target.slotId]);

  const displayName = (row: BookingRow | WaitlistRow) => row.profiles?.full_name?.trim() || row.profiles?.email || "unknown";

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
            <div className="m-6"><ErrorBlock message={error} /></div>
          ) : (
            <div className="flex flex-col divide-y-2 divide-foreground/10">
              <section className="px-6 py-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40" style={{ fontFamily: "'Syne', sans-serif" }}>Confirmed Bookings</span>
                  <span className="border border-green-500/40 text-green-500 text-[10px] font-black uppercase tracking-widest px-2 py-0.5">{bookings.length}</span>
                </div>
                {bookings.length === 0 ? (
                  <p className="text-xs font-black uppercase tracking-widest text-foreground/25 py-2">No Clients</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {bookings.map((b, i) => <ClientRow key={b.id} index={i + 1} name={displayName(b)} email={b.profiles?.email} phone={(b.profiles as any)?.phone} accentClass="border-l-green-500" />)}
                  </div>
                )}
              </section>
              <section className="px-6 py-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40" style={{ fontFamily: "'Syne', sans-serif" }}>Waitlist Queue</span>
                  <span className="border border-yellow-400/40 text-yellow-400 text-[10px] font-black uppercase tracking-widest px-2 py-0.5">{waitlist.length}</span>
                </div>
                {waitlist.length === 0 ? (
                  <p className="text-xs font-black uppercase tracking-widest text-foreground/25 py-2">No Clients</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {waitlist.map((w) => <ClientRow key={w.id} index={w.position} name={displayName(w)} email={w.profiles?.email} phone={(w.profiles as any)?.phone} badge={w.status} accentClass="border-l-yellow-400" />)}
                  </div>
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

function ClientRow({
  index, name, email, phone, badge, accentClass,
}: {
  index: number; name: string; email?: string; phone?: string | null; badge?: string; accentClass: string;
}) {
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

// -- BulkGeneratorModal --

const DAYS_OF_WEEK = [
  { label: "Mon", value: 1 }, { label: "Tue", value: 2 }, { label: "Wed", value: 3 },
  { label: "Thu", value: 4 }, { label: "Fri", value: 5 }, { label: "Sat", value: 6 }, { label: "Sun", value: 0 },
] as const;

const bulkSchema = z.object({
    title:         z.string().min(2, "title must be at least 2 characters"),
    capacity:      z.coerce.number().int().min(1, "capacity must be at least 1"),
    startDate:     z.string().min(1, "start date is required"),
    endDate:       z.string().min(1, "end date is required"),
    startTime:     z.string().min(1, "start time is required"),
    endTime:       z.string().min(1, "end time is required"),
    slotDuration:  z.coerce.number().int().min(1, "duration must be at least 1 minute"),
    breakDuration: z.coerce.number().int().min(0, "break cannot be negative"),
    daysOfWeek:    z.array(z.number()).min(1, "select at least one day"),
  })
  .refine((d) => new Date(d.endDate) >= new Date(d.startDate), { message: "end date must be on or after start date", path: ["endDate"] })
  .refine((d) => d.endTime > d.startTime, { message: "end time must be after start time", path: ["endTime"] });

type BulkFormValues = z.infer<typeof bulkSchema>;

interface GeneratedSlot {
  business_id:  string; title: string; starts_at: string; ends_at: string;
  capacity:     number; booked_count: number; status: "available";
}

function generateSlots(values: BulkFormValues, businessId: string): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];
  const [startHour, startMin] = values.startTime.split(":").map(Number);
  const [endHour, endMin]     = values.endTime.split(":").map(Number);
  const dayEndMinutes         = endHour * 60 + endMin;

  const cursor = new Date(values.startDate + "T00:00:00");
  const last   = new Date(values.endDate   + "T00:00:00");

  while (cursor <= last) {
    const dayOfWeek = cursor.getDay();
    if (values.daysOfWeek.includes(dayOfWeek)) {
      let slotStartMinutes = startHour * 60 + startMin;
      while (true) {
        const slotEndMinutes = slotStartMinutes + values.slotDuration;
        if (slotEndMinutes > dayEndMinutes) break;

        const startsAt = new Date(cursor); startsAt.setHours(Math.floor(slotStartMinutes / 60), slotStartMinutes % 60, 0, 0);
        const endsAt = new Date(cursor); endsAt.setHours(Math.floor(slotEndMinutes / 60), slotEndMinutes % 60, 0, 0);

        slots.push({
          business_id: businessId, title: values.title, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
          capacity: values.capacity, booked_count: 0, status: "available",
        });
        slotStartMinutes = slotEndMinutes + values.breakDuration;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}

export function BulkGeneratorModal({ businessId, onClose, onSaved }: { businessId: string; onClose: () => void; onSaved: () => void; }) {
  const today = new Date().toISOString().split("T")[0];

  const { register, handleSubmit, control, watch, formState: { errors, isSubmitting } } = useForm<BulkFormValues>({
    resolver: zodResolver(bulkSchema),
    defaultValues: { title: "", capacity: 1, startDate: today, endDate: today, startTime: "09:00", endTime: "17:00", slotDuration: 30, breakDuration: 0, daysOfWeek: [1, 2, 3, 4, 5] },
  });

  const watchedValues = watch();
  const previewCount = (() => {
    try {
      if (!watchedValues.startDate || !watchedValues.endDate || !watchedValues.startTime || !watchedValues.endTime || !watchedValues.slotDuration || watchedValues.daysOfWeek?.length === 0) return 0;
      return generateSlots(watchedValues as BulkFormValues, businessId).length;
    } catch { return 0; }
  })();

  const onSubmit = async (values: BulkFormValues) => {
    const generated = generateSlots(values, businessId);
    if (generated.length === 0) { toast.error("no slots could be generated — check your date range and day selection"); return; }

    const CHUNK = 500; let inserted = 0;
    for (let i = 0; i < generated.length; i += CHUNK) {
      const chunk = generated.slice(i, i + CHUNK);
      const { error } = await supabase.from("slots").insert(chunk);
      if (error) { toast.error(error.message); return; }
      inserted += chunk.length;
    }
    toast.success(`${inserted} slot${inserted !== 1 ? "s" : ""} created`); onSaved(); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4 overflow-y-auto pt-10">
      <div className="w-full max-w-2xl border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col my-auto max-h-[90vh]">
        <div className="border-b-4 border-foreground px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/50" style={{ fontFamily: "'Syne', sans-serif" }}>Smart Schedule Generator</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight leading-tight" style={{ fontFamily: "'Syne', sans-serif" }}>Bulk Generate Slots</h2>
          </div>
          <button type="button" onClick={onClose} className="border-2 border-foreground p-2 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors shrink-0"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 bg-foreground/5">
          <form id="bulk-gen-form" onSubmit={handleSubmit(onSubmit)} noValidate className="px-6 py-8 flex flex-col gap-10">
            <div className="flex flex-col gap-4">
              <SectionLabel>Slot Identity</SectionLabel>
              <div className="grid sm:grid-cols-2 gap-7">
                <FormField label="Title (applied to all slots)" error={errors.title?.message}><input {...register("title")} type="text" placeholder="e.g. Consultation" className="border-b-4 border-foreground bg-background py-3 px-2 text-xl outline-none focus:bg-white w-full" /></FormField>
                <FormField label="Capacity per slot" error={errors.capacity?.message}><input {...register("capacity")} type="number" min={1} className="border-b-4 border-foreground bg-background py-3 px-2 text-xl outline-none focus:bg-white w-full" /></FormField>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <SectionLabel>Date Range</SectionLabel>
              <div className="grid sm:grid-cols-2 gap-7">
                <FormField label="Start Date" error={errors.startDate?.message}><input {...register("startDate")} type="date" min={today} className="border-b-4 border-foreground bg-background py-3 px-2 text-xl outline-none focus:bg-white w-full" /></FormField>
                <FormField label="End Date" error={errors.endDate?.message}><input {...register("endDate")} type="date" min={today} className="border-b-4 border-foreground bg-background py-3 px-2 text-xl outline-none focus:bg-white w-full" /></FormField>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <SectionLabel>Daily Time Window</SectionLabel>
              <div className="grid sm:grid-cols-2 gap-7">
                <FormField label="Day Starts At" error={errors.startTime?.message}><input {...register("startTime")} type="time" className="border-b-4 border-foreground bg-background py-3 px-2 text-xl outline-none focus:bg-white w-full" /></FormField>
                <FormField label="Day Ends At" error={errors.endTime?.message}><input {...register("endTime")} type="time" className="border-b-4 border-foreground bg-background py-3 px-2 text-xl outline-none focus:bg-white w-full" /></FormField>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <SectionLabel>Slot & Break Duration</SectionLabel>
              <div className="grid sm:grid-cols-2 gap-7">
                <FormField label="Slot Duration (minutes)" error={errors.slotDuration?.message}><input {...register("slotDuration")} type="number" min={1} className="border-b-4 border-foreground bg-background py-3 px-2 text-xl outline-none focus:bg-white w-full" /></FormField>
                <FormField label="Break Between Slots (minutes)" error={errors.breakDuration?.message}><input {...register("breakDuration")} type="number" min={0} className="border-b-4 border-foreground bg-background py-3 px-2 text-xl outline-none focus:bg-white w-full" /></FormField>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <SectionLabel>Active Days</SectionLabel>
              {errors.daysOfWeek && <p className="text-xs font-bold uppercase tracking-wider text-destructive">↳ {errors.daysOfWeek.message}</p>}
              <Controller name="daysOfWeek" control={control} render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => {
                      const active = field.value?.includes(day.value);
                      return (
                        <button key={day.value} type="button" onClick={() => field.onChange(active ? field.value.filter((v) => v !== day.value) : [...(field.value ?? []), day.value])}
                          className={`border-4 px-5 py-3 text-sm font-black uppercase tracking-widest transition-transform hover:-translate-y-0.5 ${active ? "border-foreground bg-foreground text-background shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" : "border-foreground/30 bg-background text-foreground/50 hover:border-foreground hover:text-foreground"}`}>
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>
            
            {/* NOUL DESIGN PENTRU ESTIMATED SLOTS */}
            <div className={`border-4 border-foreground px-6 py-6 flex items-center justify-between ${previewCount > 0 ? 'bg-green-400/20' : 'bg-background'}`}>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/50">
                  Estimated Generation
                </span>
                <div className="flex items-baseline gap-2">
                  <span className={`text-6xl font-black leading-none tracking-tighter ${previewCount > 0 ? "text-green-600" : "text-foreground/30"}`}>
                    {previewCount}
                  </span>
                  <span className="text-base font-black uppercase tracking-widest text-foreground/50">
                    Slots
                  </span>
                </div>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/40 max-w-[160px] text-right leading-relaxed">
                Final count confirmed on submit
              </p>
            </div>
            {/* END NOUL DESIGN */}

          </form>
        </div>
        <div className="border-t-4 border-foreground px-6 py-5 flex gap-4 shrink-0 bg-background">
          <button type="submit" form="bulk-gen-form" disabled={isSubmitting || previewCount === 0} className="flex flex-1 items-center justify-center gap-3 bg-foreground py-5 text-base font-black uppercase tracking-widest text-background hover:bg-primary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" />Generating…</> : <><Zap className="h-5 w-5" />Generate {previewCount > 0 ? `${previewCount} Slots` : "Slots"}</>}
          </button>
          <button type="button" onClick={onClose} className="border-4 border-foreground py-5 px-8 text-base font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}