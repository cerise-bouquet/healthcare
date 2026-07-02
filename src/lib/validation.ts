import { z } from "zod";

export const genderSchema = z.enum(["FEMALE", "MALE", "OTHER"]);
export const goalSchema = z.enum([
  "LOSE_WEIGHT",
  "MAINTAIN",
  "BUILD_MUSCLE",
  "IMPROVE_FITNESS"
]);
export const activityLevelSchema = z.enum([
  "SEDENTARY",
  "LIGHT",
  "MODERATE",
  "ACTIVE",
  "VERY_ACTIVE"
]);

export const sessionIdSchema = z.string().min(8).max(128);
export const idempotencyKeySchema = z.string().min(8).max(128);
export const versionSchema = z.number().int().positive();

export const stepSchemas = {
  profile: z.object({
    gender: genderSchema,
    age: z.number().int().min(13).max(80)
  }),
  goal: z.object({
    goal: goalSchema,
    targetWeightKg: z.number().min(35).max(250).optional()
  }),
  body: z.object({
    heightCm: z.number().min(120).max(230),
    weightKg: z.number().min(35).max(250),
    targetWeightKg: z.number().min(35).max(250).optional()
  }),
  activity: z.object({
    activityLevel: activityLevelSchema
  }),
  review: z.object({}).strict()
} as const;

export type StepKey = keyof typeof stepSchemas;

export function isStepKey(value: string): value is StepKey {
  return value in stepSchemas;
}
