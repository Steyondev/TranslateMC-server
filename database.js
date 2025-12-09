const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db = new Database('translation.db');

// Tabellen erstellen
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    is_active INTEGER DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    is_source INTEGER DEFAULT 0,
    minecraft_head TEXT
  );

  CREATE TABLE IF NOT EXISTS translation_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    description TEXT,
    context TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER NOT NULL,
    language_id INTEGER NOT NULL,
    value TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    translated_by INTEGER,
    reviewed_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (key_id) REFERENCES translation_keys(id) ON DELETE CASCADE,
    FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
    FOREIGN KEY (translated_by) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id),
    UNIQUE(key_id, language_id)
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_translations_key_lang ON translations(key_id, language_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
`);

// Rollen: admin, manager, translator, viewer
const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  TRANSLATOR: 'translator',
  VIEWER: 'viewer'
};

// Permissions für jede Rolle
const PERMISSIONS = {
  admin: ['manage_users', 'manage_keys', 'manage_languages', 'manage_translations', 'review', 'translate', 'view'],
  manager: ['manage_keys', 'manage_translations', 'review', 'translate', 'view'],
  translator: ['translate', 'view'],
  viewer: ['view']
};

// Admin User erstellen falls noch nicht vorhanden
const initDatabase = () => {
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get(ROLES.ADMIN);

  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, email, password, role)
      VALUES (?, ?, ?, ?)
    `).run('admin', 'admin@translation.local', hashedPassword, ROLES.ADMIN);

    console.log('✓ Admin user created: admin / admin123');
  }

  // Standard Sprachen hinzufügen
  const langCount = db.prepare('SELECT COUNT(*) as count FROM languages').get().count;
  if (langCount === 0) {
    const insertLang = db.prepare('INSERT INTO languages (code, name, is_source) VALUES (?, ?, ?)');
    insertLang.run('en', 'English', 1);
    insertLang.run('de', 'Deutsch', 0);
    insertLang.run('fr', 'Français', 0);
    insertLang.run('es', 'Español', 0);
    console.log('✓ Default languages added');
  }
};

// User Functions
const createUser = (username, email, password, role = ROLES.VIEWER) => {
  const hashedPassword = bcrypt.hashSync(password, 10);
  return db.prepare(`
    INSERT INTO users (username, email, password, role)
    VALUES (?, ?, ?, ?)
  `).run(username, email, hashedPassword, role);
};

const findUserByUsername = (username) => {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
};

const findUserById = (id) => {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
};

const getAllUsers = () => {
  return db.prepare(`
    SELECT
      u.id, u.username, u.email, u.role, u.is_active, u.last_login, u.created_at,
      COUNT(DISTINCT ak.id) as api_key_count,
      COUNT(DISTINCT t.id) as translation_count
    FROM users u
    LEFT JOIN api_keys ak ON u.id = ak.user_id
    LEFT JOIN translations t ON u.id = t.translated_by
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
};

const updateUserRole = (userId, role) => {
  return db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
};

const updateUser = (userId, username, email, role) => {
  return db.prepare('UPDATE users SET username = ?, email = ?, role = ? WHERE id = ?').run(username, email, role, userId);
};

const updateUserPassword = (userId, newPassword) => {
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  return db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);
};

const toggleUserActive = (userId) => {
  return db.prepare('UPDATE users SET is_active = NOT is_active WHERE id = ?').run(userId);
};

const updateLastLogin = (userId) => {
  return db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
};

const deleteUser = (userId) => {
  return db.prepare('DELETE FROM users WHERE id = ?').run(userId);
};

const getUserStats = (userId) => {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM translations WHERE translated_by = ?) as translations_created,
      (SELECT COUNT(*) FROM translations WHERE reviewed_by = ?) as translations_reviewed,
      (SELECT COUNT(*) FROM translation_keys WHERE created_by = ?) as keys_created,
      (SELECT COUNT(*) FROM api_keys WHERE user_id = ?) as api_keys_count
  `).get(userId, userId, userId, userId);
};

const getAdminStats = () => {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM users WHERE is_active = 1) as active_users,
      (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_count,
      (SELECT COUNT(*) FROM users WHERE role = 'manager') as manager_count,
      (SELECT COUNT(*) FROM users WHERE role = 'translator') as translator_count,
      (SELECT COUNT(*) FROM users WHERE role = 'viewer') as viewer_count,
      (SELECT COUNT(*) FROM translation_keys) as total_keys,
      (SELECT COUNT(*) FROM translations) as total_translations,
      (SELECT COUNT(*) FROM translations WHERE status = 'approved') as approved_translations,
      (SELECT COUNT(*) FROM translations WHERE status = 'pending') as pending_translations,
      (SELECT COUNT(*) FROM languages) as total_languages,
      (SELECT COUNT(*) FROM api_keys) as total_api_keys
  `).get();
};

// API Key Functions
const createApiKey = (userId, name, permissions) => {
  const key = 'tk_' + uuidv4().replace(/-/g, '');
  return db.prepare(`
    INSERT INTO api_keys (user_id, key, name, permissions)
    VALUES (?, ?, ?, ?)
  `).run(userId, key, name, JSON.stringify(permissions));
};

const findApiKey = (key) => {
  return db.prepare('SELECT * FROM api_keys WHERE key = ?').get(key);
};

const getUserApiKeys = (userId) => {
  return db.prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC').all(userId);
};

const deleteApiKey = (keyId, userId) => {
  return db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(keyId, userId);
};

const updateApiKeyLastUsed = (key) => {
  return db.prepare('UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE key = ?').run(key);
};

// Translation Key Functions
const createTranslationKey = (key, description, context, userId) => {
  return db.prepare(`
    INSERT INTO translation_keys (key, description, context, created_by)
    VALUES (?, ?, ?, ?)
  `).run(key, description, context, userId);
};

const getAllTranslationKeys = () => {
  return db.prepare(`
    SELECT tk.*, u.username as created_by_name,
           (SELECT COUNT(*) FROM translations t WHERE t.key_id = tk.id) as translation_count,
           (SELECT COUNT(*) FROM translations t WHERE t.key_id = tk.id AND t.status = 'approved') as approved_count
    FROM translation_keys tk
    LEFT JOIN users u ON tk.created_by = u.id
    ORDER BY tk.created_at DESC
  `).all();
};

const getTranslationKeyById = (id) => {
  return db.prepare('SELECT * FROM translation_keys WHERE id = ?').get(id);
};

const deleteTranslationKey = (id) => {
  return db.prepare('DELETE FROM translation_keys WHERE id = ?').run(id);
};

// Translation Functions
const createOrUpdateTranslation = (keyId, languageId, value, userId, status = 'pending') => {
  const existing = db.prepare('SELECT id FROM translations WHERE key_id = ? AND language_id = ?').get(keyId, languageId);

  if (existing) {
    return db.prepare(`
      UPDATE translations
      SET value = ?, status = ?, translated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE key_id = ? AND language_id = ?
    `).run(value, status, userId, keyId, languageId);
  } else {
    return db.prepare(`
      INSERT INTO translations (key_id, language_id, value, status, translated_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(keyId, languageId, value, status, userId);
  }
};

const getTranslationsForKey = (keyId) => {
  return db.prepare(`
    SELECT t.*, l.code as lang_code, l.name as lang_name,
           u1.username as translated_by_name,
           u2.username as reviewed_by_name
    FROM translations t
    JOIN languages l ON t.language_id = l.id
    LEFT JOIN users u1 ON t.translated_by = u1.id
    LEFT JOIN users u2 ON t.reviewed_by = u2.id
    WHERE t.key_id = ?
  `).all(keyId);
};

const getTranslationsByLanguage = (languageId) => {
  return db.prepare(`
    SELECT t.*, tk.key, tk.description
    FROM translations t
    JOIN translation_keys tk ON t.key_id = tk.id
    WHERE t.language_id = ?
    ORDER BY tk.key
  `).all(languageId);
};

const approveTranslation = (translationId, reviewerId) => {
  return db.prepare(`
    UPDATE translations
    SET status = 'approved', reviewed_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reviewerId, translationId);
};

const getTranslationStats = () => {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM translation_keys) as total_keys,
      (SELECT COUNT(*) FROM translations) as total_translations,
      (SELECT COUNT(*) FROM translations WHERE status = 'approved') as approved_translations,
      (SELECT COUNT(*) FROM translations WHERE status = 'pending') as pending_translations,
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM languages) as total_languages
  `).get();
};

// Language Functions
const getAllLanguages = () => {
  return db.prepare('SELECT * FROM languages ORDER BY is_source DESC, name').all();
};

const getLanguageById = (id) => {
  return db.prepare('SELECT * FROM languages WHERE id = ?').get(id);
};

const getLanguageByCode = (code) => {
  return db.prepare('SELECT * FROM languages WHERE code = ?').get(code);
};

const createLanguage = (code, name, isSource = 0, minecraftHead = null) => {
  return db.prepare('INSERT INTO languages (code, name, is_source, minecraft_head) VALUES (?, ?, ?, ?)').run(code, name, isSource, minecraftHead);
};

const updateLanguage = (id, code, name, isSource, minecraftHead = null) => {
  return db.prepare('UPDATE languages SET code = ?, name = ?, is_source = ?, minecraft_head = ? WHERE id = ?').run(code, name, isSource, minecraftHead, id);
};

const deleteLanguage = (id) => {
  return db.prepare('DELETE FROM languages WHERE id = ?').run(id);
};

// Activity Log
const logActivity = (userId, action, details = null) => {
  return db.prepare(`
    INSERT INTO activity_log (user_id, action, details)
    VALUES (?, ?, ?)
  `).run(userId, action, details);
};

const getRecentActivity = (limit = 20) => {
  return db.prepare(`
    SELECT al.*, u.username
    FROM activity_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
    LIMIT ?
  `).all(limit);
};

module.exports = {
  db,
  initDatabase,
  ROLES,
  PERMISSIONS,
  // User
  createUser,
  findUserByUsername,
  findUserById,
  getAllUsers,
  updateUserRole,
  updateUser,
  updateUserPassword,
  toggleUserActive,
  updateLastLogin,
  deleteUser,
  getUserStats,
  getAdminStats,
  // API Keys
  createApiKey,
  findApiKey,
  getUserApiKeys,
  deleteApiKey,
  updateApiKeyLastUsed,
  // Translation Keys
  createTranslationKey,
  getAllTranslationKeys,
  getTranslationKeyById,
  deleteTranslationKey,
  // Translations
  createOrUpdateTranslation,
  getTranslationsForKey,
  getTranslationsByLanguage,
  approveTranslation,
  getTranslationStats,
  // Languages
  getAllLanguages,
  getLanguageById,
  getLanguageByCode,
  createLanguage,
  updateLanguage,
  deleteLanguage,
  // Activity
  logActivity,
  getRecentActivity
};
