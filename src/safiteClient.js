/**
 * Cliente de API para SAFITE (Módulo Sistrans y RNDC) en Node.js
 * Compatible con entornos Vercel Serverless / Edge / Node.js 18+
 */

import 'dotenv/config';

export class SafiteAPIError extends Error {
  constructor(message, statusCode = null, responseData = null) {
    super(message);
    this.name = 'SafiteAPIError';
    this.statusCode = statusCode;
    this.responseData = responseData;
  }
}

export class SafiteSistransClient {
  static DEFAULT_API_URL = 'https://api.app.safiteapp.com/index.php';
  static DEFAULT_TIMEOUT_MS = 60000; // 60 segundos por defecto
  static RNDC_TIMEOUT_MS = 300000;   // 5 minutos (o según plan de Vercel)

  constructor({ token, baseUrl } = {}) {
    this.token = token || process.env.SAFITE_JWT_TOKEN;
    if (!this.token) {
      throw new Error(
        'Token no proporcionado. Define SAFITE_JWT_TOKEN en variables de entorno de Vercel o en el constructor.'
      );
    }

    this.baseUrl = (baseUrl || process.env.SAFITE_API_URL || SafiteSistransClient.DEFAULT_API_URL).replace(/\/$/, '');
  }

  /**
   * Realiza una petición POST enviando datos en application/x-www-form-urlencoded
   */
  async _post(endpoint, data = {}, timeoutMs = SafiteSistransClient.DEFAULT_TIMEOUT_MS) {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Safite exige application/x-www-form-urlencoded
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    }

    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData.toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new SafiteAPIError(
          `Error HTTP ${response.status} en ${endpoint}: ${errorText}`,
          response.status
        );
      }

      const resJson = await response.json();
      return resJson;
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new SafiteAPIError(`Timeout de ${timeoutMs}ms al conectar con ${endpoint}`);
      }
      throw err;
    }
  }

  // =========================================================================
  // CONSULTAS
  // =========================================================================

  /**
   * Consulta los datos generales y estado de un manifiesto en Safite
   */
  async consultarManifiesto(numeroManifiesto) {
    return this._post('/Sistrans/Viajes/OrdenCargue/Consultar', {
      numeroManifiesto,
    });
  }

  /**
   * Consulta las remesas asociadas a un viaje
   */
  async consultarRemesas(numeroViaje) {
    const res = await this._post('/Sistrans/Viajes/OrdenCargue/ConsultarCargaViaje', {
      numeroViaje,
    });
    return res.data || [];
  }

  /**
   * Consulta los valores, fletes pactados y anticipos
   */
  async consultarValores(numeroViaje) {
    return this._post('/Sistrans/Viajes/OrdenCargue/ConsultarValoresViaje', {
      numeroViaje,
    });
  }

  /**
   * Búsqueda de manifiestos con paginación y filtros
   */
  async listarManifiestos(limit = 25, start = 0, filtros = {}) {
    return this._post('/Sistrans/Viajes/BusquedaManifiestos/Listar', {
      limit,
      start,
      ...filtros,
    });
  }

  // =========================================================================
  // TRANSMISIÓN Y FIRMA ANTE EL MINISTERIO DE TRANSPORTE (RNDC)
  // =========================================================================

  /**
   * Transmite y firma una remesa individual en el RNDC
   */
  async firmarRemesa(numeroViaje, codigoRemesa) {
    return this._post(
      '/Sistrans/Viajes/OrdenCargue/FirmarRemesa',
      { numeroViaje, codigoRemesa },
      SafiteSistransClient.RNDC_TIMEOUT_MS
    );
  }

  /**
   * Valida preliminarmente si el manifiesto está listo para ser firmado
   */
  async listarFirmaManifiesto(numeroViaje, omitirTercero = 'N', omitirVehiculo = 'N') {
    return this._post('/Sistrans/Viajes/RNDC/Viajes/ListarFirmaManifiesto', {
      numeroViaje,
      omitirTercero,
      omitirVehiculo,
    });
  }

  /**
   * Firma y radica oficialmente el manifiesto ante el Ministerio de Transporte
   */
  async firmarManifiesto(numeroViaje, omitirTercero = 'N', omitirVehiculo = 'N') {
    return this._post(
      '/Sistrans/Viajes/RNDC/Viajes/FirmarManifiesto',
      { numeroViaje, omitirTercero, omitirVehiculo },
      SafiteSistransClient.RNDC_TIMEOUT_MS
    );
  }

  // =========================================================================
  // CUMPLIDO DE VIAJE (DESCARGUE)
  // =========================================================================

  /**
   * Reporta el descargue / cumplimiento de una remesa ante el RNDC
   */
  async cumplirRemesa(numeroViaje, codigoRemesa, fechaDescargue, horaDescargue) {
    return this._post(
      '/Sistrans/Viajes/OrdenCargue/CumplirRemesa',
      { numeroViaje, codigoRemesa, fechaDescargue, horaDescargue },
      SafiteSistransClient.RNDC_TIMEOUT_MS
    );
  }

  /**
   * Reporta el cumplimiento definitivo del manifiesto ante el RNDC
   */
  async cumplirManifiesto(numeroViaje, omitirTercero = 'N', omitirVehiculo = 'N') {
    return this._post(
      '/Sistrans/Viajes/OrdenCargue/CumplirManifiesto',
      { numeroViaje, omitirTercero, omitirVehiculo },
      SafiteSistransClient.RNDC_TIMEOUT_MS
    );
  }

  // =========================================================================
  // VEHÍCULOS Y ANULACIONES
  // =========================================================================

  /**
   * Valida o transmite una placa vehicular al Ministerio de Transporte
   */
  async reportarVehiculoMinisterio(placa) {
    return this._post('/Sistrans/Vehiculos/ReportarMinisterio', {
      cmbPlaca: placa.toUpperCase().trim(),
    });
  }

  /**
   * Anula una remesa autorizada en el RNDC
   */
  async anularRemesa(numeroManifiesto, codigoRemesa, motivoAnulacion, tipoMotivo = 1) {
    return this._post(
      '/Sistrans/Viajes/OrdenCargue/AnularRemesa',
      {
        codigoRemesa,
        remesa: numeroManifiesto,
        numeroManifiesto,
        consecutivoRemesa: 1,
        tipoMotivo,
        motivoAnulacion,
      },
      SafiteSistransClient.RNDC_TIMEOUT_MS
    );
  }

  /**
   * Anula un manifiesto autorizado en el RNDC
   */
  async anularManifiesto(numeroManifiesto, motivoAnulacion, tipoMotivo = 1) {
    return this._post(
      '/Sistrans/Viajes/OrdenCargue/AnularManifiesto',
      {
        numeroManifiesto,
        tipoMotivo,
        motivoAnulacion,
      },
      SafiteSistransClient.RNDC_TIMEOUT_MS
    );
  }

  /**
   * Verifica si el token JWT actual ha expirado inspeccionando su campo 'exp'
   */
  isTokenExpired() {
    if (!this.token) return true;
    try {
      const parts = this.token.split('.');
      if (parts.length < 2) return true;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (!payload.exp) return false;
      const nowSecs = Math.floor(Date.now() / 1000);
      return payload.exp < nowSecs;
    } catch {
      return true;
    }
  }
}

