/**
 * Orquestador de Despachos en Node.js para Agentes de IA.
 * Automatiza el ciclo completo: diagnóstico, firma de remesas y firma del manifiesto.
 */

import { SafiteSistransClient } from './safiteClient.js';

export class DispatchOrchestrator {
  constructor(client = null) {
    this.client = client || new SafiteSistransClient();
  }

  /**
   * Obtiene un resumen completo del estado del viaje y sus radicados en el RNDC
   */
  async obtenerResumenViaje(numeroManifiesto) {
    const [datosViaje, remesas] = await Promise.all([
      this.client.consultarManifiesto(numeroManifiesto),
      this.client.consultarRemesas(numeroManifiesto),
    ]);

    const info = Array.isArray(datosViaje.data) ? datosViaje.data[0] || {} : datosViaje.data || {};

    const numAutoManifiesto = info.NUMERO_AUTORIZACION_MINISTERIO || info.NUM_AUTORIZACION_MINISTERIO || '0';
    const manifiestoAutorizadoRndc = Boolean(numAutoManifiesto && String(numAutoManifiesto) !== '0');

    let todasRemesasFirmadas = true;
    const detalleRemesas = remesas.map((rem) => {
      const autoRem = rem.NUMERO_AUTORIZACION_REMESA_MINISTERIO;
      const autorizada = Boolean(autoRem && String(autoRem) !== '0');
      if (!autorizada) todasRemesasFirmadas = false;

      return {
        codigoRemesa: rem.CODIGO_REMESA,
        consecutivoRemesa: rem.CONSECUTIVO_REMESA || rem.NUMERO_REMESA,
        descripcion: rem.DESCRIPCION_MERCANCIA,
        pesoKg: rem.PESO,
        autorizadaRndc: autorizada,
        radicadoMinisterio: autorizada ? autoRem : null,
      };
    });

    return {
      numeroManifiesto,
      placa: info.PLACA,
      conductor: info.NOMBRE_CONDUCTOR,
      origen: info.ORIGEN,
      destino: info.DESTINO,
      estadoSafite: info.ESTADO,
      manifiestoAutorizadoRndc,
      radicadoManifiestoRndc: manifiestoAutorizadoRndc ? numAutoManifiesto : null,
      todasRemesasFirmadas,
      totalRemesas: remesas.length,
      remesas: detalleRemesas,
    };
  }

  /**
   * Ejecuta el despacho autónomo ante el Ministerio de Transporte:
   * 1. Revisa remesas y las firma si están pendientes.
   * 2. Firma el manifiesto general ante el RNDC.
   */
  async despacharViajeAutonomo(numeroManifiesto, { omitirTercero = 'N', omitirVehiculo = 'N' } = {}) {
    // 1. Diagnóstico previo
    const resumen = await this.obtenerResumenViaje(numeroManifiesto);

    if (resumen.manifiestoAutorizadoRndc) {
      return {
        exito: true,
        mensaje: `El manifiesto #${numeroManifiesto} YA se encuentra autorizado ante el Ministerio.`,
        radicadoManifiesto: resumen.radicadoManifiestoRndc,
        detalle: resumen,
      };
    }

    // 2. Firmar remesas pendientes secuencialmente
    const remesasProcesadas = [];
    for (const rem of resumen.remesas) {
      if (!rem.autorizadaRndc) {
        const resRem = await this.client.firmarRemesa(numeroManifiesto, rem.codigoRemesa);
        remesasProcesadas.push({
          codigoRemesa: rem.codigoRemesa,
          resultado: resRem,
        });
      } else {
        remesasProcesadas.push({
          codigoRemesa: rem.codigoRemesa,
          estado: 'Previamente autorizada',
          radicado: rem.radicadoMinisterio,
        });
      }
    }

    // 3. Firmar el manifiesto
    const resManifiesto = await this.client.firmarManifiesto(numeroManifiesto, omitirTercero, omitirVehiculo);

    const radicadoRndc = resManifiesto?.data?.numeroAutorizacionManifiesto || null;

    return {
      exito: true,
      numeroManifiesto,
      radicadoManifiestoRndc: radicadoRndc,
      mensaje: resManifiesto?.msg || 'Manifiesto despachado con éxito ante el Ministerio.',
      remesas: remesasProcesadas,
    };
  }
}

