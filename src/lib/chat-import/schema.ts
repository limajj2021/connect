import { z } from "zod";

export const OWNER_SENDER_LABEL = "我";

export const participantMappingSchema = z.record(
  z.string(),
  z.union([
    z.object({ action: z.literal("link"), contactId: z.string().uuid() }),
    z.object({ action: z.literal("create") }),
    z.object({ action: z.literal("skip") }),
  ]),
);

export type ParticipantMapping = z.infer<typeof participantMappingSchema>;

export const MAX_IMPORT_FILE_BYTES = 15 * 1024 * 1024;
