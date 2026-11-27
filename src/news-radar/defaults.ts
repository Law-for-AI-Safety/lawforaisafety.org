import type { NewsRadarSettings } from "./types";

/** Words that make an article about AI, required by the topics that are not AI-specific themselves. */
export const AI_TERMS = [
  "AI",
  "artificial intelligence",
  "algorithm",
  "algorithms",
  "algorithmic",
  "automated",
  "chatbot",
  "chatbots",
  "machine learning",
  "generative",
  "LLM",
  "ChatGPT",
  "OpenAI",
  "facial recognition",
];

/**
 * What the radar watches until someone saves its settings. Include keywords are deliberately
 * specific: a word such as "AI" alone matches far too much, so each topic needs a legal word too.
 */
export const DEFAULT_SETTINGS: NewsRadarSettings = {
  topics: [
    {
      id: "ai-act-enforcement",
      name: "AI Act enforcement, fines and market surveillance",
      queries: ['"AI Act" enforcement', '"AI Act" fine', '"AI Act" "market surveillance"', '"AI Office" investigation'],
      include: ["AI Act enforcement", "AI Act fine", "AI Act fines", "market surveillance", "AI Office", "enforce the AI Act", "AI Act penalties", "AI Act compliance"],
      require: [],
      exclude: ["job advert", "webinar"],
    },
    {
      id: "ai-liability",
      name: "AI liability and the Product Liability Directive",
      queries: ['"Product Liability Directive" AI', '"AI liability"', '"AI Liability Directive"'],
      include: ["Product Liability Directive", "AI liability", "AI Liability Directive", "liability for AI", "defective product", "software liability"],
      require: AI_TERMS,
      exclude: ["webinar"],
    },
    {
      id: "ai-litigation",
      name: "Litigation and class actions over AI harms",
      queries: ["AI lawsuit harm", '"class action" AI', "AI chatbot lawsuit", '"artificial intelligence" litigation'],
      include: ["lawsuit", "class action", "sued", "sues", "litigation", "court ruling", "wrongful death", "claimants"],
      require: AI_TERMS,
      exclude: ["copyright", "patent", "trademark", "securities fraud"],
    },
    {
      id: "eu-remedies",
      name: "Remedies, redress and compensation for AI harms in the EU",
      queries: ["AI harm compensation EU", "AI redress Europe", '"right to an explanation" AI', "AI victims remedy"],
      include: ["compensation", "redress", "remedy", "remedies", "damages", "right to an explanation", "right to lodge a complaint"],
      require: AI_TERMS,
      exclude: ["webinar"],
    },
    {
      id: "algorithmic-discrimination",
      name: "Rulings on algorithmic discrimination and automated decisions",
      queries: ['"algorithmic discrimination" ruling', '"automated decision" court', '"automated decision-making" ruling', "algorithm discrimination court"],
      include: ["algorithmic discrimination", "automated decision", "automated decisions", "automated decision making", "Article 22", "SCHUFA", "credit scoring", "algorithmic bias", "discriminatory algorithm"],
      require: [],
      exclude: ["webinar"],
    },
    {
      id: "gdpr-ai",
      name: "GDPR decisions about AI",
      queries: ["GDPR AI fine", "data protection authority AI decision", "GDPR chatbot", "EDPB AI"],
      include: ["GDPR", "data protection authority", "EDPB", "Garante", "CNIL", "Data Protection Commission", "privacy regulator"],
      require: AI_TERMS,
      exclude: ["cookie banner"],
    },
    {
      id: "collective-redress",
      name: "Collective redress",
      queries: ['"collective redress"', '"representative action" EU', '"Representative Actions Directive"', '"collective action" AI'],
      include: ["collective redress", "representative action", "representative actions", "Representative Actions Directive", "collective action", "mass claim"],
      require: [],
      exclude: ["trade union strike"],
    },
  ],
  trustedOutlets: [
    "Reuters",
    "Financial Times",
    "Politico Europe",
    "Euractiv",
    "MLex",
    "IAPP",
    "The Guardian",
    "Bloomberg",
    "Tech Policy Press",
    "Law360",
    "curia.europa.eu",
    "europa.eu",
    "edpb.europa.eu",
  ],
  recipient: null,
};
