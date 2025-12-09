// Auto-hide alerts after 5 seconds
document.addEventListener('DOMContentLoaded', () => {
  const alerts = document.querySelectorAll('.alert');

  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.transition = 'opacity 0.3s ease';
      alert.style.opacity = '0';
      setTimeout(() => {
        alert.remove();
      }, 300);
    }, 5000);
  });

  // Add smooth scrolling
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Form validation
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const requiredFields = form.querySelectorAll('[required]');
      let isValid = true;

      requiredFields.forEach(field => {
        if (!field.value.trim()) {
          isValid = false;
          field.style.borderColor = 'var(--danger)';

          field.addEventListener('input', function() {
            this.style.borderColor = '';
          }, { once: true });
        }
      });

      if (!isValid) {
        e.preventDefault();
        alert('Please fill in all required fields');
      }
    });
  });

  // Password confirmation validation
  const confirmPasswordField = document.getElementById('confirmPassword');
  const passwordField = document.getElementById('password');

  if (confirmPasswordField && passwordField) {
    confirmPasswordField.addEventListener('input', function() {
      if (this.value !== passwordField.value) {
        this.setCustomValidity('Passwords do not match');
      } else {
        this.setCustomValidity('');
      }
    });

    passwordField.addEventListener('input', function() {
      if (confirmPasswordField.value && confirmPasswordField.value !== this.value) {
        confirmPasswordField.setCustomValidity('Passwords do not match');
      } else {
        confirmPasswordField.setCustomValidity('');
      }
    });
  }

  // Add loading state to buttons on form submit
  forms.forEach(form => {
    form.addEventListener('submit', function() {
      const submitBtn = this.querySelector('button[type="submit"]');
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Loading...';

        // Re-enable after 3 seconds as fallback
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }, 3000);
      }
    });
  });

  // Table row highlighting
  const tableRows = document.querySelectorAll('.table tbody tr');
  tableRows.forEach(row => {
    row.addEventListener('click', function(e) {
      if (!e.target.closest('button, a, form')) {
        this.style.backgroundColor = 'var(--gray-100)';
        setTimeout(() => {
          this.style.backgroundColor = '';
        }, 200);
      }
    });
  });

  // Auto-resize textareas
  const textareas = document.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
    });
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + K to focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const searchInput = document.querySelector('input[type="search"]');
    if (searchInput) {
      searchInput.focus();
    }
  }

  // Escape to close modals
  if (e.key === 'Escape') {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      if (modal.style.display === 'flex') {
        modal.style.display = 'none';
      }
    });
  }
});
