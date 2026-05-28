const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://app.offshorealliance.org.au'

const OA_EMAIL_SIGNATURE_HTML = `
<div style="margin-top:32px;padding-top:20px;border-top:2px solid #003087;text-align:center;font-family:Arial,sans-serif;">

  <!-- Ship banner -->
  <img
    src="${SITE_URL}/email-assets/ship.png"
    alt="If you don't fight, you lose – Offshore Alliance"
    width="600"
    style="max-width:100%;height:auto;display:block;margin:0 auto 16px;"
  />

  <!-- OA logo -->
  <img
    src="${SITE_URL}/email-assets/logo.png"
    alt="Offshore Alliance – Your Oil &amp; Gas Union"
    width="400"
    style="max-width:100%;height:auto;display:block;margin:0 auto 20px;"
  />

  <!-- QR code + join text -->
  <p style="margin:0 0 8px;font-size:14px;color:#333333;">
    Join the Offshore Alliance via the link below
  </p>
  <a href="https://offshorealliance.org.au/members/join" style="display:inline-block;margin-bottom:8px;">
    <img
      src="${SITE_URL}/email-assets/qrcode.png"
      alt="QR code – Join the Offshore Alliance"
      width="120"
      style="height:auto;display:block;"
    />
  </a>
  <p style="margin:0 0 20px;font-size:13px;">
    <a href="https://offshorealliance.org.au/members/join" style="color:#003087;">https://offshorealliance.org.au/members/join</a>
  </p>

  <!-- Tagline -->
  <p style="margin:0;font-size:14px;color:#cc0000;font-style:italic;">
    The only answer to corporate greed is organised labour
  </p>

</div>`

export function appendOASignature(html: string): string {
  return html + OA_EMAIL_SIGNATURE_HTML
}
