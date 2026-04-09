const BASE_URL = "https://actionnetwork.org/api/v2";

interface ActionNetworkConfig {
  apiKey: string;
}

interface ActionNetworkPerson {
  given_name?: string;
  family_name?: string;
  email_addresses?: { address: string; primary?: boolean }[];
  phone_numbers?: { number: string; primary?: boolean }[];
  postal_addresses?: {
    postal_code?: string;
    locality?: string;
    region?: string;
    country?: string;
  }[];
  custom_fields?: Record<string, string>;
}

interface ActionNetworkResponse {
  _links?: Record<string, { href: string }>;
  _embedded?: Record<string, unknown[]>;
  total_records?: number;
  total_pages?: number;
  page?: number;
}

export class ActionNetworkClient {
  private apiKey: string;

  constructor(config: ActionNetworkConfig) {
    this.apiKey = config.apiKey;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<ActionNetworkResponse> {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "OSDI-API-Token": this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Action Network API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    return response.json();
  }

  async getPeople(page = 1): Promise<ActionNetworkResponse> {
    return this.request(`/people?page=${page}`);
  }

  async getPerson(id: string): Promise<ActionNetworkResponse> {
    return this.request(`/people/${id}`);
  }

  async createPerson(person: ActionNetworkPerson): Promise<ActionNetworkResponse> {
    return this.request("/people", {
      method: "POST",
      body: JSON.stringify({
        person: {
          given_name: person.given_name,
          family_name: person.family_name,
          email_addresses: person.email_addresses,
          phone_numbers: person.phone_numbers,
          postal_addresses: person.postal_addresses,
          custom_fields: person.custom_fields,
        },
      }),
    });
  }

  async updatePerson(id: string, person: Partial<ActionNetworkPerson>): Promise<ActionNetworkResponse> {
    return this.request(`/people/${id}`, {
      method: "PUT",
      body: JSON.stringify({ person }),
    });
  }

  async getForms(page = 1): Promise<ActionNetworkResponse> {
    return this.request(`/forms?page=${page}`);
  }

  async getFormSubmissions(formId: string, page = 1): Promise<ActionNetworkResponse> {
    return this.request(`/forms/${formId}/submissions?page=${page}`);
  }

  async createFormSubmission(formId: string, person: ActionNetworkPerson): Promise<ActionNetworkResponse> {
    return this.request(`/forms/${formId}/submissions`, {
      method: "POST",
      body: JSON.stringify({ person }),
    });
  }

  async getEvents(page = 1): Promise<ActionNetworkResponse> {
    return this.request(`/events?page=${page}`);
  }

  async getEventAttendances(eventId: string, page = 1): Promise<ActionNetworkResponse> {
    return this.request(`/events/${eventId}/attendances?page=${page}`);
  }

  async createEventAttendance(eventId: string, person: ActionNetworkPerson): Promise<ActionNetworkResponse> {
    return this.request(`/events/${eventId}/attendances`, {
      method: "POST",
      body: JSON.stringify({ person }),
    });
  }

  async getTags(page = 1): Promise<ActionNetworkResponse> {
    return this.request(`/tags?page=${page}`);
  }

  async addTagging(tagId: string, person: ActionNetworkPerson): Promise<ActionNetworkResponse> {
    return this.request(`/tags/${tagId}/taggings`, {
      method: "POST",
      body: JSON.stringify({ person }),
    });
  }

  async addTaggingByPersonId(tagId: string, personId: string): Promise<ActionNetworkResponse> {
    return this.request(`/tags/${tagId}/taggings`, {
      method: "POST",
      body: JSON.stringify({
        _links: {
          "osdi:person": { href: `${BASE_URL}/people/${personId}` },
        },
      }),
    });
  }

  // Messages
  async getMessages(page = 1): Promise<ActionNetworkResponse> {
    return this.request(`/messages?page=${page}`);
  }

  async getMessage(id: string): Promise<ActionNetworkResponse> {
    return this.request(`/messages/${id}`);
  }

  async createMessage(message: {
    subject: string;
    body: string;
    from: string;
    reply_to: string;
    targets?: { href: string }[];
  }): Promise<ActionNetworkResponse> {
    return this.request("/messages", {
      method: "POST",
      body: JSON.stringify({
        subject: message.subject,
        body: message.body,
        from: message.from,
        reply_to: message.reply_to,
        ...(message.targets ? { targets: message.targets } : {}),
      }),
    });
  }

  async sendMessage(messageId: string): Promise<ActionNetworkResponse> {
    return this.request(`/messages/${messageId}/send`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  // Taggings - get people with a specific tag
  async getTaggings(tagId: string, page = 1): Promise<ActionNetworkResponse> {
    return this.request(`/tags/${tagId}/taggings?page=${page}`);
  }

  // Person tags - get all tags for a specific person
  async getPersonTags(personId: string, page = 1): Promise<ActionNetworkResponse> {
    return this.request(`/people/${personId}/taggings?page=${page}`);
  }

  // Create a tag
  async createTag(name: string): Promise<ActionNetworkResponse> {
    return this.request("/tags", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }
}

export function syncWorkerToActionNetwork(
  worker: {
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
    postcode?: string | null;
    suburb?: string | null;
    state?: string | null;
    employer_name?: string;
    worksite_name?: string;
    member_role?: string;
    occupation?: string | null;
  }
): ActionNetworkPerson {
  const person: ActionNetworkPerson = {
    given_name: worker.first_name,
    family_name: worker.last_name,
    custom_fields: {},
  };

  if (worker.email) {
    person.email_addresses = [{ address: worker.email, primary: true }];
  }
  if (worker.phone) {
    person.phone_numbers = [{ number: worker.phone, primary: true }];
  }
  if (worker.postcode || worker.suburb || worker.state) {
    person.postal_addresses = [
      {
        postal_code: worker.postcode || undefined,
        locality: worker.suburb || undefined,
        region: worker.state || undefined,
        country: "AU",
      },
    ];
  }
  if (worker.employer_name) {
    person.custom_fields!.employer = worker.employer_name;
  }
  if (worker.worksite_name) {
    person.custom_fields!.worksite = worker.worksite_name;
  }
  if (worker.member_role) {
    person.custom_fields!.member_role = worker.member_role;
  }
  if (worker.occupation) {
    person.custom_fields!.occupation = worker.occupation;
  }

  return person;
}
