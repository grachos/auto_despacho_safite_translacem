# SAFITE & RNDC - Agente de Despachos en Node.js (Vercel & Telegram)

Sistema serverless para conectar un **Agente de IA y Bot de Telegram** con **SAFITE (Módulo Sistrans)** y automatizar la radicación de remesas y manifiestos de carga ante el **Ministerio de Transporte de Colombia (RNDC)**.

Inspirado en el patrón de arquitectura de dos fases (*Two-Phase Commit*) de `auto_despachos_silogtran`, adaptado para Safite y operando sobre **Telegram** con botones interactivos.

---

## 🏗️ Comparativa: Silogtran vs. Safite

| Aspecto | `auto_despachos_silogtran` | Este Proyecto (`Safite`) |
| :--- | :--- | :--- |
| **Backend TMS** | PHP Prado (Monolítico, sin API oficial) | ExtJS 4.2 / PHP (`https://api.app.safiteapp.com/`) |
| **Canal Chat** | WhatsApp Cloud API (Meta) | **Telegram Bot API** (Gratis, botones nativos sin plantillas) |
| **Autenticación** | Web Scraping / Cookies en Supabase | **JWT Bearer Token** en Headers |
| **Flujo RNDC** | Guardado directo en formulario | **Firma de Remesas obligatoria previa** a la firma del Manifiesto |
| **Confirmación** | Botones interactivos (Two-Phase Commit) | **Inline Keyboards en Telegram** (Preparar ➡️ Confirmar) |
| **Infraestructura** | Vercel Serverless | **Vercel Serverless** (Node.js 18+, Native Fetch) |

---

## 📁 Estructura del Proyecto

```
Safite_test/
├── api/
│   ├── consultar.js           # GET /api/consultar?numeroManifiesto=17505
│   ├── despachar.js           # POST /api/despachar { numeroManifiesto: 17505 }
│   ├── agent.js               # POST /api/agent (Lenguaje natural e IA)
│   └── telegram/
│       └── webhook.js         # POST /api/telegram/webhook (Recibe mensajes y clics de Telegram)
├── src/
│   ├── safiteClient.js        # Cliente HTTP para Safite (form-urlencoded + Bearer JWT)
│   ├── orchestrator.js        # Diagnóstico, firma de remesas y firma del manifiesto
│   ├── agentTools.js          # Definiciones Function Calling (Vercel AI SDK / Gemini / OpenAI)
│   └── telegram/
│       ├── api.js             # Cliente ligero Telegram Bot API (fetch nativo, 0ms cold start)
│       └── handler.js         # Manejador de comandos y botones [Confirmar] / [Cancelar]
├── scripts/
│   └── setTelegramWebhook.js  # Script para vincular el bot con la URL de Vercel
├── vercel.json                # Configuración de Serverless Functions (maxDuration: 60s)
└── package.json
```

---

## 💬 Flujo Conversacional en Telegram (Two-Phase Commit)

El bot garantiza que **nada se graba en el Ministerio por accidente**. Sigue el flujo seguro en dos fases:

1. **Fase 1 (Preparar / Diagnóstico)**:
   El usuario escribe:
   > *"Consulta el viaje 17505"* o `/resumen 17505`
   
   El bot responde con la tarjeta del viaje y los botones interactivos:
   ```
   📋 RESUMEN DE VIAJE - SAFITE
   ━━━━━━━━━━━━━━━━━━━━━
   • Manifiesto: #17505
   • Placa: TPZ582
   • Conductor: PEDRO PEREZ
   • Ruta: BOGOTA ➡️ MEDELLIN
   • Remesas: 1 (1 pendiente de firma)
   • Estado RNDC: ⏳ Pendiente de firma en el Ministerio
   ━━━━━━━━━━━━━━━━━━━━━
   ¿Deseas firmar las remesas y radicar el manifiesto ante el Ministerio?

   [ 🚀 Confirmar y Radicar en RNDC ]   [ ❌ Cancelar ]
   ```

2. **Fase 2 (Confirmar)**:
   * Al pulsar **[ 🚀 Confirmar y Radicar en RNDC ]**, el mensaje se edita en tiempo real:
     > `⏳ Transmitiendo y radicando Manifiesto #17505 ante el Ministerio de Transporte (RNDC)...`
   * Safite firma cada remesa y luego firma el manifiesto.
   * El mensaje se actualiza con la aprobación oficial:
     > `✅ ¡DESPACHO AUTORIZADO POR EL MINISTERIO! 🚛💨`
     > `• Radicado Oficial RNDC: 126847603`

---

## 🚀 Despliegue en Vercel

1. **Variables de Entorno** (en Vercel Dashboard > Project Settings > Environment Variables):
   * `SAFITE_JWT_TOKEN`: Tu token de Safite (obtenido con `localStorage.getItem('token')` en la consola del navegador).
   * `TELEGRAM_BOT_TOKEN`: Token entregado por `@BotFather` en Telegram.
   * `TELEGRAM_WEBHOOK_SECRET`: Cadena aleatoria de seguridad (opcional).

2. **Registrar Webhook en Telegram**:
   Una vez desplegado tu proyecto en Vercel, ejecuta:
   ```bash
   node scripts/setTelegramWebhook.js https://tu-proyecto.vercel.app
   ```

¡Y listo! Tu bot de Telegram estará operando en vivo despachando viajes a través de Safite hacia el Ministerio de Transporte.
