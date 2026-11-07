/**
 * Vercel Serverless Function: POST /api/despachar
 * Body: { "numeroManifiesto": 17505, "omitirTercero": "N", "omitirVehiculo": "N" }
 */

import { DispatchOrchestrator } from '../src/orchestrator.js';

export const config = {
  maxDuration: 60, // Configuración de tiempo máximo en Vercel
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  const { numeroManifiesto, omitirTercero = 'N', omitirVehiculo = 'N' } = req.body || {};

  if (!numeroManifiesto) {
    return res.status(400).json({ error: 'Campo obligatorio faltante: numeroManifiesto.' });
  }

  try {
    const orchestrator = new DispatchOrchestrator();
    const resultado = await orchestrator.despacharViajeAutonomo(Number(numeroManifiesto), {
      omitirTercero,
      omitirVehiculo,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('Error al despachar en RNDC:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Error interno al despachar ante el Ministerio',
    });
  }
}

