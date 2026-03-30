interface YabbrConfig {
  apiKey: string;
  apiUrl?: string;
}

interface SendSmsParams {
  to: string;
  message: string;
  from?: string;
}

interface SmsResponse {
  messageId: string;
  status: string;
}

interface MessageStatus {
  messageId: string;
  status: string;
  deliveredAt?: string;
}

interface CreditBalance {
  balance: number;
  currency: string;
}

export class YabbrClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: YabbrConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.apiUrl || "https://cloud.yabb.com";
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Yabbr API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async sendSms(params: SendSmsParams): Promise<SmsResponse> {
    return this.request<SmsResponse>("/v1/sms/send", {
      method: "POST",
      body: JSON.stringify({
        to: params.to,
        body: params.message,
        from: params.from || "OffshoreAlliance",
      }),
    });
  }

  async sendBulkSms(
    recipients: { to: string; message: string }[],
    from?: string
  ): Promise<SmsResponse[]> {
    const results: SmsResponse[] = [];
    for (const recipient of recipients) {
      const result = await this.sendSms({
        to: recipient.to,
        message: recipient.message,
        from,
      });
      results.push(result);
    }
    return results;
  }

  async getMessageStatus(messageId: string): Promise<MessageStatus> {
    return this.request<MessageStatus>(`/v1/sms/status/${messageId}`);
  }

  async getCreditBalance(): Promise<CreditBalance> {
    return this.request<CreditBalance>("/v1/sms/balance");
  }
}

export function formatAustralianPhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("0")) {
    cleaned = "+61" + cleaned.substring(1);
  } else if (cleaned.startsWith("61") && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  } else if (!cleaned.startsWith("+")) {
    cleaned = "+61" + cleaned;
  }

  return cleaned;
}

export interface SmsTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

export const DEFAULT_SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: "meeting_invite",
    name: "Meeting Invitation",
    content:
      "Hi {{first_name}}, you are invited to a {{campaign_name}} meeting on {{date}}. Reply YES to confirm. - Offshore Alliance",
    variables: ["first_name", "campaign_name", "date"],
  },
  {
    id: "action_reminder",
    name: "Action Reminder",
    content:
      "Hi {{first_name}}, reminder: {{action_title}} is happening on {{date}}. Details: {{description}} - Offshore Alliance",
    variables: ["first_name", "action_title", "date", "description"],
  },
  {
    id: "membership_check",
    name: "Membership Check-in",
    content:
      "Hi {{first_name}}, this is {{organiser_name}} from the Offshore Alliance. Can we chat about your EBA? Reply or call back when convenient.",
    variables: ["first_name", "organiser_name"],
  },
  {
    id: "bargaining_update",
    name: "Bargaining Update",
    content:
      "Hi {{first_name}}, update on your {{agreement_name}} bargaining: {{update}}. - Offshore Alliance",
    variables: ["first_name", "agreement_name", "update"],
  },
];

export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}
