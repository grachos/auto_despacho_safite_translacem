/**
 * Script de migración automática para MySQL (Hostinger)
 * Ejecuta la creación de tablas en la base de datos configurada en .env
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';

async function migrate() {
  console.log('🔄 Conectando a MySQL en Hostinger para aplicar migraciones...');

  const {
    MYSQL_HOST,
    MYSQL_USER,
    MYSQL_PASSWORD,
    MYSQL_DATABASE,
    MYSQL_PORT = 3306,
  } = process.env;

  if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
    console.error('❌ Faltan variables de MySQL en .env (MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE).');
    process.exit(1);
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      host: MYSQL_HOST,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      port: Number(MYSQL_PORT),
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });

    console.log(`✅ Conexión establecida con ${MYSQL_HOST}/${MYSQL_DATABASE}`);

    // 1. Tabla de Usuarios
    console.log('📦 Verificando tabla `usuarios`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        email VARCHAR(150) NULL,
        safite_usuario VARCHAR(100) NOT NULL UNIQUE,
        safite_password_encrypted TEXT NOT NULL,
        safite_tenant_id VARCHAR(100) NULL,
        safite_id_empresa INT NULL,
        safite_token LONGTEXT NULL,
        safite_token_expires_at DATETIME NULL,
        telegram_chat_id BIGINT NULL UNIQUE,
        telegram_username VARCHAR(100) NULL,
        whatsapp_phone VARCHAR(50) NULL UNIQUE,
        status ENUM('ACTIVE', 'INACTIVE', 'NEEDS_RELINK') DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_safite_usuario (safite_usuario),
        INDEX idx_telegram_chat (telegram_chat_id),
        INDEX idx_whatsapp_phone (whatsapp_phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Tabla de Invitaciones
    console.log('📦 Verificando tabla `invitaciones`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS invitaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(64) NOT NULL UNIQUE,
        nombre_destinatario VARCHAR(150) NOT NULL,
        creado_por VARCHAR(100) DEFAULT 'ADMIN',
        status ENUM('PENDING', 'USED', 'EXPIRED') DEFAULT 'PENDING',
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Tabla de Códigos de Vinculación
    console.log('📦 Verificando tabla `codigos_vinculacion`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS codigos_vinculacion (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        codigo VARCHAR(10) NOT NULL UNIQUE,
        canal ENUM('TELEGRAM', 'WHATSAPP') DEFAULT 'TELEGRAM',
        used TINYINT(1) DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        INDEX idx_codigo (codigo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Tabla de Auditoría de Despachos
    console.log('📦 Verificando tabla `despachos_log`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS despachos_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        canal ENUM('TELEGRAM', 'WHATSAPP', 'API', 'WEB') NOT NULL,
        numero_manifiesto INT NOT NULL,
        radicado_rndc VARCHAR(50) NULL,
        estado ENUM('SUCCESS', 'FAILED') NOT NULL,
        detalle JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        INDEX idx_manifiesto (numero_manifiesto),
        INDEX idx_usuario_fecha (usuario_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Listar tablas existentes
    const [tables] = await connection.query('SHOW TABLES');
    console.log('\n🎉 ¡Migraciones aplicadas con éxito!');
    console.log('Tablas activas en la Base de Datos:');
    tables.forEach((t) => {
      const tableName = Object.values(t)[0];
      console.log(` - 📋 ${tableName}`);
    });

  } catch (err) {
    console.error('❌ Error durante la migración de base de datos:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

migrate();

