import { z } from 'zod';
import {
  EventId,
  OrderId,
  OxyAccountId,
  ResaleListingId,
  TicketId,
  TicketTypeId,
  WaitlistEntryId,
} from './ids';
import { CurrencyCode, MinorUnits } from './money';

const IsoInstant = z.iso.datetime();

/**
 * How a ticket type is paid for. `online` and the online branch of `choice` stay
 * disabled until the Peable rail is connected (ADR 0001 §3); the model carries
 * them so enabling it changes no schema.
 */
export const PaymentMode = z.enum(['free', 'door', 'online', 'choice']);
export type PaymentMode = z.infer<typeof PaymentMode>;

/** What the buyer actually picked on an order line. */
export const PaymentChoice = z.enum(['free', 'door', 'online']);
export type PaymentChoice = z.infer<typeof PaymentChoice>;

export const TicketType = z
  .object({
    id: TicketTypeId,
    eventId: EventId,
    name: z.string().min(1).max(120),
    description: z.string().max(1000).nullable(),
    priceAmount: MinorUnits,
    currency: CurrencyCode,
    paymentMode: PaymentMode,
    quota: z.number().int().positive(),
    remaining: z.number().int().nonnegative(),
    perPersonLimit: z.number().int().positive().max(100),
    salesStartAt: IsoInstant.nullable(),
    salesEndAt: IsoInstant.nullable(),
    named: z.boolean(),
    transferable: z.boolean(),
    resellable: z.boolean(),
    /** Highest resale price as a percentage of face value; null = no resale above face. */
    resaleCapPercent: z.number().int().min(100).max(1000).nullable(),
    hidden: z.boolean(),
  })
  .strict();
export type TicketType = z.infer<typeof TicketType>;

const ticketTypeInputShape = {
  name: TicketType.shape.name,
  description: TicketType.shape.description.optional(),
  priceAmount: MinorUnits,
  currency: CurrencyCode,
  paymentMode: PaymentMode,
  quota: TicketType.shape.quota,
  perPersonLimit: TicketType.shape.perPersonLimit.default(10),
  salesStartAt: IsoInstant.nullable().optional(),
  salesEndAt: IsoInstant.nullable().optional(),
  named: z.boolean().default(false),
  transferable: z.boolean().default(true),
  resellable: z.boolean().default(false),
  resaleCapPercent: TicketType.shape.resaleCapPercent.optional(),
  hidden: z.boolean().default(false),
};

export const TicketTypeInput = z
  .object(ticketTypeInputShape)
  .strict()
  .refine((t) => (t.paymentMode === 'free') === (BigInt(t.priceAmount) === 0n), {
    message: 'a ticket type is free exactly when its price is zero',
    path: ['priceAmount'],
  })
  .refine(
    (t) =>
      !t.salesStartAt || !t.salesEndAt || Date.parse(t.salesEndAt) > Date.parse(t.salesStartAt),
    {
      message: 'salesEndAt must be after salesStartAt',
      path: ['salesEndAt'],
    },
  );
export type TicketTypeInput = z.infer<typeof TicketTypeInput>;

export const OrderLineInput = z
  .object({
    ticketTypeId: TicketTypeId,
    quantity: z.number().int().min(1).max(100),
    /** Required only when the ticket type's mode is `choice`. */
    payWith: PaymentChoice.optional(),
    /** Required for each ticket of a named ticket type, in order. */
    holders: z
      .array(z.object({ name: z.string().trim().min(1).max(120) }).strict())
      .max(100)
      .optional(),
  })
  .strict();

export const OrderInput = z
  .object({
    eventId: EventId,
    lines: z.array(OrderLineInput).min(1).max(10),
  })
  .strict();
export type OrderInput = z.infer<typeof OrderInput>;

export const OrderStatus = z.enum(['reserved', 'confirmed', 'expired', 'cancelled']);
export const PaymentStatus = z.enum([
  'not_required',
  'not_collected',
  'pending',
  'paid',
  'refunded',
  'failed',
]);

export const TicketStatus = z.enum(['valid', 'used', 'listed', 'cancelled']);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const Ticket = z
  .object({
    id: TicketId,
    orderId: OrderId,
    eventId: EventId,
    ticketTypeId: TicketTypeId,
    holderOxyAccountId: OxyAccountId,
    holderName: z.string().nullable(),
    status: TicketStatus,
    paymentChoice: PaymentChoice,
    paymentStatus: PaymentStatus,
    checkedInAt: IsoInstant.nullable(),
  })
  .strict();
export type Ticket = z.infer<typeof Ticket>;

export const Order = z
  .object({
    id: OrderId,
    eventId: EventId,
    status: OrderStatus,
    expiresAt: IsoInstant.nullable(),
    totalAmount: MinorUnits,
    currency: CurrencyCode.nullable(),
    paymentStatus: PaymentStatus,
    tickets: z.array(Ticket),
    createdAt: IsoInstant,
  })
  .strict();
export type Order = z.infer<typeof Order>;

/** A ticket's admission code. Short-lived and signed; shown only to its holder. */
export const TicketCode = z
  .object({ ticketId: TicketId, code: z.string().min(1).max(512), expiresAt: IsoInstant })
  .strict();

export const TransferInput = z
  .object({
    toOxyAccountId: OxyAccountId,
    /** Required when the ticket type is named: the new holder's name on the ticket. */
    holderName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const ResaleStatus = z.enum(['active', 'sold', 'withdrawn']);
export const ResaleListing = z
  .object({
    id: ResaleListingId,
    ticketId: TicketId,
    eventId: EventId,
    sellerOxyAccountId: OxyAccountId,
    priceAmount: MinorUnits,
    currency: CurrencyCode,
    status: ResaleStatus,
    createdAt: IsoInstant,
  })
  .strict();
export type ResaleListing = z.infer<typeof ResaleListing>;
export const ResaleListingInput = z
  .object({ ticketId: TicketId, priceAmount: MinorUnits })
  .strict();
export const ResaleBuyInput = z
  .object({ holderName: z.string().trim().min(1).max(120).optional() })
  .strict();

export const WaitlistStatus = z.enum(['waiting', 'offered', 'claimed', 'expired', 'left']);
export const WaitlistEntry = z
  .object({
    id: WaitlistEntryId,
    ticketTypeId: TicketTypeId,
    status: WaitlistStatus,
    quantity: z.number().int().positive().max(100),
    offerExpiresAt: IsoInstant.nullable(),
    position: z.number().int().positive().nullable(),
  })
  .strict();
export const WaitlistClaimInput = z.object({ idempotencyKey: z.string().min(8).max(80) }).strict();
export const WaitlistInput = z
  .object({ ticketTypeId: TicketTypeId, quantity: z.number().int().min(1).max(100).default(1) })
  .strict();

/** A door scan. `code` is what the ticket's QR carries. */
export const ScanInput = z
  .object({ eventId: EventId, code: z.string().min(1).max(512), scannedAt: IsoInstant.optional() })
  .strict();
export const ScanResult = z
  .object({
    result: z.enum([
      'admitted',
      'already_used',
      'invalid',
      'wrong_event',
      'cancelled',
      'expired_code',
    ]),
    ticketId: TicketId.nullable(),
    holderName: z.string().nullable(),
    ticketTypeName: z.string().nullable(),
  })
  .strict();
export type ScanResult = z.infer<typeof ScanResult>;

/** A batch of scans recorded offline, replayed when the scanner is back online. */
export const ScanBatchInput = z
  .object({
    eventId: EventId,
    scans: z
      .array(ScanInput.omit({ eventId: true }).required({ scannedAt: true }))
      .min(1)
      .max(500),
  })
  .strict();

export const AttendanceState = z.enum(['going', 'interested']);
export const AttendanceInput = z.object({ state: AttendanceState.nullable() }).strict();

export type TicketCode = z.infer<typeof TicketCode>;
export type ScanInput = z.infer<typeof ScanInput>;
export type ScanBatchInput = z.infer<typeof ScanBatchInput>;
export type WaitlistEntry = z.infer<typeof WaitlistEntry>;
