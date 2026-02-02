/**
 * ARIA Integration - Configuration
 *
 * Zod schemas for ARIA configuration validation
 */

import { z } from 'zod';

// =============================================================================
// Configuration Schemas
// =============================================================================

export const AriaCredentialsSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const AriaConfigSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().url().default('https://ariaba.app'),
  apiUrl: z.string().url().default('https://api.ariaba.app'),
  timeout: z.number().min(1000).max(60000).default(30000),
  retries: z.number().min(0).max(5).default(3),
  credentials: AriaCredentialsSchema.optional(),
  defaultReportFormat: z.enum(['clinical', 'brief', 'detailed']).default('clinical'),
  autoSave: z.boolean().default(true),
  language: z.enum(['es', 'en']).default('es'),
});

export type AriaConfig = z.infer<typeof AriaConfigSchema>;
export type AriaCredentialsConfig = z.infer<typeof AriaCredentialsSchema>;

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_ARIA_CONFIG: AriaConfig = {
  enabled: true,
  baseUrl: 'https://ariaba.app',
  apiUrl: 'https://api.ariaba.app',
  timeout: 30000,
  retries: 3,
  defaultReportFormat: 'clinical',
  autoSave: true,
  language: 'es',
};

// =============================================================================
// Report Templates
// =============================================================================

export const REPORT_TEMPLATES = {
  session_notes: {
    es: {
      title: 'Notas de Sesión',
      sections: [
        'Motivo de consulta',
        'Observaciones clínicas',
        'Intervenciones realizadas',
        'Respuesta del paciente',
        'Plan de tratamiento',
        'Próximos pasos',
      ],
    },
    en: {
      title: 'Session Notes',
      sections: [
        'Reason for visit',
        'Clinical observations',
        'Interventions performed',
        'Patient response',
        'Treatment plan',
        'Next steps',
      ],
    },
  },
  progress_report: {
    es: {
      title: 'Reporte de Progreso',
      sections: [
        'Resumen del período',
        'Objetivos terapéuticos',
        'Progreso observado',
        'Áreas de mejora',
        'Recomendaciones',
        'Plan futuro',
      ],
    },
    en: {
      title: 'Progress Report',
      sections: [
        'Period summary',
        'Therapeutic goals',
        'Observed progress',
        'Areas for improvement',
        'Recommendations',
        'Future plan',
      ],
    },
  },
  assessment: {
    es: {
      title: 'Evaluación Inicial',
      sections: [
        'Datos demográficos',
        'Motivo de consulta',
        'Historia clínica',
        'Evaluación mental',
        'Diagnóstico',
        'Plan de tratamiento',
      ],
    },
    en: {
      title: 'Initial Assessment',
      sections: [
        'Demographics',
        'Presenting problem',
        'Clinical history',
        'Mental status exam',
        'Diagnosis',
        'Treatment plan',
      ],
    },
  },
  treatment_plan: {
    es: {
      title: 'Plan de Tratamiento',
      sections: [
        'Diagnóstico',
        'Objetivos a corto plazo',
        'Objetivos a largo plazo',
        'Intervenciones propuestas',
        'Frecuencia de sesiones',
        'Criterios de alta',
      ],
    },
    en: {
      title: 'Treatment Plan',
      sections: [
        'Diagnosis',
        'Short-term goals',
        'Long-term goals',
        'Proposed interventions',
        'Session frequency',
        'Discharge criteria',
      ],
    },
  },
  discharge_summary: {
    es: {
      title: 'Resumen de Alta',
      sections: [
        'Resumen del tratamiento',
        'Objetivos alcanzados',
        'Estado al alta',
        'Recomendaciones',
        'Seguimiento',
      ],
    },
    en: {
      title: 'Discharge Summary',
      sections: [
        'Treatment summary',
        'Goals achieved',
        'Status at discharge',
        'Recommendations',
        'Follow-up',
      ],
    },
  },
} as const;

// =============================================================================
// Session Types (localized)
// =============================================================================

export const SESSION_TYPE_LABELS = {
  es: {
    initial_assessment: 'Evaluación Inicial',
    follow_up: 'Seguimiento',
    therapy: 'Terapia',
    evaluation: 'Evaluación',
    consultation: 'Consulta',
    crisis: 'Crisis',
    group: 'Grupal',
    family: 'Familiar',
    other: 'Otro',
  },
  en: {
    initial_assessment: 'Initial Assessment',
    follow_up: 'Follow-up',
    therapy: 'Therapy',
    evaluation: 'Evaluation',
    consultation: 'Consultation',
    crisis: 'Crisis',
    group: 'Group',
    family: 'Family',
    other: 'Other',
  },
} as const;
