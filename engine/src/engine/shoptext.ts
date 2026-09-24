// Shop-supplied text (item_details, item_name, merchant_name, purchase_description) is untrusted.
// We only read narrowly typed product facts from it with strict patterns, and separately flag
// text that reads like an instruction to the agent or the payment system. Nothing here can
// change a rule or a threshold.
// Adapted from Giuseppe's engine/untrusted.ts (team code), with thanks.

const INSTRUCTION_PATTERNS: [RegExp, string][] = [
  [/\bignore\b[^.]{0,40}\b(previous|prior|above|earlier|spending|all)\b[^.]{0,30}\b(instructions?|rules?|limits?)/i, "asks to ignore your instructions or limits"],
  [/\b(system|assistant|developer|admin)\s*(instruction)?\s*:/i, "pretends to be a system message"],
  [/\bnote (for|to) (ai|automated|purchasing|shopping)?\s*(agents?|assistants?|bots?)\b/i, "speaks directly to the shopping agent"],
  [/\bautomated (purchasing|shopping)? ?agents?\b/i, "speaks directly to the shopping agent"],
  [/\bpre-?authori[sz]ed?\b/i, "claims you pre-authorised it"],
  [/\blimits? (do|does|should) not apply\b/i, "claims your limits do not apply"],
  [/\bwithout (further |any )?(checks?|confirmation|verification|approval)\b/i, "asks to skip checks"],
  [/\b(approve|authori[sz]e|accept)\b[^.]{0,20}\b(this|the)\b[^.]{0,15}\b(payment|order|purchase|transaction)\b/i, "tells the system to approve"],
  [/\b(cardholder|customer) is (unavailable|away|not available)\b/i, "tries to stop us asking you"],
  [/\b(do not|don't|no need to) (ask|notify|confirm|contact)\b/i, "tries to stop us asking you"],
];

export interface InstructionFinding {
  line_no: number;
  reason: string;
  excerpt: string;
}

/** Text that tries to give orders. Flagged and ignored, never followed. */
export function findInstructions(lineNo: number, text: string): InstructionFinding[] {
  const out: InstructionFinding[] = [];
  const seen = new Set<string>();
  for (const [re, reason] of INSTRUCTION_PATTERNS) {
    const m = re.exec(text);
    if (m && !seen.has(reason)) {
      seen.add(reason);
      out.push({ line_no: lineNo, reason, excerpt: text.trim() });
    }
  }
  return out;
}

export interface ProductFacts {
  size?: string;
  /** Days the item can be returned; 0 for final sale / non-returnable. */
  returnDays?: number;
  returnUnstated?: boolean;
}

/** Product facts stated in the shop's text. Missing = not stated, never permission. */
export function readProductFacts(text: string): ProductFacts {
  const facts: ProductFacts = {};
  const size = text.match(/\bsize\s+([0-9]{2}(?:[.,]5)?|XXS|XS|S|M|L|XL|XXL)\b/i);
  if (size) facts.size = size[1].toUpperCase().replace(",", ".");
  const ret =
    text.match(/\breturns?\s+(?:accepted|possible|allowed)?\s*(?:within|for|up to)\s+(\d{1,3})\s+days?\b/i) ??
    text.match(/\b(\d{1,3})[- ]day (?:free )?returns?\b/i);
  if (ret) facts.returnDays = Number(ret[1]);
  if (/\bfinal sale\b|\bno returns\b|\bnon-?returnable\b|\bcannot be returned\b/i.test(text)) facts.returnDays = 0;
  if (/\breturn policy not (stated|provided|specified)\b|\bno return (policy|information)\b/i.test(text)) facts.returnUnstated = true;
  return facts;
}
