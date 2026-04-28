const MAX_LENGTHS = {
  first_name: 100,
  last_name: 100,
  email: 200,
  organization: 200,
  service: 50,
  message: 5000,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot — bots typically fill every field. Real users can't see this one.
  // Silently 200 so bots think it worked and don't retry.
  if (body.website) {
    return res.status(200).json({ ok: true });
  }

  const fields = {
    first_name: String(body.first_name || '').trim(),
    last_name: String(body.last_name || '').trim(),
    email: String(body.email || '').trim(),
    organization: String(body.organization || '').trim(),
    service: String(body.service || '').trim(),
    message: String(body.message || '').trim(),
  };

  const errors = {};
  if (!fields.first_name) errors.first_name = 'First name is required.';
  else if (fields.first_name.length > MAX_LENGTHS.first_name) errors.first_name = 'Too long.';

  if (!fields.last_name) errors.last_name = 'Last name is required.';
  else if (fields.last_name.length > MAX_LENGTHS.last_name) errors.last_name = 'Too long.';

  if (!fields.email) errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(fields.email)) errors.email = 'Please enter a valid email address.';
  else if (fields.email.length > MAX_LENGTHS.email) errors.email = 'Too long.';

  if (fields.organization.length > MAX_LENGTHS.organization) errors.organization = 'Too long.';
  if (fields.service.length > MAX_LENGTHS.service) errors.service = 'Invalid selection.';

  if (!fields.message) errors.message = 'Please tell us a bit about what you’re working on.';
  else if (fields.message.length > MAX_LENGTHS.message) errors.message = `Too long (max ${MAX_LENGTHS.message} characters).`;

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Validation failed', fields: errors });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set');
    return res.status(500).json({ error: 'Email service is not configured. Please email hello@mainsequence.consulting directly.' });
  }

  const from = process.env.CONTACT_FROM || 'Main Sequence <noreply@mainsequence.consulting>';
  const to = process.env.CONTACT_TO || 'hello@mainsequence.consulting';

  const subject = `New inquiry — ${fields.first_name} ${fields.last_name}${fields.organization ? ` (${fields.organization})` : ''}`;

  const text = [
    `Name: ${fields.first_name} ${fields.last_name}`,
    `Email: ${fields.email}`,
    fields.organization ? `Organization: ${fields.organization}` : null,
    fields.service ? `Practice area: ${fields.service}` : null,
    '',
    'Message:',
    fields.message,
  ].filter((line) => line !== null).join('\n');

  const html = `
    <h2 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">New inquiry</h2>
    <p><strong>Name:</strong> ${escapeHtml(fields.first_name)} ${escapeHtml(fields.last_name)}</p>
    <p><strong>Email:</strong> <a href="mailto:${escapeHtml(fields.email)}">${escapeHtml(fields.email)}</a></p>
    ${fields.organization ? `<p><strong>Organization:</strong> ${escapeHtml(fields.organization)}</p>` : ''}
    ${fields.service ? `<p><strong>Practice area:</strong> ${escapeHtml(fields.service)}</p>` : ''}
    <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;">
    <p style="white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(fields.message)}</p>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: fields.email,
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[contact] Resend API error', response.status, detail);
      return res.status(502).json({ error: 'Could not send your message right now. Please try again, or email hello@mainsequence.consulting directly.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[contact] Unexpected error', err);
    return res.status(500).json({ error: 'Unexpected error. Please try again, or email hello@mainsequence.consulting directly.' });
  }
}
