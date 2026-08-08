import { z } from 'zod'

export const TemplateItemSchema = z.object({
  description: z.string().min(1),
  unit: z.string().nullable().optional(),
  quantity: z.number().positive().default(1),
  rate: z.number().nonnegative().nullable().optional(),
  costRate: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string()).default([]),
  isOptional: z.boolean().default(false),
  serviceItemId: z.string().optional(),
})

export const TemplateSectionSchema = z.object({
  name: z.string().min(1),
  items: z.array(TemplateItemSchema).min(1),
  sortOrder: z.number().int().nonnegative().optional(),
})

export const StarterTemplateSchema = z.object({
  name: z.string().min(1),
  sections: z.array(TemplateSectionSchema).min(1),
})

export type StarterTemplate = z.infer<typeof StarterTemplateSchema>
