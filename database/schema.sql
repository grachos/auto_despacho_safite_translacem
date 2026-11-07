-- =========================================================================
-- ESQUEMA DE BASE DE DATOS MYSQL (HOSTINGER) PARA SAFITE & RNDC
-- Soporta Multi-usuario, Autenticación individual en Safite y Vinculación
-- =========================================================================

CREATE DATABASE IF NOT EXISTS safite_agent_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE safite_agent_db;

-- 1. Tabla de Usuarios Autorizados en Safite
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

-- 2. Tabla de Invitaciones de Acceso creadas por el Administrador
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

-- 3. Tabla de Códigos de Vinculación (ej. VINCULAR 123456)
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

-- 4. Registro y Auditoría de Despachos ante el Ministerio (RNDC)
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
