/**
 * mailer.ts
 * Sends OTP emails using Nodemailer.
 * Configure SMTP credentials in your .env file.
 */

import nodemailer from 'nodemailer';

// Create a reusable transporter (singleton)
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',     // true for port 465
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
});

/**
 * Send a 6-digit OTP to the user's email address.
 *
 * @param to          - recipient email
 * @param name        - user's first name (for personalisation)
 * @param otp         - 6-digit OTP string
 * @param expiryMins  - number of minutes until OTP expires
 */
export async function sendOtpEmail(
  to:         string,
  name:       string,
  otp:        string,
  expiryMins: number
): Promise<void> {
  const firstName = name.split(' ')[0];

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>FitFusion – Email Verification</title>
    </head>
    <body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#0f0f0f;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="520" cellpadding="0" cellspacing="0"
                   style="background:#1a1a1a;border-radius:16px;overflow:hidden;
                          border:1px solid #2a2a2a;">

              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#6c63ff,#4fd1c5);
                           padding:32px;text-align:center;">
                  <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;
                             letter-spacing:-0.5px;">
                    💪 FitFusion
                  </h1>
                  <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                    Campus Wellness Platform
                  </p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 8px;color:#e0e0e0;font-size:20px;font-weight:600;">
                    Hey ${firstName} 👋
                  </p>
                  <p style="margin:0 0 28px;color:#a0a0a0;font-size:15px;line-height:1.6;">
                    Welcome to FitFusion! Use the verification code below to
                    activate your account. This code expires in
                    <strong style="color:#e0e0e0;">${expiryMins} minutes</strong>.
                  </p>

                  <!-- OTP Box -->
                  <div style="background:#252525;border:2px dashed #6c63ff;
                              border-radius:12px;padding:24px;text-align:center;
                              margin-bottom:28px;">
                    <p style="margin:0 0 8px;color:#a0a0a0;font-size:12px;
                              text-transform:uppercase;letter-spacing:2px;">
                      Your Verification Code
                    </p>
                    <span style="font-size:42px;font-weight:800;
                                 letter-spacing:12px;color:#6c63ff;">
                      ${otp}
                    </span>
                  </div>

                  <p style="margin:0;color:#6b6b6b;font-size:13px;line-height:1.6;">
                    If you didn't create a FitFusion account, you can safely
                    ignore this email. Someone may have entered your email by mistake.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:20px 40px;border-top:1px solid #2a2a2a;
                           text-align:center;">
                  <p style="margin:0;color:#4a4a4a;font-size:12px;">
                    © ${new Date().getFullYear()} FitFusion · Campus Wellness Platform
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from:    `"FitFusion" <${process.env.SMTP_USER}>`,
    to,
    subject: `${otp} is your FitFusion verification code`,
    html,
  });
}