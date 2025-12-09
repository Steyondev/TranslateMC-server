// Theme Management
(function() {
  // Get saved theme from localStorage or default to 'light'
  const savedTheme = localStorage.getItem('theme') || 'light';

  // Apply theme immediately to prevent flash (WITHOUT transition on page load)
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Flag to track if page has fully loaded
  let pageLoaded = false;

  // Update theme toggle button icon
  function updateThemeIcon() {
    const themeIcon = document.querySelector('.theme-icon');
    const currentTheme = document.documentElement.getAttribute('data-theme');

    if (themeIcon) {
      themeIcon.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
    }
  }

  // Toggle theme function
  window.toggleTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    // Only add transition if page is fully loaded (not on page navigation)
    if (pageLoaded) {
      document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    }

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    updateThemeIcon();

    // Remove transition after animation completes
    if (pageLoaded) {
      setTimeout(() => {
        document.body.style.transition = '';
      }, 300);
    }
  };

  // Initialize theme icon on page load
  document.addEventListener('DOMContentLoaded', () => {
    updateThemeIcon();

    // Mark page as loaded after a short delay to prevent transition on initial load
    setTimeout(() => {
      pageLoaded = true;
    }, 100);
  });

  // Listen for system theme changes (optional)
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    mediaQuery.addEventListener('change', (e) => {
      // Only auto-switch if user hasn't manually set a preference
      if (!localStorage.getItem('theme')) {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        updateThemeIcon();
      }
    });
  }
})();
