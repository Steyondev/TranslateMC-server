const { findApiKey, updateApiKeyLastUsed, findUserById } = require('../database');

// API Key Authentication Middleware
const requireApiKey = (requiredPermissions = []) => {
  return (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        message: 'Please provide an API key in the X-API-Key header or api_key query parameter'
      });
    }

    const keyData = findApiKey(apiKey);

    if (!keyData) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }

    // Check permissions
    const keyPermissions = JSON.parse(keyData.permissions);

    if (requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every(perm =>
        keyPermissions.includes(perm)
      );

      if (!hasAllPermissions) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: 'This API key does not have the required permissions',
          required: requiredPermissions,
          granted: keyPermissions
        });
      }
    }

    // Update last used timestamp
    updateApiKeyLastUsed(apiKey);

    // Attach key info to request
    req.apiKey = keyData;
    req.apiUser = findUserById(keyData.user_id);

    next();
  };
};

module.exports = {
  requireApiKey
};
