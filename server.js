const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const flash = require('express-flash');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');

const {
  initDatabase,
  findUserByUsername,
  findUserById,
  createUser,
  getAllUsers,
  updateUserRole,
  updateUser,
  toggleUserActive,
  updateLastLogin,
  deleteUser,
  getUserStats,
  getAdminStats,
  createApiKey,
  getUserApiKeys,
  deleteApiKey,
  getAllTranslationKeys,
  getTranslationKeyById,
  createTranslationKey,
  deleteTranslationKey,
  getTranslationsForKey,
  createOrUpdateTranslation,
  approveTranslation,
  getAllLanguages,
  getLanguageById,
  getLanguageByCode,
  createLanguage,
  updateLanguage,
  deleteLanguage,
  getTranslationsByLanguage,
  getTranslationStats,
  logActivity,
  getRecentActivity,
  ROLES
} = require('./database');

const { requireAuth, requireRole, requirePermission, attachUserToViews } = require('./middleware/auth');
const { requireApiKey } = require('./middleware/apiAuth');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initDatabase();

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db' }),
  secret: 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

app.use(flash());
app.use(attachUserToViews);

// ===== PUBLIC ROUTES =====

app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('login');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const user = findUserByUsername(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    req.flash('error', 'Invalid username or password');
    return res.redirect('/login');
  }

  if (!user.is_active) {
    req.flash('error', 'Your account has been deactivated. Please contact an administrator.');
    return res.redirect('/login');
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.userRole = user.role;

  updateLastLogin(user.id);
  logActivity(user.id, 'login', 'User logged in');

  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ===== PROTECTED ROUTES =====

app.get('/dashboard', requireAuth, (req, res) => {
  const stats = getTranslationStats();
  const recentActivity = getRecentActivity(10);
  const translationKeys = getAllTranslationKeys().slice(0, 10);

  res.render('dashboard', { stats, recentActivity, translationKeys });
});

// ===== TRANSLATIONS =====

app.get('/translations', requireAuth, (req, res) => {
  const translationKeys = getAllTranslationKeys();
  const languages = getAllLanguages();
  res.render('translations', { translationKeys, languages });
});

app.get('/translations/:id', requireAuth, (req, res) => {
  const keyId = req.params.id;
  const key = getTranslationKeyById(keyId);

  if (!key) {
    req.flash('error', 'Translation key not found');
    return res.redirect('/translations');
  }

  const translations = getTranslationsForKey(keyId);
  const languages = getAllLanguages();

  res.render('translation-detail', { key, translations, languages });
});

app.post('/translations/create', requireAuth, requirePermission('manage_translations'), (req, res) => {
  const { key, description, context } = req.body;

  try {
    createTranslationKey(key, description, context, req.session.userId);
    logActivity(req.session.userId, 'create_key', `Created translation key: ${key}`);
    req.flash('success', 'Translation key created successfully');
  } catch (error) {
    req.flash('error', 'Key already exists or invalid data');
  }

  res.redirect('/translations');
});

app.post('/translations/:id/translate', requireAuth, requirePermission('translate'), (req, res) => {
  const keyId = req.params.id;
  const { language_id, value } = req.body;

  try {
    createOrUpdateTranslation(keyId, language_id, value, req.session.userId);
    logActivity(req.session.userId, 'translate', `Updated translation for key ID: ${keyId}`);
    req.flash('success', 'Translation saved successfully');
  } catch (error) {
    req.flash('error', 'Error saving translation');
  }

  res.redirect(`/translations/${keyId}`);
});

app.post('/translations/:id/approve', requireAuth, requirePermission('review'), (req, res) => {
  const translationId = req.params.id;

  try {
    approveTranslation(translationId, req.session.userId);
    logActivity(req.session.userId, 'approve', `Approved translation ID: ${translationId}`);
    req.flash('success', 'Translation approved');
  } catch (error) {
    req.flash('error', 'Error approving translation');
  }

  res.redirect('back');
});

app.post('/translations/:id/delete', requireAuth, requirePermission('manage_translations'), (req, res) => {
  const keyId = req.params.id;
  const key = getTranslationKeyById(keyId);

  try {
    deleteTranslationKey(keyId);
    logActivity(req.session.userId, 'delete_key', `Deleted translation key: ${key.key}`);
    req.flash('success', 'Translation key deleted');
  } catch (error) {
    req.flash('error', 'Error deleting translation key');
  }

  res.redirect('/translations');
});

// ===== API KEYS MANAGEMENT =====

app.get('/api-keys', requireAuth, (req, res) => {
  const apiKeys = getUserApiKeys(req.session.userId);
  res.render('api-keys', { apiKeys });
});

app.post('/api-keys/create', requireAuth, (req, res) => {
  const { name, permissions } = req.body;
  const permArray = Array.isArray(permissions) ? permissions : [permissions];

  try {
    const result = createApiKey(req.session.userId, name, permArray);
    logActivity(req.session.userId, 'create_api_key', `Created API key: ${name}`);
    req.flash('success', 'API key created successfully');
  } catch (error) {
    req.flash('error', 'Error creating API key');
  }

  res.redirect('/api-keys');
});

app.post('/api-keys/:id/delete', requireAuth, (req, res) => {
  const keyId = req.params.id;

  try {
    deleteApiKey(keyId, req.session.userId);
    logActivity(req.session.userId, 'delete_api_key', `Deleted API key ID: ${keyId}`);
    req.flash('success', 'API key deleted');
  } catch (error) {
    req.flash('error', 'Error deleting API key');
  }

  res.redirect('/api-keys');
});

// ===== LANGUAGES MANAGEMENT =====

app.get('/languages', requireAuth, requirePermission('manage_languages'), (req, res) => {
  const languages = getAllLanguages();
  res.render('languages', { languages });
});

app.post('/languages/create', requireAuth, requirePermission('manage_languages'), (req, res) => {
  const { code, name, is_source, minecraft_head } = req.body;

  try {
    createLanguage(code, name, is_source ? 1 : 0, minecraft_head || null);
    logActivity(req.session.userId, 'create_language', `Created language: ${name} (${code})`);
    req.flash('success', 'Language created successfully');
  } catch (error) {
    req.flash('error', 'Language code already exists or invalid data');
  }

  res.redirect('/languages');
});

app.post('/languages/:id/update', requireAuth, requirePermission('manage_languages'), (req, res) => {
  const langId = req.params.id;
  const { code, name, is_source, minecraft_head } = req.body;

  try {
    updateLanguage(langId, code, name, is_source ? 1 : 0, minecraft_head || null);
    logActivity(req.session.userId, 'update_language', `Updated language: ${name}`);
    req.flash('success', 'Language updated successfully');
  } catch (error) {
    console.error('Error updating language:', error);
    req.flash('error', 'Error updating language: ' + error.message);
  }

  res.redirect('/languages');
});

app.post('/languages/:id/delete', requireAuth, requirePermission('manage_languages'), (req, res) => {
  const langId = req.params.id;
  const lang = getLanguageById(langId);

  try {
    deleteLanguage(langId);
    logActivity(req.session.userId, 'delete_language', `Deleted language: ${lang.name}`);
    req.flash('success', 'Language deleted');
  } catch (error) {
    req.flash('error', 'Cannot delete language with existing translations');
  }

  res.redirect('/languages');
});

// ===== ADMIN DASHBOARD =====

app.get('/admin', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const stats = getAdminStats();
  const users = getAllUsers().slice(0, 10);
  const recentActivity = getRecentActivity(15);
  res.render('admin-dashboard', { stats, users, recentActivity });
});

// ===== USER MANAGEMENT (Admin only) =====

app.get('/users', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const users = getAllUsers();
  res.render('users', { users, ROLES });
});

app.get('/users/:id', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const userId = req.params.id;
  const user = findUserById(userId);

  if (!user) {
    req.flash('error', 'User not found');
    return res.redirect('/users');
  }

  const userStats = getUserStats(userId);
  const apiKeys = getUserApiKeys(userId);
  const recentActivity = getRecentActivity(10);

  res.render('user-detail', { user, userStats, apiKeys, recentActivity: recentActivity.filter(a => a.user_id == userId) });
});

app.post('/users/create', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    req.flash('error', 'All fields are required');
    return res.redirect('/users');
  }

  try {
    createUser(username, email, password, role || ROLES.VIEWER);
    logActivity(req.session.userId, 'create_user', `Created user: ${username}`);
    req.flash('success', 'User created successfully');
  } catch (error) {
    req.flash('error', 'Username or email already exists');
  }

  res.redirect('/users');
});

app.post('/users/:id/update', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const userId = req.params.id;
  const { username, email, role } = req.body;

  if (userId == req.session.userId && role !== req.session.userRole) {
    req.flash('error', 'You cannot change your own role');
    return res.redirect('/users');
  }

  try {
    updateUser(userId, username, email, role);
    logActivity(req.session.userId, 'update_user', `Updated user: ${username}`);
    req.flash('success', 'User updated successfully');
  } catch (error) {
    req.flash('error', 'Username or email already exists');
  }

  res.redirect('/users/' + userId);
});

app.post('/users/:id/role', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;

  if (userId == req.session.userId) {
    req.flash('error', 'You cannot change your own role');
    return res.redirect('/users');
  }

  try {
    updateUserRole(userId, role);
    logActivity(req.session.userId, 'update_role', `Changed user ${userId} role to ${role}`);
    req.flash('success', 'User role updated');
  } catch (error) {
    req.flash('error', 'Error updating user role');
  }

  res.redirect('/users');
});

app.post('/users/:id/toggle-active', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const userId = req.params.id;

  if (userId == req.session.userId) {
    req.flash('error', 'You cannot deactivate your own account');
    return res.redirect('/users');
  }

  try {
    const user = findUserById(userId);
    toggleUserActive(userId);
    const newStatus = user.is_active ? 'deactivated' : 'activated';
    logActivity(req.session.userId, 'toggle_user_active', `${newStatus} user: ${user.username}`);
    req.flash('success', `User ${newStatus} successfully`);
  } catch (error) {
    req.flash('error', 'Error updating user status');
  }

  res.redirect('/users');
});

app.post('/users/:id/delete', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const userId = req.params.id;

  if (userId == req.session.userId) {
    req.flash('error', 'You cannot delete your own account');
    return res.redirect('/users');
  }

  try {
    const user = findUserById(userId);
    deleteUser(userId);
    logActivity(req.session.userId, 'delete_user', `Deleted user: ${user.username}`);
    req.flash('success', 'User deleted');
  } catch (error) {
    req.flash('error', 'Error deleting user');
  }

  res.redirect('/users');
});

// ===== API ENDPOINTS =====

// Get all translations for a language
app.get('/api/v1/translations/:langCode', requireApiKey(['view']), (req, res) => {
  const { langCode } = req.params;
  const language = getLanguageByCode(langCode);

  if (!language) {
    return res.status(404).json({ error: 'Language not found' });
  }

  const translations = getTranslationsByLanguage(language.id);

  const result = {};
  translations.forEach(t => {
    result[t.key] = t.value;
  });

  res.json({
    language: langCode,
    translations: result
  });
});

// Get all translation keys with all languages
app.get('/api/v1/keys', requireApiKey(['view']), (req, res) => {
  const keys = getAllTranslationKeys();
  const languages = getAllLanguages();

  const result = keys.map(key => {
    const translations = getTranslationsForKey(key.id);
    const translationsObj = {};

    translations.forEach(t => {
      translationsObj[t.lang_code] = {
        value: t.value,
        status: t.status
      };
    });

    return {
      id: key.id,
      key: key.key,
      description: key.description,
      context: key.context,
      translations: translationsObj
    };
  });

  res.json({
    keys: result,
    languages: languages.map(l => ({
      code: l.code,
      name: l.name,
      is_source: l.is_source,
      minecraft_head: l.minecraft_head
    }))
  });
});

// Create new translation key
app.post('/api/v1/keys', requireApiKey(['manage_translations']), (req, res) => {
  const { key, description, context } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Key is required' });
  }

  try {
    const result = createTranslationKey(key, description, context, req.apiKey.user_id);
    res.status(201).json({
      success: true,
      id: result.lastInsertRowid,
      key
    });
  } catch (error) {
    res.status(400).json({ error: 'Key already exists or invalid data' });
  }
});

// Get all languages
app.get('/api/v1/languages', requireApiKey(['view']), (req, res) => {
  const languages = getAllLanguages();
  res.json({
    languages: languages.map(l => ({
      id: l.id,
      code: l.code,
      name: l.name,
      is_source: l.is_source === 1,
      minecraft_head: l.minecraft_head
    }))
  });
});

// Get single language by code
app.get('/api/v1/languages/:code', requireApiKey(['view']), (req, res) => {
  const { code } = req.params;
  const language = getLanguageByCode(code);

  if (!language) {
    return res.status(404).json({ error: 'Language not found' });
  }

  res.json({
    id: language.id,
    code: language.code,
    name: language.name,
    is_source: language.is_source === 1,
    minecraft_head: language.minecraft_head
  });
});

// Create new language
app.post('/api/v1/languages', requireApiKey(['manage_languages']), (req, res) => {
  const { code, name, is_source, minecraft_head } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Code and name are required' });
  }

  try {
    const result = createLanguage(code, name, is_source ? 1 : 0, minecraft_head || null);
    res.status(201).json({
      success: true,
      id: result.lastInsertRowid,
      code,
      name,
      is_source: is_source ? true : false,
      minecraft_head: minecraft_head || null
    });
  } catch (error) {
    res.status(400).json({ error: 'Language code already exists or invalid data' });
  }
});

// Update language
app.put('/api/v1/languages/:code', requireApiKey(['manage_languages']), (req, res) => {
  const { code } = req.params;
  const { name, is_source, minecraft_head } = req.body;

  const language = getLanguageByCode(code);
  if (!language) {
    return res.status(404).json({ error: 'Language not found' });
  }

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    updateLanguage(language.id, code, name, is_source ? 1 : 0, minecraft_head || null);
    res.json({
      success: true,
      id: language.id,
      code,
      name,
      is_source: is_source ? true : false,
      minecraft_head: minecraft_head || null
    });
  } catch (error) {
    res.status(400).json({ error: 'Error updating language' });
  }
});

// Delete language
app.delete('/api/v1/languages/:code', requireApiKey(['manage_languages']), (req, res) => {
  const { code } = req.params;
  const language = getLanguageByCode(code);

  if (!language) {
    return res.status(404).json({ error: 'Language not found' });
  }

  try {
    deleteLanguage(language.id);
    res.json({
      success: true,
      message: 'Language deleted successfully'
    });
  } catch (error) {
    res.status(400).json({ error: 'Error deleting language' });
  }
});

// Update translation
app.put('/api/v1/translations/:keyId/:langCode', requireApiKey(['translate']), (req, res) => {
  const { keyId, langCode } = req.params;
  const { value } = req.body;

  if (!value) {
    return res.status(400).json({ error: 'Value is required' });
  }

  const language = getLanguageByCode(langCode);
  if (!language) {
    return res.status(404).json({ error: 'Language not found' });
  }

  try {
    createOrUpdateTranslation(keyId, language.id, value, req.apiKey.user_id);
    res.json({
      success: true,
      key_id: keyId,
      language: langCode,
      value
    });
  } catch (error) {
    res.status(400).json({ error: 'Error updating translation' });
  }
});

// API Documentation
app.get('/api/docs', requireAuth, (req, res) => {
  res.render('api-docs');
});

// Start server
app.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────┐
│  Translation Platform Server Running    │
├─────────────────────────────────────────┤
│  URL: http://localhost:${PORT}           │
└─────────────────────────────────────────┘
  `);
});
