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
  /**
   * AN's user-facing UI URL for this resource (when the resource has one).
   * Tags, messages, and forms include this; people don't. Useful for
   * deep-linking from our UI to AN's edit pages.
   */
  browser_url?: string;
  identifiers?: string[];
  name?: string;
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

  /**
   * @deprecated Prefer {@link signupPerson}. Action Network's docs explicitly
   * say POST /people without the helper envelope is not supported and that
   * the Person Signup Helper is the only way to create or upsert a person:
   * https://actionnetwork.org/docs/v2/person_signup_helper
   *
   * Kept for callers that still expect this method signature; new code should
   * use signupPerson() so a person can be upserted and tagged in one atomic
   * call (matching tags by name).
   */
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

  /**
   * Person Signup Helper — the canonical way to upsert a person on AN.
   *
   * Per https://actionnetwork.org/docs/v2/person_signup_helper :
   *   - People are matched/deduplicated by email address (and phone).
   *   - If the email exists, the record is updated rather than duplicated.
   *   - `add_tags` / `remove_tags` are arrays of tag NAMES — AN matches them
   *     against existing tags on your group's API key. Unknown names are
   *     silently ignored, so callers should ensure the tag is created first
   *     (POST /tags is idempotent by name; safe to call before this).
   *   - On success the response includes `_embedded["osdi:taggings"]` listing
   *     the taggings that were actually applied. Callers can inspect this
   *     to detect the silent-ignore case.
   *   - Returns the resulting person resource with `_links.self.href` set to
   *     the canonical person URL.
   *
   * Important caveat observed in production: `add_tags` is best-effort.
   * Even when the named tag exists, AN sometimes drops it (eventual
   * consistency on the tag-name index right after a fresh POST /tags, or
   * scope mismatches when a key spans multiple groups). Callers that
   * MUST guarantee the tag is applied should follow this call with an
   * explicit POST /tags/{id}/taggings via {@link addTaggingByPersonId}
   * — that endpoint uses URL-based references (not name lookup), is
   * idempotent per (person, tag), and so is safe as a belt-and-suspenders
   * second step.
   */
  async signupPerson(
    person: ActionNetworkPerson,
    opts: { add_tags?: string[]; remove_tags?: string[]; background?: boolean } = {}
  ): Promise<ActionNetworkResponse> {
    const body: Record<string, unknown> = {
      person: {
        given_name: person.given_name,
        family_name: person.family_name,
        email_addresses: person.email_addresses,
        phone_numbers: person.phone_numbers,
        postal_addresses: person.postal_addresses,
        custom_fields: person.custom_fields,
      },
    };
    if (opts.add_tags?.length) body.add_tags = opts.add_tags;
    if (opts.remove_tags?.length) body.remove_tags = opts.remove_tags;

    const endpoint = opts.background ? "/people/?background_request=true" : "/people";
    return this.request(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Find a person by email address using AN's odata-style filter.
   *
   * Returns the first matching person resource (the embedded shape includes
   * `_links.self.href` for the canonical URL), or null if no match. Used as
   * a defensive fallback when {@link signupPerson} returns a response shape
   * we can't extract an ID from (e.g. throttled / background-processed
   * responses, or future AN API changes).
   */
  async findPersonByEmail(email: string): Promise<Record<string, unknown> | null> {
    const filter = encodeURIComponent(`email_address eq '${email.replace(/'/g, "''")}'`);
    const response = await this.request(`/people?filter=${filter}`);
    const embedded = (response._embedded?.["osdi:people"] as Array<Record<string, unknown>> | undefined) ?? [];
    return embedded.length > 0 ? embedded[0] : null;
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

  /**
   * @deprecated Prefer {@link signupPerson} with `add_tags`. Kept for the
   * generic /api/action-network passthrough route. New code should not add
   * taggings as a separate step — it doubles API pressure and creates a
   * race where a tag can be created without the recipient list being
   * applied if the second call fails.
   */
  async addTagging(tagId: string, person: ActionNetworkPerson): Promise<ActionNetworkResponse> {
    return this.request(`/tags/${tagId}/taggings`, {
      method: "POST",
      body: JSON.stringify({ person }),
    });
  }

  /**
   * Apply a tag to an existing person via canonical URL references.
   *
   * Per https://actionnetwork.org/docs/v2/taggings : POSTing to
   * `/tags/{id}/taggings` with `_links["osdi:person"].href` is the
   * authoritative way to associate a person with a tag. Crucially:
   *
   *   - Both tag and person are referenced by URL — there is no name
   *     lookup, so it bypasses the eventual-consistency window where
   *     {@link signupPerson}'s `add_tags` can silently drop a tag.
   *   - The endpoint is idempotent on `(person, tag)`: AN returns the
   *     existing tagging if one already exists, so calling this after
   *     a successful `signupPerson({ add_tags })` is a safe no-op.
   *
   * This is intentionally NOT deprecated — we use it as a guaranteed
   * fallback after the helper to insure against AN's silent-drop
   * behavior on `add_tags`.
   */
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

  /**
   * Read-back: how many people currently have this tag on AN's side.
   *
   * Used to verify that a push-list operation actually populated the tag
   * with the expected number of recipients. AN's taggings collection
   * exposes `total_records` on page 1 of the response, so a single GET is
   * enough to verify regardless of how many people are tagged.
   */
  async getTaggingCount(tagId: string): Promise<number> {
    const response = await this.request(`/tags/${tagId}/taggings?page=1`);
    return typeof response.total_records === "number" ? response.total_records : 0;
  }

  /**
   * Detailed tag verification — returns the count AND the canonical list
   * of person resource hrefs that AN reports as tagged. This lets the
   * caller prove that the specific people they just pushed are actually
   * on the tag, not just that "some" count of people is on it.
   *
   * Useful when the count alone is ambiguous (e.g. a duplicate tag name
   * existed at a different scope, so the count is non-zero but reflects
   * unrelated people).
   */
  async getTaggingsDetailed(
    tagId: string
  ): Promise<{ total: number; person_hrefs: string[]; raw: ActionNetworkResponse }> {
    const response = await this.request(`/tags/${tagId}/taggings?page=1`);
    const total = typeof response.total_records === "number" ? response.total_records : 0;
    const taggings = (response._embedded?.["osdi:taggings"] ?? []) as Array<
      Record<string, unknown>
    >;
    const person_hrefs = taggings
      .map((t) => {
        const links = (t as Record<string, Record<string, { href: string }>>)?._links;
        return links?.["osdi:person"]?.href ?? "";
      })
      .filter(Boolean);
    return { total, person_hrefs, raw: response };
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

  /**
   * Look up a single tag by id. Used as a fail-fast verification right
   * after {@link createTag} — if this 404s while createTag returned a
   * tag id, the most likely cause is the API key not being a group-level
   * key (per AN docs: "Tags are only available when using group API keys").
   * Surfacing this immediately is much more useful than a confusing
   * "0 verified on AN" later.
   */
  async getTag(tagId: string): Promise<ActionNetworkResponse> {
    return this.request(`/tags/${tagId}`);
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
