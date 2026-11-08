/**
 * Safite & RNDC Auto-Sync Content Script
 * Corre dentro de app.safiteapp.com y sincroniza de forma transparente el token activo
 * con el backend del Asistente de Despachos en Vercel.
 */

(function () {
  'use strict';

  const SYNC_URL = 'https://agentedespachotranslacem.vercel.app/api/auth/safite-token-sync';
  let lastSyncedToken = null;
  let pillElement = null;

  function createOrUpdatePill(status, text, extraHtml = '') {
    if (!pillElement) {
      pillElement = document.createElement('div');
      pillElement.id = 'safite-rndc-sync-pill';
      pillElement.style.cssText = `
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 999999;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 9999px;
        padding: 8px 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        transition: all 0.3s ease;
      `;
      document.body.appendChild(pillElement);
    }

    const dotColor = status === 'ok' ? '#10b981' : status === 'syncing' ? '#38bdf8' : '#f59e0b';
    pillElement.innerHTML = `
      <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${dotColor};"></span>
      <span>${text}</span>
      ${extraHtml}
    `;
  }

  async function syncToken() {
    const token = localStorage.getItem('token');

    if (!token) {
      if (pillElement) pillElement.style.display = 'none';
      return;
    }

    if (token === lastSyncedToken) {
      return; // Ya sincronizado
    }

    createOrUpdatePill('syncing', 'Sincronizando sesión...');

    try {
      const response = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, autoRegister: true }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error de sincronización');
      }

      lastSyncedToken = token;

      if (data.isLinked) {
        createOrUpdatePill(
          'ok',
          `🟢 Bot RNDC Conectado (@${data.telegramUsername || data.usuario})`
        );
      } else if (data.linkingCode) {
        const linkHtml = `
          <a href="${data.telegramUrl}" target="_blank" style="
            background: #0284c7;
            color: #ffffff;
            padding: 4px 10px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 12px;
            font-weight: bold;
            margin-left: 4px;
          ">
            ⚡ Vincular Telegram (${data.linkingCode})
          </a>
        `;
        createOrUpdatePill('pending', 'Asistente RNDC: ', linkHtml);
      }
    } catch (err) {
      console.warn('[Safite Auto-Sync] Error:', err.message);
      createOrUpdatePill('error', 'Asistente RNDC: Sin conexión');
    }
  }

  // 1. Ejecutar al cargar la página
  setTimeout(syncToken, 2000);

  // 2. Monitorear cambios en localStorage periódicamente (cada 15 segundos)
  setInterval(syncToken, 15000);

  // 3. Escuchar eventos de Storage
  window.addEventListener('storage', (e) => {
    if (e.key === 'token') {
      syncToken();
    }
  });
})();

