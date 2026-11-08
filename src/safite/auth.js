/**
 * Módulo de Autenticación de SAFITE
 * Maneja login por NIT + Usuario + Clave y validación de Token activo contra la API oficial de Safite.
 */

const SAFITE_API_URL = (process.env.SAFITE_API_URL || 'https://api.app.safiteapp.com/index.php').replace(/\/$/, '');

export class SafiteAuthError extends Error {
  constructor(message, statusCode = null) {
    super(message);
    this.name = 'SafiteAuthError';
    this.statusCode = statusCode;
  }
}

/**
 * Valida un token JWT directamente contra la API oficial de Safite
 * Endpoint: /login/ObtenerInformacionUsuarioActivo
 */
export async function validateSafiteToken(token) {
  if (!token) throw new SafiteAuthError('Token no suministrado');

  const cleanToken = token.trim().replace(/^Bearer\s+/i, '');
  const url = `${SAFITE_API_URL}/login/ObtenerInformacionUsuarioActivo`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(20000),
    });

    // Decodificar el payload JWT
    const parts = cleanToken.split('.');
    if (parts.length < 2) {
      throw new SafiteAuthError('Formato de token JWT inválido.');
    }
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

    if (res.status === 401) {
      throw new SafiteAuthError('El token de sesión ha expirado o no es válido en Safite.');
    }

    const json = await res.json().catch(() => ({}));

    const usuario = decoded.data?.usuario || json.data?.usuario || 'USUARIO_SAFITE';
    const idEmpresa = decoded.data?.idEmpresa || json.data?.idEmpresa || 1;
    const tenantId = decoded.data?.tenantId || json.data?.tenantId || null;
    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 3600 * 1000);

    return {
      token: cleanToken,
      usuario,
      idEmpresa,
      tenantId,
      expiresAt,
    };
  } catch (err) {
    if (err instanceof SafiteAuthError) throw err;
    throw new SafiteAuthError(`Fallo al validar sesión en Safite: ${err.message}`);
  }
}

/**
 * Autentica usuario usando NIT + Usuario + Clave directamente en la API de Safite
 */
export async function loginWithNit(nit, usuario, password, recaptchaToken = '') {
  const cleanNit = nit.trim();
  const cleanUser = usuario.trim();
  const cleanPass = password.trim();

  // 1. Obtener datos de la empresa por NIT
  const urlEmpresas = `${SAFITE_API_URL}/login/obtenerEmpresas`;
  const formEmpresa = new URLSearchParams({
    nit: cleanNit,
    token: recaptchaToken,
  });

  let idEmpresa = 1;
  try {
    const resEmpresa = await fetch(urlEmpresas, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: formEmpresa.toString(),
      signal: AbortSignal.timeout(20000),
    });

    const dataEmpresa = await resEmpresa.json().catch(() => ({}));
    if (dataEmpresa.empresas && dataEmpresa.empresas.length > 0) {
      idEmpresa = dataEmpresa.empresas[0].id || dataEmpresa.idEmpresa || 1;
    }
  } catch (e) {
    console.warn('[Safite Login] No se pudo obtener idEmpresa, usando por defecto:', e.message);
  }

  // 2. Autenticar usuario y contraseña en Safite
  const urlAuth = `${SAFITE_API_URL}/login/authenticate`;
  const formAuth = new URLSearchParams({
    nit: cleanNit,
    usuario: cleanUser,
    password: cleanPass,
    empresa: String(idEmpresa),
    token: recaptchaToken,
  });

  const resAuth = await fetch(urlAuth, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: formAuth.toString(),
    signal: AbortSignal.timeout(25000),
  });

  const authData = await resAuth.json().catch(() => ({}));

  if (!resAuth.ok || !authData.token) {
    const errorMsg = authData.message || authData.error || 'Credenciales inválidas en SAFITE.';
    throw new SafiteAuthError(errorMsg, resAuth.status);
  }

  // Validar y decodificar el token retornado
  return await validateSafiteToken(authData.token);
}

/**
 * Autentica usuario y contraseña en Safite (wrapper compatible)
 */
export async function authenticateWithSafite(usuario, password, nit = process.env.SAFITE_NIT || '') {
  return loginWithNit(nit, usuario, password);
}

/**
 * Refresca o revalida un token existente de Safite
 */
export async function refreshSafiteToken(token) {
  return validateSafiteToken(token);
}

