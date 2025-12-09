const { PERMISSIONS } = require('../database');

// Check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// Check if user has specific role
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/login');
    }

    if (!roles.includes(req.session.userRole)) {
      req.flash('error', 'You do not have permission to access this resource');
      return res.redirect('/dashboard');
    }

    next();
  };
};

// Check if user has specific permission
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/login');
    }

    const userRole = req.session.userRole;
    const rolePermissions = PERMISSIONS[userRole] || [];

    if (!rolePermissions.includes(permission)) {
      req.flash('error', 'You do not have permission to perform this action');
      return res.redirect('/dashboard');
    }

    next();
  };
};

// Check permissions helper
const hasPermission = (userRole, permission) => {
  const rolePermissions = PERMISSIONS[userRole] || [];
  return rolePermissions.includes(permission);
};

// Middleware to attach user info to all views
const attachUserToViews = (req, res, next) => {
  res.locals.currentUser = req.session.userId ? {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.userRole
  } : null;
  res.locals.hasPermission = (permission) => {
    if (!req.session.userRole) return false;
    return hasPermission(req.session.userRole, permission);
  };
  next();
};

module.exports = {
  requireAuth,
  requireRole,
  requirePermission,
  hasPermission,
  attachUserToViews
};
