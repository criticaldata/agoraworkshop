(() => {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const status = document.getElementById('contact-status');
  const button = form.querySelector('button[type="submit"]');
  const topic = new URLSearchParams(window.location.search).get('topic');
  if (['joining', 'collaboration', 'question'].includes(topic)) form.elements.topic.value = topic;
  const endpoint = document.querySelector('meta[name="agora-contact-endpoint"]')?.content;
  const feedback = (message, state) => {
    status.textContent = message;
    status.dataset.state = state;
  };
  if (!endpoint) {
    button.disabled = true;
    feedback('The contact form is temporarily unavailable. Please check back shortly.', 'error');
    return;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    feedback('Sending your message…', 'pending');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error('Delivery not confirmed');
      form.reset();
      feedback('Thank you. Your message has been sent to Simon and Mateo.', 'success');
    } catch {
      feedback('We could not confirm that your message was sent. Your message is still here; please try again shortly.', 'error');
    } finally {
      button.disabled = false;
    }
  });
})();
