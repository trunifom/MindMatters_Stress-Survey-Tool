/**
 * TypeScript model of a structurally valid 0.4.0 catalog and project.
 *
 * These types describe documents that already passed the JSON Schema
 * (src/core/schemaCheck.ts). The semantic validator therefore trusts types and
 * required fields, and only checks what a schema cannot express.
 */

/** Text per language code ("de", "en", ...). Which language is shown is decided by core/localized.ts, never here. */
export type LocalizedText = Record<string, string>;

/** Link from an element to a bibliographic Source with the kind of relation. */
export interface SourceLink {
  sourceRef: string;
  relation: "original" | "translation" | "validation" | "scoring" | "background";
  locator?: string;
}

/** Optional explanatory texts shown to the organizer; never shown to participants. */
export interface Documentation {
  summary?: LocalizedText;
  measurementExplanation?: LocalizedText;
  selectionAdvice?: LocalizedText;
  limitations?: LocalizedText;
  administrationNotes?: LocalizedText;
  interpretationNotes?: LocalizedText;
}

/** Vendor extension. `behavior` extensions change processing and must name a declared feature, `metadata` ones are inert. */
export interface ExtensionEntry {
  kind: "metadata" | "behavior";
  version: string;
  featureId?: string;
  data: unknown;
}
/** Extensions by key. */
export type Extensions = Record<string, ExtensionEntry>;

/** Bibliographic source (register `sources`). */
export interface Source {
  id: string;
  type: string;
  title: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url?: string;
  edition?: string;
  accessedAt?: string;
  citationText?: string;
}

/** Time window a question refers to ("last week"). */
export interface ReferencePeriod {
  kind: "unspecified" | "current" | "general" | "relative";
  amount?: number;
  unit?: "day" | "week" | "month" | "year";
  label?: LocalizedText;
}

/** Rights of a text (register `rights`). Permissions start as "unknown" and only "permitted" releases an action (see model/rights.ts). */
export interface RightsProfile {
  id: string;
  reviewStatus: "unreviewed" | "reviewed" | "clarificationRequired";
  permissions: Record<
    "redistribution" | "electronicDisplay" | "electronicAdministration" | "modification" | "export",
    "unknown" | "permitted" | "prohibited"
  >;
  evidenceSourceRef?: string;
  attribution?: LocalizedText;
  rightsHolder?: string;
  licenseName?: string;
  licenseUrl?: string;
  notes?: LocalizedText;
}

/** Measured concept (register `constructs`), optionally nested via parentRef (must be acyclic). */
export interface Construct {
  id: string;
  label: LocalizedText;
  description: LocalizedText;
  parentRef?: string;
  sourceLinks?: SourceLink[];
  documentation?: Documentation;
  tags?: string[];
}

/** One form or version of a published instrument (register `instruments`). */
export interface InstrumentForm {
  id: string;
  title: LocalizedText;
  formName?: string;
  versionLabel?: string;
  familyName?: string;
  originalLanguage?: string;
  language?: string;
  respondentRole?: "self" | "parent" | "teacher" | "other";
  targetPopulation?: LocalizedText;
  referencePeriod?: ReferencePeriod;
  instruction?: LocalizedText;
  documentation?: Documentation;
  rightsRef?: string;
  sourceLinks?: SourceLink[];
  translation?: { status: string; language?: string; method?: string; revision?: string; notes?: LocalizedText; sourceLinks?: SourceLink[] };
  administrationTime?: { minMinutes?: number; maxMinutes?: number; sourceLinks: SourceLink[] };
  ageRange?: { minYears?: number; maxYears?: number };
  extensions?: Extensions;
}

/** One answer option. `code` is the identity (never the label); role "missing" marks refusals and "don't know" answers. */
export interface Option {
  code: string;
  label: LocalizedText;
  role: "substantive" | "missing";
  ordinalPosition?: number;
  missingReason?: "refused" | "dontKnow" | "notApplicable";
  /** Per-platform answer codes (platform id to code). Never derived, only used if given. */
  exportHints?: Record<string, { code: string }>;
}

/** Shared answer list (register `optionSets`). The order is fixed; ordinal sets carry ordinalPosition. */
export interface OptionSet {
  id: string;
  label: LocalizedText;
  codeType: "string";
  orderPolicy: "fixed";
  options: Option[];
  measurementLevel?: "nominal" | "ordinal";
}

/** Union of all response kinds, flattened: only the fields of `kind` are present. */
export interface Response {
  kind:
    | "singleChoice"
    | "multipleChoice"
    | "integer"
    | "decimal"
    | "shortText"
    | "longText"
    | "date"
    | "slider"
    | "ranking"
    | "note";
  optionSetRef?: string;
  minSelections?: number;
  maxSelections?: number;
  exclusiveCodes?: string[];
  minimum?: number | string;
  maximum?: number | string;
  maxDecimalPlaces?: number;
  minLength?: number;
  maxLength?: number;
  step?: number;
  maxRanks?: number;
  format?: "email" | "url" | "phone";
  /** note items only */
  style?: "text" | "title" | "subtitle" | "notice";
  unit?: { code: string; label: LocalizedText };
  labels?: { min?: LocalizedText; mid?: LocalizedText; max?: LocalizedText };
  validationMessage?: LocalizedText;
}

/** Leaf of a visibility condition: item `itemRef` compared with `value` (an option code or a number as text). */
export interface Condition {
  itemRef: string;
  operator:
    | "equals"
    | "notEquals"
    | "contains"
    | "notContains"
    | "greaterThan"
    | "greaterThanOrEqual"
    | "lessThan"
    | "lessThanOrEqual";
  value: string;
}
/** Group of conditions that must all (`all`) or at least one of which (`any`) must hold. */
export interface ConditionGroup {
  all?: Condition[];
  any?: Condition[];
}
/** Value of `Item.visibleWhen`. */
export type ConditionOrGroup = Condition | ConditionGroup;

/** Question or text block (register `items`). `inclusionRequired` makes it part of every selection, `answerRequired` makes an answer mandatory. */
export interface Item {
  id: string;
  version: string;
  text: LocalizedText;
  response: Response;
  inclusionRequired: boolean;
  answerRequired: boolean;
  defaultSelected: boolean;
  variableName: string;
  constructRefs: string[];
  instrumentRef?: string;
  instruction?: LocalizedText;
  respondentHelp?: LocalizedText;
  organizerHelp?: LocalizedText;
  referencePeriod?: ReferencePeriod;
  documentation?: Documentation;
  tags?: string[];
  exportHints?: Record<string, { variableName?: string; label?: LocalizedText; notes?: LocalizedText }>;
  requiredMessage?: LocalizedText;
  originalItemNumber?: string;
  displayNumber?: string;
  exportLabel?: LocalizedText;
  keyDirection?: "positive" | "negative" | "unspecified";
  origin?: "original" | "adapted" | "own";
  sensitivity?: {
    level: "sensitive" | "highlySensitive";
    warningText?: LocalizedText;
    helpResourcesText?: LocalizedText;
    excludeFromExportByDefault?: boolean;
  };
  sourceLinks?: SourceLink[];
  rightsRef?: string;
  presentation?: { widget?: string; orientation?: string; optionOrder?: "fixed" | "random" };
  visibleWhen?: ConditionOrGroup;
  extensions?: Extensions;
}

/** Group of items forming a scale; selectionPolicy decides whether it may only be selected as a whole. */
export interface Scale {
  id: string;
  title?: LocalizedText;
  description?: LocalizedText;
  itemRefs: string[];
  constructRefs: string[];
  selectionPolicy: "wholeScale" | "partialWithWarning";
  instrumentRef?: string;
  scoreDefinitionRefs?: string[];
  sourceLinks?: SourceLink[];
  documentation?: Documentation;
}

/** Selectable group of items. "allOrNothing" modules switch as a unit. */
export interface Module {
  id: string;
  title?: LocalizedText;
  description?: LocalizedText;
  documentation?: Documentation;
  itemRefs: string[];
  selectionMode: "independent" | "allOrNothing";
  inclusionRequired: boolean;
  defaultSelected: boolean;
  scaleRefs?: string[];
}

/** Section of the questionnaire template; order of sections and itemRefs is the order of the questionnaire. */
export interface Section {
  id: string;
  title: LocalizedText;
  itemRefs: string[];
  instruction?: LocalizedText;
  layout?: "list" | "matrix" | "table";
  pageBreakBefore?: boolean;
  /** What a school may reorder. Both default to false (standardized instruments stay as published). */
  reorder?: { movable?: boolean; itemsReorderable?: boolean };
}

/** Hidden variable filled by the survey platform, never shown to participants. */
export interface HiddenField {
  id: string;
  variableName: string;
  source: "urlParameter" | "embeddedData" | "constant";
  constantValue?: string;
}

/** Texts of the questionnaire a school may adapt (unless the catalog locks them). */
export const CUSTOMIZABLE_TEXTS = ["title", "introduction", "closingText", "privacyNotice", "helpResources", "consentTitle", "consentText", "parentalConsentText"] as const;
/** Key of a questionnaire text a school may adapt. */
export type CustomizableText = (typeof CUSTOMIZABLE_TEXTS)[number];

/** Own text block of a school, placed in a section after a given item. Becomes a `note` item only in the derived catalog (model/customize.ts). */
export interface CustomBlock {
  id: string;
  style: "title" | "subtitle" | "text" | "notice";
  text: LocalizedText;
  sectionRef: string;
  /** Item after which the block appears; null/missing = start of the section. */
  afterItemRef?: string | null;
}

/** The school's adaptations stored in the project file. The catalog itself is never modified; model/customize.ts derives a separate catalog from it. */
export interface Customization {
  textOverrides?: Partial<Record<CustomizableText, LocalizedText>>;
  /** Adapted wording of catalog text blocks (items of kind note), by item id. */
  noteOverrides?: Record<string, LocalizedText>;
  /** Order of the movable sections (ids). Sections that are not movable keep their place. */
  sectionOrder?: string[];
  /** Order of the items of a section whose items may be reordered, by section id. */
  itemOrder?: Record<string, string[]>;
  customBlocks?: CustomBlock[];
}

/** Template of the questionnaire: texts, consent, hidden fields and the ordered sections. `lockedTexts`/`lockedNotes` mark standardized wording. */
export interface Questionnaire {
  id: string;
  lockedTexts?: CustomizableText[];
  /** Ids of text blocks (notes) with standardized wording. */
  lockedNotes?: string[];
  title: LocalizedText;
  introduction?: LocalizedText;
  closingText?: LocalizedText;
  consent?: { title?: LocalizedText; text: LocalizedText; parentalConsentText?: LocalizedText; requiresParentalConsent?: boolean };
  privacyNotice?: LocalizedText;
  helpResources?: LocalizedText;
  hiddenFields?: HiddenField[];
  sections: Section[];
}

/** Mapping of raw answer codes to scores for one item; documentation only. */
export interface ScoreMapping {
  itemRef: string;
  rawToScore: Array<{ code: string; score: number }>;
  missingCodes: string[];
}

/** Documented score (sum or mean) of a set of items. Nothing is computed from it. */
export interface ScoreDefinition {
  id: string;
  title?: LocalizedText;
  itemRefs: string[];
  method: "sum" | "mean";
  itemMappings: ScoreMapping[];
  minimumAnswered: number;
  scaleRef?: string;
  sourceLinks?: SourceLink[];
}

/** Evidence link of an instrument or scale to its sources. */
export interface Evidence {
  id: string;
  targetType: "instrument" | "scale";
  targetRef: string;
  sourceLinks?: SourceLink[];
}

/** A complete catalog as read from JSON after structural validation. Treated as immutable everywhere: derived catalogs are new objects. */
export interface Catalog {
  schemaVersion: string;
  documentType: "questionnaireCatalog";
  catalog: {
    id: string;
    version: string;
    title: LocalizedText;
    defaultLanguage: string;
    status: "draft" | "reviewed" | "released" | "withdrawn";
    description?: LocalizedText;
    publisher?: string;
    contact?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  languages: string[];
  requiredFeatures: string[];
  sources: Source[];
  rights: RightsProfile[];
  constructs: Construct[];
  instruments: InstrumentForm[];
  optionSets: OptionSet[];
  items: Item[];
  scales: Scale[];
  modules: Module[];
  questionnaire: Questionnaire;
  scoringDefinitions?: ScoreDefinition[];
  evidence?: Evidence[];
  extensions?: Extensions;
}

/** Saved selection of one school for exactly one catalog (id and version), plus language, local labels and customization. */
export interface Project {
  schemaVersion: string;
  documentType: "questionnaireProject";
  catalogRef: { id: string; version: string };
  questionnaireRef: string;
  selectedItemIds: string[];
  language: string;
  targetPlatform?: string;
  schoolLabel?: string;
  internalNotes?: string;
  customization?: Customization;
  savedAt?: string;
}
