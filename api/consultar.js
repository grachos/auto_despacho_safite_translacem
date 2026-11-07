/**
 * Vercel Serverless Function: GET /api/consultar?numeroManifiesto=17505
 */

import { DispatchOrchestrator } from '../src/orchestrator.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use GET o POST.' });
  }

  const numeroManifiesto = req.query.numeroManifiesto || req.body?.numeroManifiesto;

  if (!numeroManifiesto) {
    return res.status(400).json({ error: 'Parámetro obligatorio faltante: numeroManifiesto.' });
  }

  try {
    const orchestrator = new DispatchOrchestrator();
    const resumen = await orchestrator.obtenerResumenViaje(Number(numeroManifiesto));
    return res.status(200).json(resumen);
  } catch (error) {
    console.error('Error al consultar manifiesto en Safite:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Error interno al consultar Safite',
    });
  }
}

