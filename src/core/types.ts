/**
 * TypeScript model of a structurally valid 0.4.0 catalog and project.
 *
 * These types describe documents that already passed the JSON Schema
 * (src/core/schemaCheck.ts). The semantic validator therefore trusts types and
 * required fields, and only checks what a schema cannot express.
 */

export type LocalizedText = Record<string, string>;

export interface SourceLink {
  sourceRef: string;
  relation: "original" | "translation" | "validation" | "scoring" | "background";
  locator?: string;
}

export interface Documentation {
  summary?: LocalizedText;
  measurementExplanation?: LocalizedText;
  selectionAdvice?: LocalizedText;
  limitations?: LocalizedText;
  administrationNotes?: LocalizedText;
  interpretationNotes?: LocalizedText;
}

export interface ExtensionEntry {
  kind: "metadata" | "behavior";
  version: string;
  featureId?: string;
  data: unknown;
}
export type Extensions = Record<string, ExtensionEntry>;

export interface Source {
  id: string;
  type: string;
  title: string;
  accessedAt?: string;
}

export interface RightsProfile {
  id: string;
  reviewStatus: "unreviewed" | "reviewed" | "clarificationRequired";
  permissions: Record<
    "redistribution" | "electronicDisplay" | "electronicAdministration" | "modification" | "export",
    "unknown" | "permitted" | "prohibited"
  >;
  evidenceSourceRef?: string;
  attribution?: LocalizedText;
}

export interface Construct {
  id: string;
  label: LocalizedText;
  description: LocalizedText;
  parentRef?: string;
  sourceLinks?: SourceLink[];
}

export interface InstrumentForm {
  id: string;
  title: LocalizedText;
  formName?: string;
  versionLabel?: string;
  rightsRef?: string;
  sourceLinks?: SourceLink[];
  translation?: { status: string; sourceLinks?: SourceLink[] };
  administrationTime?: { minMinutes?: number; maxMinutes?: number; sourceLinks: SourceLink[] };
  ageRange?: { minYears?: number; maxYears?: number };
  extensions?: Extensions;
}

export interface Option {
  code: string;
  label: LocalizedText;
  role: "substantive" | "missing";
  ordinalPosition?: number;
  missingReason?: "refused" | "dontKnow" | "notApplicable";
}

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
export interface ConditionGroup {
  all?: Condition[];
  any?: Condition[];
}
export type ConditionOrGroup = Condition | ConditionGroup;

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
}

export interface Module {
  id: string;
  itemRefs: string[];
  selectionMode: "independent" | "allOrNothing";
  inclusionRequired: boolean;
  defaultSelected: boolean;
  scaleRefs?: string[];
}

export interface Section {
  id: string;
  title: LocalizedText;
  itemRefs: string[];
  instruction?: LocalizedText;
  layout?: "list" | "matrix" | "table";
  pageBreakBefore?: boolean;
}

export interface HiddenField {
  id: string;
  variableName: string;
  source: "urlParameter" | "embeddedData" | "constant";
  constantValue?: string;
}

export interface Questionnaire {
  id: string;
  title: LocalizedText;
  introduction?: LocalizedText;
  closingText?: LocalizedText;
  consent?: { title?: LocalizedText; text: LocalizedText; parentalConsentText?: LocalizedText };
  privacyNotice?: LocalizedText;
  helpResources?: LocalizedText;
  hiddenFields?: HiddenField[];
  sections: Section[];
}

export interface ScoreMapping {
  itemRef: string;
  rawToScore: Array<{ code: string; score: number }>;
  missingCodes: string[];
}

export interface ScoreDefinition {
  id: string;
  itemRefs: string[];
  method: "sum" | "mean";
  itemMappings: ScoreMapping[];
  minimumAnswered: number;
  scaleRef?: string;
  sourceLinks?: SourceLink[];
}

export interface Evidence {
  id: string;
  targetType: "instrument" | "scale";
  targetRef: string;
  sourceLinks?: SourceLink[];
}

export interface Catalog {
  schemaVersion: string;
  documentType: "questionnaireCatalog";
  catalog: {
    id: string;
    version: string;
    title: LocalizedText;
    defaultLanguage: string;
    status: "draft" | "reviewed" | "released" | "withdrawn";
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
  savedAt?: string;
}
