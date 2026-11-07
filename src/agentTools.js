/**
 * Esquemas de herramientas (Function Calling / Tools) para Agentes de IA en Node.js
 * Compatible con Vercel AI SDK, LangChain.js, OpenAI SDK y Google GenAI SDK.
 */

import { SafiteSistransClient } from './safiteClient.js';
import { DispatchOrchestrator } from './orchestrator.js';

export const SAFITE_AGENT_TOOLS = [
  {
    name: 'obtener_resumen_viaje',
    description: 'Obtiene un diagnóstico claro del viaje: placa, conductor, origen, destino, remesas y si ya cuenta con autorización del Ministerio de Transporte.',
    parameters: {
      type: 'object',
      properties: {
        numero_manifiesto: {
          type: 'integer',
          description: 'Número consecutivo del viaje o manifiesto en Safite.',
        },
      },
      required: ['numero_manifiesto'],
    },
  },
  {
    name: 'despachar_manifiesto_ministerio',
    description: 'Ejecuta el despacho completo en el Ministerio (RNDC): firma remesas pendientes y luego radica el manifiesto oficial.',
    parameters: {
      type: 'object',
      properties: {
        numero_manifiesto: {
          type: 'integer',
          description: 'Número del viaje o manifiesto en Safite a despachar.',
        },
        omitir_tercero: {
          type: 'string',
          enum: ['S', 'N'],
          default: 'N',
          description: 'Omitir validación de terceros si ya existen en el RNDC.',
        },
        omitir_vehiculo: {
          type: 'string',
          enum: ['S', 'N'],
          default: 'N',
          description: 'Omitir validación vehicular si ya existe en el RNDC.',
        },
      },
      required: ['numero_manifiesto'],
    },
  },
  {
    name: 'cumplir_despacho_ministerio',
    description: 'Reporta el cumplimiento y descargue de la mercancía ante el Ministerio de Transporte.',
    parameters: {
      type: 'object',
      properties: {
        numero_manifiesto: {
          type: 'integer',
          description: 'Número del manifiesto a cumplir.',
        },
        codigo_remesa: {
          type: 'integer',
          description: 'Código de la remesa.',
        },
        fecha_descargue: {
          type: 'string',
          description: 'Fecha efectiva de descargue (YYYY-MM-DD).',
        },
        hora_descargue: {
          type: 'string',
          description: 'Hora efectiva de descargue (HH:MM).',
        },
      },
      required: ['numero_manifiesto', 'codigo_remesa', 'fecha_descargue', 'hora_descargue'],
    },
  },
];

export class SafiteToolDispatcher {
  constructor(client = null) {
    this.client = client || new SafiteSistransClient();
    this.orchestrator = new DispatchOrchestrator(this.client);
  }

  async execute(toolName, args = {}) {
    switch (toolName) {
      case 'obtener_resumen_viaje':
        return await this.orchestrator.obtenerResumenViaje(args.numero_manifiesto);

      case 'despachar_manifiesto_ministerio':
        return await this.orchestrator.despacharViajeAutonomo(args.numero_manifiesto, {
          omitirTercero: args.omitir_tercero || 'N',
          omitirVehiculo: args.omitir_vehiculo || 'N',
        });

      case 'cumplir_despacho_ministerio': {
        const resRem = await this.client.cumplirRemesa(
          args.numero_manifiesto,
          args.codigo_remesa,
          args.fecha_descargue,
          args.hora_descargue
        );
        const resMan = await this.client.cumplirManifiesto(args.numero_manifiesto);
        return { cumplidoRemesa: resRem, cumplidoManifiesto: resMan };
      }

      default:
        throw new Error(`Herramienta no reconocida: ${toolName}`);
    }
  }
}

