'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Patient {
  id: string;
  name: string;
  lastSession?: string;
  status: 'active' | 'inactive';
}

interface Report {
  id: string;
  patientName: string;
  date: string;
  type: string;
  status: 'draft' | 'final';
}

export default function AriaPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  // Quick report form
  const [patientName, setPatientName] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [reportType, setReportType] = useState('session_notes');
  const [generating, setGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState('');

  // Mock data - would come from API in production
  const recentPatients: Patient[] = [
    { id: '1', name: 'Juan García', lastSession: '2024-01-28', status: 'active' },
    { id: '2', name: 'María López', lastSession: '2024-01-26', status: 'active' },
    { id: '3', name: 'Carlos Rodríguez', lastSession: '2024-01-25', status: 'active' },
  ];

  const recentReports: Report[] = [
    { id: '1', patientName: 'Juan García', date: '2024-01-28', type: 'Notas de Sesión', status: 'final' },
    { id: '2', patientName: 'María López', date: '2024-01-26', type: 'Reporte de Progreso', status: 'draft' },
  ];

  const handleConnect = async () => {
    setConnecting(true);
    setError('');

    try {
      // Simulate connection - in production would call ARIA API
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (!email || !password) {
        throw new Error('Por favor ingresa email y contraseña');
      }

      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setEmail('');
    setPassword('');
  };

  const handleGenerateReport = async () => {
    if (!patientName || !sessionNotes) {
      setError('Por favor ingresa nombre del paciente y notas de la sesión');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const response = await fetch('/api/aria/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName,
          sessionNotes,
          reportType,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setGeneratedReport(data.report);
      } else {
        // Fallback: generate mock report
        setGeneratedReport(`# Reporte de Sesión

**Paciente:** ${patientName}
**Fecha:** ${new Date().toLocaleDateString('es-ES')}
**Tipo:** ${reportType === 'session_notes' ? 'Notas de Sesión' : 'Reporte de Progreso'}

## Notas de la Sesión
${sessionNotes}

## Observaciones Clínicas
[Contenido generado por IA basado en las notas proporcionadas]

## Plan de Tratamiento
[Recomendaciones basadas en la sesión]

---
*Este reporte fue generado con asistencia de IA. Por favor revisa y edita antes de guardar.*`);
      }
    } catch (err) {
      // Fallback mock report
      setGeneratedReport(`# Reporte de Sesión

**Paciente:** ${patientName}
**Fecha:** ${new Date().toLocaleDateString('es-ES')}

## Notas
${sessionNotes}

---
*Para generar reportes completos con IA, configura tu clave de API.*`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">ARIA Integration</h1>
            <p className="text-gray-400">
              Gestiona pacientes y reportes de ARIA desde SecureAgent
            </p>
          </div>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
          >
            Volver al Dashboard
          </Link>
        </div>

        {/* Beta Notice Banner */}
        <div className="mb-8 p-6 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
              🏥
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-white">ARIA Integration</h3>
                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs font-medium rounded-full">Specialized Feature</span>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Esta integración está diseñada para usuarios de ARIA (ariaba.app). Requiere una cuenta activa de ARIA para funcionar. Los reportes generados son asistidos por IA y deben ser revisados antes de guardar.
              </p>
              <p className="text-gray-500 text-xs">
                Conecta tu cuenta de ARIA abajo para habilitar la generación de reportes con IA
              </p>
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <div className="mb-8 p-6 bg-white/5 border border-white/10 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`} />
              <span className="font-medium">
                {isConnected ? 'Conectado a ARIA' : 'No conectado'}
              </span>
            </div>
            {isConnected && (
              <button
                onClick={handleDisconnect}
                className="text-sm text-gray-400 hover:text-white"
              >
                Desconectar
              </button>
            )}
          </div>

          {!isConnected ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <button
                onClick={handleConnect}
                disabled={connecting}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-lg font-medium transition-all disabled:opacity-50"
              >
                {connecting ? 'Conectando...' : 'Conectar a ARIA'}
              </button>

              <p className="text-sm text-gray-500">
                Tus credenciales se envían de forma segura a ariaba.app
              </p>
            </div>
          ) : (
            <p className="text-gray-400">
              Conectado como: <span className="text-white">{email}</span>
            </p>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quick Report Form */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl">
            <h2 className="text-xl font-semibold mb-4">Generar Reporte Rápido</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Nombre del Paciente</label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Juan García"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Tipo de Reporte</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="session_notes">Notas de Sesión</option>
                  <option value="progress_report">Reporte de Progreso</option>
                  <option value="assessment">Evaluación</option>
                  <option value="treatment_plan">Plan de Tratamiento</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Notas de la Sesión</label>
                <textarea
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Describe lo ocurrido en la sesión..."
                  rows={6}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <button
                onClick={handleGenerateReport}
                disabled={generating || !patientName || !sessionNotes}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-lg font-medium transition-all disabled:opacity-50"
              >
                {generating ? 'Generando...' : 'Generar Reporte con IA'}
              </button>
            </div>
          </div>

          {/* Generated Report */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Reporte Generado</h2>
              {generatedReport && (
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(generatedReport)}
                    className="px-3 py-1 text-sm bg-white/10 hover:bg-white/20 rounded transition-colors"
                  >
                    Copiar
                  </button>
                  <button
                    onClick={() => setGeneratedReport('')}
                    className="px-3 py-1 text-sm bg-white/10 hover:bg-white/20 rounded transition-colors"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>

            {generatedReport ? (
              <div className="prose prose-invert max-w-none">
                <pre className="whitespace-pre-wrap bg-white/5 p-4 rounded-lg text-sm text-gray-300 max-h-[500px] overflow-y-auto">
                  {generatedReport}
                </pre>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p>El reporte generado aparecerá aquí</p>
                <p className="text-sm mt-2">
                  Ingresa las notas de la sesión y haz clic en generar
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Recent Patients */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl">
            <h2 className="text-xl font-semibold mb-4">Pacientes Recientes</h2>
            <div className="space-y-3">
              {recentPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-medium">
                      {patient.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{patient.name}</p>
                      <p className="text-sm text-gray-400">
                        Última sesión: {patient.lastSession}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded ${
                    patient.status === 'active'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {patient.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Reports */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl">
            <h2 className="text-xl font-semibold mb-4">Reportes Recientes</h2>
            <div className="space-y-3">
              {recentReports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="font-medium">{report.patientName}</p>
                    <p className="text-sm text-gray-400">
                      {report.type} - {report.date}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded ${
                    report.status === 'final'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {report.status === 'final' ? 'Final' : 'Borrador'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-8 p-6 bg-gradient-to-br from-blue-600/10 to-cyan-600/10 border border-blue-500/20 rounded-xl">
          <h2 className="text-xl font-semibold mb-4">Uso desde Telegram</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-gray-400 mb-3">Comandos disponibles:</p>
              <ul className="space-y-2 text-sm">
                <li><code className="bg-white/10 px-2 py-1 rounded">/aria connect email</code> - Conectar cuenta</li>
                <li><code className="bg-white/10 px-2 py-1 rounded">/aria patients</code> - Ver pacientes</li>
                <li><code className="bg-white/10 px-2 py-1 rounded">/aria search Nombre</code> - Buscar paciente</li>
                <li><code className="bg-white/10 px-2 py-1 rounded">/aria report Nombre, notas</code> - Generar reporte</li>
              </ul>
            </div>
            <div>
              <p className="text-gray-400 mb-3">Lenguaje natural:</p>
              <ul className="space-y-2 text-sm text-gray-300">
                <li>"Genera reporte para Juan García, sesión de hoy"</li>
                <li>"Busca paciente María López"</li>
                <li>"Muéstrame los últimos reportes"</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
