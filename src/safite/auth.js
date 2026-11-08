/**
 * Módulo de Autenticación de SAFITE
 * Valida credenciales de usuario contra auth.safiteapp.com y obtiene/refresca tokens JWT.
 */

const AUTH_URL = process.env.SAFITE_AUTH_URL || 'https://auth.safiteapp.com';

export class SafiteAuthError extends Error {
  constructor(message, statusCode = null) {
    super(message);
    this.name = 'SafiteAuthError';
    this.statusCode = statusCode;
  }
}

/**
 * Autentica un usuario contra el servicio de login de Safite
 */
export async function authenticateWithSafite(usuario, password) {
  const url = `${AUTH_URL}/auth/v1/login`;
  
  const payload = new URLSearchParams({
    usuario: usuario.trim(),
    clave: password.trim(),
    appId: '4l09iurgj8a9hko46qk9ou5t2t', // App ID identificada en la app web de Safite
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json',
      },
      body: payload.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new SafiteAuthError('Credenciales inválidas en SAFITE.', res.status);
    }

    const data = await res.json();
    const token = data.token || data.data?.token || data.jwt;

    if (!token) {
      throw new SafiteAuthError('SAFITE no retornó un token de acceso válido.');
    }

    // Decodificar payload del JWT para extraer expiración, tenant e ID de empresa
    const parts = token.split('.');
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 3600 * 1000);
    const tenantId = decoded.data?.tenantId || null;
    const idEmpresa = decoded.data?.idEmpresa || null;

    return {
      token,
      expiresAt,
      tenantId,
      idEmpresa,
      usuario: decoded.data?.usuario || usuario,
    };
  } catch (err) {
    if (err instanceof SafiteAuthError) throw err;
    throw new SafiteAuthError(`Fallo de conexión al autenticar con Safite: ${err.message}`);
  }
}

/**
 * Refresca un token existente
 */
export async function refreshSafiteToken(oldToken) {
  const url = `${AUTH_URL}/auth/v1/refresh?appId=4l09iurgj8a9hko46qk9ou5t2t`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${oldToken}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      throw new SafiteAuthError('No se pudo refrescar el token de Safite.', res.status);
    }

    const data = await res.json();
    const token = data.token || data.data?.token;
    const parts = token.split('.');
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 3600 * 1000);

    return { token, expiresAt };
  } catch (err) {
    throw new SafiteAuthError(`Error refrescando sesión de Safite: ${err.message}`);
  }
}

