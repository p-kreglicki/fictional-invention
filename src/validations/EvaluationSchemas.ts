import * as z from 'zod';

export const EvaluationRubricSchema = z.object({
  accuracy: z.number().int().min(0).max(40),
  grammar: z.number().int().min(0).max(30),
  fluency: z.number().int().min(0).max(20),
  bonus: z.number().int().min(0).max(10),
});
