'use client';

/**
 * A light tap of haptic feedback. Android uses the vibration API; iOS Safari (18+) has none, but
 * toggling a `switch` checkbox through its label gives the same tap.
 */
export function haptic(): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(12);
    return;
  }
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.style.display = 'none';
  label.appendChild(input);
  document.body.appendChild(label);
  label.click();
  label.remove();
}
