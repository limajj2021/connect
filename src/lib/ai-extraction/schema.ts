import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

/**
 * One structured item the model extracts from a chunk of chat messages.
 * `sourceMessageRefs` are the small integer `ref` numbers assigned to messages
 * within that chunk (see chunk.ts) — never a real database id, since the model
 * never sees our UUIDs. The pipeline maps them back to `chat_messages.id`
 * before anything is written to `chat_extractions`.
 */
export const extractionItemSchema = z.object({
  category: z.enum(["person", "company", "topic", "fact", "date_event", "todo"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  relatedContactName: z.string().trim().max(200).nullable().optional(),
  sourceMessageRefs: z.array(z.number().int().nonnegative()).min(1),
  confidence: z.enum(["confirmed", "needs_review"]),

  // category: "person"
  companyName: z.string().trim().max(200).nullable().optional(),
  jobTitle: z.string().trim().max(200).nullable().optional(),
  lineName: z.string().trim().max(200).nullable().optional(),
  relationshipNotes: z.string().trim().max(500).nullable().optional(),

  // category: "todo"
  assignee: z.string().trim().max(200).nullable().optional(),
  dueDate: isoDate,
  isCompleted: z.boolean().optional(),

  // category: "date_event"
  eventDate: isoDate,
});

export type ExtractionItem = z.infer<typeof extractionItemSchema>;

export const extractionResponseSchema = z.object({
  items: z.array(extractionItemSchema),
});

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;
