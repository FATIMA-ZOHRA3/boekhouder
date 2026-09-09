const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, toName, subject, html }: SendEmailOptions): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "noreply@boekhouder.nl";

  if (!apiKey) {
    console.log(`[EMAIL] No BREVO_API_KEY set. Would send to ${to}: ${subject}`);
    return false;
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: "Boekhouder", email: fromEmail },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`[EMAIL] Brevo error: ${res.status} ${error}`);
      return false;
    }

    console.log(`[EMAIL] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL] Failed to send:`, err);
    return false;
  }
}

export function sendVerificationEmail(to: string, name: string, token: string) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const verifyUrl = `${appUrl}/verify?token=${token}`;

  return sendEmail({
    to,
    toName: name,
    subject: "Verifieer uw e-mailadres - Boekhouder",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1F4E74;">Welcome to Boekhouder!</h2>
        <p>Hello ${name},</p>
        <p>Thank you for registering. Click the button below to verify your email address:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}"
             style="background-color: #1F4E74; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Verify email address
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Or copy this link into your browser:</p>
        <p style="color: #6b7280; font-size: 14px; word-break: break-all;">${verifyUrl}</p>
        <p style="color: #6b7280; font-size: 14px;">This link is valid for 24 hours.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">This message was sent automatically by Boekhouder.</p>
      </div>
    `,
  });
}

export function sendPasswordResetEmail(to: string, name: string, token: string) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  return sendEmail({
    to,
    toName: name,
    subject: "Reset password - Boekhouder",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1F4E74;">Reset password</h2>
        <p>Hello ${name},</p>
        <p>You submitted a request to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}"
             style="background-color: #1F4E74; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Reset password
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Or copy this link into your browser:</p>
        <p style="color: #6b7280; font-size: 14px; word-break: break-all;">${resetUrl}</p>
        <p style="color: #6b7280; font-size: 14px;">This link is valid for 1 hour and can only be used once.</p>
        <p style="color: #6b7280; font-size: 14px;">Didn't submit this request? You can ignore this message.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">This message was sent automatically by Boekhouder.</p>
      </div>
    `,
  });
}
