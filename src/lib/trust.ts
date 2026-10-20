/**
 * What we promise about authors' manuscripts, in one place, so the pricing page, landing page
 * and privacy policy say the same thing. Change the vendor here if the model provider changes.
 */
export const MODEL_VENDOR = {
  company: "Anthropic",
  model: "Claude",
  /** Section B of Anthropic's Commercial Terms: Anthropic may not train models on customer content. */
  termsUrl: "https://www.anthropic.com/legal/commercial-terms",
  /** How long Anthropic keeps API inputs and outputs. */
  retentionUrl: "https://privacy.claude.com/en/articles/7996866-is-my-data-used-for-model-training",
} as const;

export const TRUST_POINTS = [
  {
    title: "Never used for training",
    detail: `Your manuscript is never used to train AI models: not by us, and not by ${MODEL_VENDOR.company}, whose terms for business customers forbid it. We don’t fine-tune anything on your writing.`,
  },
  {
    title: "Named model, linked terms",
    detail: `The reader is ${MODEL_VENDOR.model}, made by ${MODEL_VENDOR.company}. Text is sent to their API only to read it for you, and by default they delete API inputs and outputs within 30 days.`,
  },
  {
    title: "Encrypted, private, yours",
    detail: "Manuscripts are encrypted in transit and at rest, private to your account, and never shared or sold. Nobody reads them but the reader you ask.",
  },
  {
    title: "Delete in one click",
    detail: "Delete a manuscript, or your whole account and everything in it, from your account page at any time. You can download all your data first.",
  },
] as const;

/** Where to write to us, if set (SUPPORT_EMAIL). Server components only. */
export function supportEmail(): string | null {
  return process.env.SUPPORT_EMAIL?.trim() || null;
}
