import { z } from "zod";

export const loanBodySchema = z
  .object({
    copy_id: z.string().uuid().optional(),
    resource_id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
  })
  .refine(
    (data) => Boolean(data.copy_id) !== Boolean(data.resource_id),
    {
      message: "Provide either copy_id or resource_id, not both.",
    }
  );

export const reservationBodySchema = z.object({
  resource_id: z.string().uuid(),
});
