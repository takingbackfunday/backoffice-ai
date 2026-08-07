import { z } from 'zod'

export const TemplateItemSchema = z.object({
  description: z.string().min(1),
  unit: z.string().nullable().optional(),
  quantity: z.number().positive().default(1),
  rate: z.number().nonnegative().nullable().optional(),
  costRate: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string()).default([]),
  isOptional: z.boolean().default(false),
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

export interface StarterTrade {
  id: string
  label: string
  templates: StarterTemplate[]
}

export const STARTER_TRADES: StarterTrade[] = [
  {
    id: 'videographer',
    label: 'Videographer',
    templates: [
      {
        name: 'Video Production Project',
        sections: [
          {
            name: 'Pre-production',
            items: [
              { description: 'Discovery call', unit: 'x', quantity: 1, rate: 150, tags: [], isOptional: false },
              { description: 'Concept & script', unit: 'x', quantity: 1, rate: 600, tags: [], isOptional: false },
              { description: 'Storyboard', unit: 'x', quantity: 1, rate: 400, tags: [], isOptional: false },
            ],
          },
          {
            name: 'Production',
            items: [
              { description: 'Shoot day', unit: 'day', quantity: 2, rate: 800, tags: [], isOptional: false },
              { description: 'Kit hire', unit: 'day', quantity: 2, rate: 150, tags: [], isOptional: false },
            ],
          },
          {
            name: 'Post-production',
            items: [
              { description: 'Edit', unit: 'hr', quantity: 10, rate: 80, tags: [], isOptional: false },
              { description: 'Revision rounds', unit: 'x', quantity: 2, rate: 200, tags: [], isOptional: false },
              { description: 'Color grade', unit: 'x', quantity: 1, rate: 300, tags: [], isOptional: false },
              { description: 'Music licensing', unit: 'x', quantity: 1, rate: 150, tags: [], isOptional: false },
            ],
          },
          {
            name: 'Other',
            items: [
              { description: 'Travel', unit: 'x', quantity: 1, rate: 100, tags: [], isOptional: false },
              { description: 'Contingency', unit: 'x', quantity: 1, rate: 250, tags: [], isOptional: true },
            ],
          },
        ],
      },
      {
        name: 'Event Coverage',
        sections: [
          {
            name: 'Coverage',
            items: [
              { description: 'Full-day coverage', unit: 'day', quantity: 1, rate: 1000, tags: [], isOptional: false },
              { description: 'Half-day coverage', unit: 'day', quantity: 1, rate: 600, tags: [], isOptional: true },
              { description: 'Second shooter', unit: 'day', quantity: 1, rate: 400, tags: [], isOptional: true },
            ],
          },
          {
            name: 'Post-production',
            items: [
              { description: 'Highlight edit', unit: 'hr', quantity: 4, rate: 80, tags: [], isOptional: false },
              { description: 'Full edit', unit: 'hr', quantity: 8, rate: 80, tags: [], isOptional: false },
              { description: 'Rush delivery', unit: 'x', quantity: 1, rate: 200, tags: [], isOptional: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'photographer',
    label: 'Photographer',
    templates: [
      {
        name: 'Portrait Session',
        sections: [
          {
            name: 'Session',
            items: [
              { description: 'Portrait session', unit: 'x', quantity: 1, rate: 350, tags: [], isOptional: false },
              { description: 'Additional hour', unit: 'x', quantity: 1, rate: 150, tags: [], isOptional: true },
            ],
          },
          {
            name: 'Deliverables',
            items: [
              { description: 'Retouched images', unit: 'x', quantity: 10, rate: 25, tags: [], isOptional: false },
              { description: 'Print package', unit: 'x', quantity: 1, rate: 100, tags: [], isOptional: true },
            ],
          },
        ],
      },
      {
        name: 'Event Photography',
        sections: [
          {
            name: 'Coverage',
            items: [
              { description: 'Event coverage', unit: 'hr', quantity: 4, rate: 175, tags: [], isOptional: false },
              { description: 'Travel', unit: 'x', quantity: 1, rate: 80, tags: [], isOptional: false },
            ],
          },
          {
            name: 'Post-production',
            items: [
              { description: 'Editing & retouching', unit: 'hr', quantity: 6, rate: 60, tags: [], isOptional: false },
              { description: 'Online gallery', unit: 'x', quantity: 1, rate: 50, tags: [], isOptional: false },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'designer',
    label: 'Graphic / Brand Designer',
    templates: [
      {
        name: 'Brand Identity',
        sections: [
          {
            name: 'Brand identity',
            items: [
              { description: 'Discovery workshop', unit: 'x', quantity: 1, rate: 500, tags: [], isOptional: false },
              { description: 'Logo concepts', unit: 'x', quantity: 3, rate: 400, tags: [], isOptional: false },
              { description: 'Refinement rounds', unit: 'x', quantity: 2, rate: 300, tags: [], isOptional: false },
              { description: 'Brand guidelines', unit: 'x', quantity: 1, rate: 800, tags: [], isOptional: false },
              { description: 'Asset pack', unit: 'x', quantity: 1, rate: 350, tags: [], isOptional: false },
            ],
          },
        ],
      },
      {
        name: 'Design Retainer (Monthly)',
        sections: [
          {
            name: 'Monthly retainer',
            items: [
              { description: 'Design support', unit: 'hr', quantity: 20, rate: 75, tags: [], isOptional: false },
              { description: 'Priority turnaround', unit: 'x', quantity: 1, rate: 200, tags: [], isOptional: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'web-developer',
    label: 'Web Developer',
    templates: [
      {
        name: 'Website Build',
        sections: [
          {
            name: 'Website build',
            items: [
              { description: 'Discovery & spec', unit: 'x', quantity: 1, rate: 600, tags: [], isOptional: false },
              { description: 'Design implementation', unit: 'hr', quantity: 20, rate: 90, tags: [], isOptional: false },
              { description: 'Development', unit: 'hr', quantity: 40, rate: 95, tags: [], isOptional: false },
              { description: 'CMS setup', unit: 'hr', quantity: 8, rate: 90, tags: [], isOptional: false },
              { description: 'QA & launch', unit: 'hr', quantity: 8, rate: 90, tags: [], isOptional: false },
              { description: 'Training', unit: 'hr', quantity: 2, rate: 90, tags: [], isOptional: false },
            ],
          },
        ],
      },
      {
        name: 'Maintenance Plan (Monthly)',
        sections: [
          {
            name: 'Monthly maintenance',
            items: [
              { description: 'Updates & backups', unit: 'hr', quantity: 2, rate: 90, tags: [], isOptional: false },
              { description: 'Support hours', unit: 'hr', quantity: 3, rate: 90, tags: [], isOptional: false },
              { description: 'Hosting', unit: 'x', quantity: 1, rate: 30, tags: [], isOptional: false },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'copywriter',
    label: 'Copywriter',
    templates: [
      {
        name: 'Website Copy',
        sections: [
          {
            name: 'Website copy',
            items: [
              { description: 'Homepage', unit: 'x', quantity: 1, rate: 600, tags: [], isOptional: false },
              { description: 'Interior pages', unit: 'x', quantity: 4, rate: 300, tags: [], isOptional: false },
              { description: 'About page', unit: 'x', quantity: 1, rate: 350, tags: [], isOptional: false },
              { description: 'Revision rounds', unit: 'x', quantity: 2, rate: 150, tags: [], isOptional: false },
            ],
          },
        ],
      },
      {
        name: 'Content Package (Monthly)',
        sections: [
          {
            name: 'Monthly content',
            items: [
              { description: 'Blog posts', unit: 'x', quantity: 4, rate: 250, tags: [], isOptional: false },
              { description: 'Newsletter', unit: 'x', quantity: 1, rate: 200, tags: [], isOptional: false },
              { description: 'Social captions', unit: 'x', quantity: 8, rate: 25, tags: [], isOptional: false },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing Consultant',
    templates: [
      {
        name: 'Marketing Strategy',
        sections: [
          {
            name: 'Strategy',
            items: [
              { description: 'Marketing audit', unit: 'x', quantity: 1, rate: 900, tags: [], isOptional: false },
              { description: 'Strategy document', unit: 'x', quantity: 1, rate: 1200, tags: [], isOptional: false },
              { description: 'Channel plan', unit: 'x', quantity: 1, rate: 600, tags: [], isOptional: false },
              { description: 'Review sessions', unit: 'x', quantity: 2, rate: 150, tags: [], isOptional: false },
            ],
          },
        ],
      },
      {
        name: 'Social Media Management (Monthly)',
        sections: [
          {
            name: 'Monthly management',
            items: [
              { description: 'Content calendar', unit: 'x', quantity: 1, rate: 400, tags: [], isOptional: false },
              { description: 'Posts', unit: 'x', quantity: 12, rate: 60, tags: [], isOptional: false },
              { description: 'Community management', unit: 'hr', quantity: 8, rate: 50, tags: [], isOptional: false },
              { description: 'Monthly report', unit: 'x', quantity: 1, rate: 200, tags: [], isOptional: false },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'consultant',
    label: 'Business Consultant / Coach',
    templates: [
      {
        name: 'Consulting Engagement',
        sections: [
          {
            name: 'Engagement',
            items: [
              { description: 'Discovery sessions', unit: 'x', quantity: 2, rate: 200, tags: [], isOptional: false },
              { description: 'Analysis', unit: 'hr', quantity: 10, rate: 180, tags: [], isOptional: false },
              { description: 'Recommendations report', unit: 'x', quantity: 1, rate: 1500, tags: [], isOptional: false },
              { description: 'Implementation support', unit: 'hr', quantity: 6, rate: 180, tags: [], isOptional: false },
            ],
          },
        ],
      },
      {
        name: 'Advisory Retainer (Monthly)',
        sections: [
          {
            name: 'Monthly advisory',
            items: [
              { description: 'Advisory calls', unit: 'x', quantity: 4, rate: 200, tags: [], isOptional: false },
              { description: 'Async support', unit: 'x', quantity: 1, rate: 300, tags: [], isOptional: false },
              { description: 'Quarterly review', unit: 'x', quantity: 1, rate: 500, tags: [], isOptional: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'illustrator',
    label: 'Illustrator / Motion Designer',
    templates: [
      {
        name: 'Illustration Commission',
        sections: [
          {
            name: 'Commission',
            items: [
              { description: 'Concept sketches', unit: 'x', quantity: 2, rate: 250, tags: [], isOptional: false },
              { description: 'Final illustrations', unit: 'x', quantity: 3, rate: 400, tags: [], isOptional: false },
              { description: 'Revision round', unit: 'x', quantity: 1, rate: 150, tags: [], isOptional: false },
              { description: 'Commercial license', unit: 'x', quantity: 1, rate: 300, tags: [], isOptional: false },
            ],
          },
        ],
      },
      {
        name: 'Motion Graphics',
        sections: [
          {
            name: 'Motion graphics',
            items: [
              { description: 'Storyboard', unit: 'x', quantity: 1, rate: 400, tags: [], isOptional: false },
              { description: 'Animation', unit: 'hr', quantity: 10, rate: 85, tags: [], isOptional: false },
              { description: 'Sound design', unit: 'x', quantity: 1, rate: 250, tags: [], isOptional: false },
              { description: 'Revision rounds', unit: 'x', quantity: 2, rate: 150, tags: [], isOptional: false },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'event-planner',
    label: 'Event Planner',
    templates: [
      {
        name: 'Full Event Planning',
        sections: [
          {
            name: 'Event planning',
            items: [
              { description: 'Planning & coordination', unit: 'x', quantity: 1, rate: 2500, tags: [], isOptional: false },
              { description: 'Vendor management', unit: 'x', quantity: 1, rate: 800, tags: [], isOptional: false },
              { description: 'Day-of coordination', unit: 'hr', quantity: 10, rate: 75, tags: [], isOptional: false },
              { description: 'Contingency', unit: 'x', quantity: 1, rate: 400, tags: [], isOptional: true },
            ],
          },
        ],
      },
      {
        name: 'Day-of Coordination',
        sections: [
          {
            name: 'Day-of',
            items: [
              { description: 'Prep meetings', unit: 'x', quantity: 2, rate: 75, tags: [], isOptional: false },
              { description: 'Day-of coordination', unit: 'hr', quantity: 10, rate: 75, tags: [], isOptional: false },
              { description: 'Assistant coordinator', unit: 'x', quantity: 1, rate: 300, tags: [], isOptional: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'virtual-assistant',
    label: 'Virtual Assistant',
    templates: [
      {
        name: 'VA Retainer (Monthly)',
        sections: [
          {
            name: 'Monthly retainer',
            items: [
              { description: 'Admin support', unit: 'hr', quantity: 20, rate: 35, tags: [], isOptional: false },
              { description: 'Inbox management', unit: 'hr', quantity: 5, rate: 35, tags: [], isOptional: false },
              { description: 'Scheduling', unit: 'hr', quantity: 3, rate: 35, tags: [], isOptional: false },
            ],
          },
        ],
      },
      {
        name: 'Project Setup',
        sections: [
          {
            name: 'Setup',
            items: [
              { description: 'Systems audit', unit: 'x', quantity: 1, rate: 300, tags: [], isOptional: false },
              { description: 'Setup & migration', unit: 'hr', quantity: 8, rate: 45, tags: [], isOptional: false },
              { description: 'Documentation', unit: 'hr', quantity: 2, rate: 45, tags: [], isOptional: false },
            ],
          },
        ],
      },
    ],
  },
]
