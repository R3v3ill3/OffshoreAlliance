-- Seed / refresh the "OA Standard" email wrapper and make it the default.
-- Idempotent: safe to re-run; content is also editable afterwards at
-- /email/wrappers. Images are served from /public/email-assets (see
-- apps/organising-db/public/email-assets/README.md).

DO $$
DECLARE
  v_header TEXT := $html$<div style="max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="text-align:center;padding:14px 0 10px 0;">
    <a href="https://offshorealliance.org.au" target="_blank">
      <img src="https://oa.uconstruct.app/email-assets/oa-banner.png" alt="Offshore Alliance — Your Oil &amp; Gas Union" width="600" style="max-width:100%;height:auto;border:0;display:inline-block;" />
    </a>
  </div>
  <div style="padding:8px 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">$html$;
  v_footer TEXT := $html$</div>
  <div style="padding:22px 24px;border-top:3px solid #0f2a4a;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;text-align:center;">
    <p style="margin:0 0 14px 0;font-size:16px;font-weight:bold;color:#0f2a4a;">The only answer to corporate greed is organised labour</p>
    <p style="margin:0 0 10px 0;font-size:14px;">Join the Offshore Alliance via the link below<br/>
      <a href="https://offshorealliance.org.au/members/join" target="_blank" style="color:#0f2a4a;font-weight:bold;">https://offshorealliance.org.au/members/join</a>
    </p>
    <p style="margin:0 0 16px 0;">
      <a href="https://offshorealliance.org.au/members/join" target="_blank">
        <img src="https://oa.uconstruct.app/email-assets/oa-fight.png" alt="If you don't fight, you lose! — Offshore Alliance, Your Oil &amp; Gas Union" width="280" style="max-width:100%;height:auto;border:0;display:inline-block;" />
      </a>
    </p>
    <p style="margin:0 0 16px 0;font-size:14px;">Follow the Offshore Alliance via the FB link below<br/>
      <a href="https://www.facebook.com/OffshoreAllianceUnion" target="_blank" style="color:#0f2a4a;">https://www.facebook.com/OffshoreAllianceUnion</a>
    </p>
    <p style="margin:0;">
      <a href="https://offshorealliance.org.au/members/join" target="_blank">
        <img src="https://oa.uconstruct.app/email-assets/oa-qr.png" alt="QR code — join the Offshore Alliance" width="90" height="90" style="border:0;display:inline-block;" />
      </a>
    </p>
  </div>
  <div style="padding:14px 24px;background:#eef1f4;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#6b7280;">
    <p style="margin:0 0 8px 0;"><strong>Indemnity</strong><br/>
      This e-mail and any attachments thereto may contain privileged and confidential information which is intended for the named addressee only. If you have received this e-mail in error, please notify the sender and delete this e-mail and any attachments immediately and ensure that no copies are kept on any media or in any form whatsoever. Any confidentiality, privilege or copyright is not waived or lost as a result of this e-mail having been sent to you in error. Whilst we do everything that can reasonably be done to prevent viruses, it is your clear responsibility to check this e-mail and any attachments for viruses.
    </p>
    <p style="margin:0;">You are receiving this email as a member or supporter of the Offshore Alliance.
      <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> from these emails.
    </p>
  </div>
</div>$html$;
BEGIN
  IF EXISTS (SELECT 1 FROM email_wrappers WHERE name = 'OA Standard') THEN
    UPDATE email_wrappers
    SET header_html = v_header,
        footer_html = v_footer,
        description = 'Standard OA wrapper: logo banner header; footer with join link, campaign image, Facebook link, QR code, indemnity and the mandatory unsubscribe line.',
        is_active = true
    WHERE name = 'OA Standard';
  ELSE
    INSERT INTO email_wrappers (name, description, header_html, footer_html, is_default, is_active)
    VALUES (
      'OA Standard',
      'Standard OA wrapper: logo banner header; footer with join link, campaign image, Facebook link, QR code, indemnity and the mandatory unsubscribe line.',
      v_header,
      v_footer,
      false,
      true
    );
  END IF;

  -- Single default: OA Standard becomes the wrapper platform sends use
  -- unless the organiser picks another at queue time.
  UPDATE email_wrappers SET is_default = false WHERE is_default AND name <> 'OA Standard';
  UPDATE email_wrappers SET is_default = true WHERE name = 'OA Standard';
END $$;

SELECT wrapper_id, name, is_default, is_active FROM email_wrappers ORDER BY wrapper_id;
