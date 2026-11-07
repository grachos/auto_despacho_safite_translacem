/**
 * Vercel Serverless Function: POST /api/auth/safite-login
 * Valida la invitación y comprueba el usuario/contraseña contra SAFITE.
 * Al confirmar acceso, registra al usuario en MySQL y le entrega su código de vinculación.
 */

import { validateInvitation, markInvitationUsed, registerOrUpdateUser, generateLinkingCode } from '../../src/store/userStore.js';
import { authenticateWithSafite } from '../../src/safite/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  const { tokenInvitacion, usuario, password, canal = 'TELEGRAM' } = req.body || {};

  if (!tokenInvitacion || !usuario || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: tokenInvitacion, usuario, password.' });
  }

  try {
    // 1. Validar que la invitación sea válida y no haya vencido
    const invitacion = await validateInvitation(tokenInvitacion);
    if (!invitacion) {
      return res.status(400).json({ error: 'La invitación no es válida, ya fue utilizada o ha expirado.' });
    }

    // 2. Comprobar credenciales directamente contra SAFITE
    console.log(`[Registro] Comprobando credenciales en SAFITE para el usuario: ${usuario}...`);
    const authResult = await authenticateWithSafite(usuario, password);

    // 3. Registrar / Actualizar el usuario en MySQL (Hostinger) con credenciales cifradas
    const userId = await registerOrUpdateUser({
      nombre: invitacion.nombre_destinatario,
      usuario: authResult.usuario,
      password,
      tenantId: authResult.tenantId,
      idEmpresa: authResult.idEmpresa,
      token: authResult.token,
      expiresAt: authResult.expiresAt,
    });

    // 4. Quemar la invitación
    await markInvitationUsed(tokenInvitacion);

    // 5. Generar código de vinculación de 6 dígitos
    const codigoVinculacion = await generateLinkingCode(userId, canal);

    return res.status(200).json({
      success: true,
      mensaje: '¡Autenticación con SAFITE exitosa!',
      nombre: invitacion.nombre_destinatario,
      usuarioSafite: authResult.usuario,
      codigoVinculacion,
      instrucciones: `Envía el siguiente mensaje al bot de Telegram: VINCULAR ${codigoVinculacion}`,
    });
  } catch (error) {
    console.error('[Registro Error]', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Error al autenticar con SAFITE',
    });
  }
}
