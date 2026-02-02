import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const REPORT_TEMPLATES = {
  session_notes: {
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
  progress_report: {
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
  assessment: {
    title: 'Evaluación',
    sections: [
      'Datos demográficos',
      'Motivo de consulta',
      'Historia clínica',
      'Evaluación mental',
      'Diagnóstico',
      'Plan de tratamiento',
    ],
  },
  treatment_plan: {
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
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientName, sessionNotes, reportType = 'session_notes' } = body;

    if (!patientName || !sessionNotes) {
      return NextResponse.json(
        { success: false, error: 'Patient name and session notes are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'AI service not configured' },
        { status: 500 }
      );
    }

    const template = REPORT_TEMPLATES[reportType as keyof typeof REPORT_TEMPLATES] || REPORT_TEMPLATES.session_notes;

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `Eres un asistente clínico especializado en documentación terapéutica para profesionales de salud mental. Genera reportes profesionales, éticos y bien estructurados en español.

Instrucciones:
- Mantén un tono profesional y objetivo
- Usa terminología clínica apropiada
- Protege la confidencialidad del paciente
- Incluye solo información relevante clínicamente
- Sigue el formato de secciones proporcionado
- Genera contenido basado en las notas pero expandiendo de forma clínicamente relevante`,
      messages: [
        {
          role: 'user',
          content: `Genera un reporte de tipo "${template.title}" para el siguiente paciente:

Paciente: ${patientName}
Fecha: ${new Date().toLocaleDateString('es-ES')}

Notas de la sesión:
${sessionNotes}

Secciones requeridas:
${template.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Genera el reporte completo en formato Markdown, con cada sección como un encabezado ##.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { success: false, error: 'No response from AI' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      report: textBlock.text,
      metadata: {
        patientName,
        reportType: template.title,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('ARIA report generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
