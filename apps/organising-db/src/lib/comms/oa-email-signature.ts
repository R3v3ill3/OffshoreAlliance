const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://app.offshorealliance.org.au'

const OA_EMAIL_SIGNATURE_HTML = `<div style="margin-top:32px;padding-top:20px;border-top:2px solid #003087;text-align:center;font-family:Arial,sans-serif;">
  <img
    src="${SITE_URL}/email-assets/oa-email-logo.png"
    alt="Offshore Alliance – Your Oil &amp; Gas Union"
    width="400"
    style="max-width:100%;height:auto;display:block;margin:0 auto 12px;"
  />
  <p style="margin:0;font-size:13px;color:#555555;">
    Offshore Alliance — Your Oil &amp; Gas Union<br/>
    <a href="https://www.offshorealliance.org.au" style="color:#003087;">www.offshorealliance.org.au</a>
  </p>
</div>`

export function appendOASignature(html: string): string {
  return html + OA_EMAIL_SIGNATURE_HTML
}
