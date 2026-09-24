// Checks a purchase event against Viseca's own schema file.
import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { DATA_DIR } from "./pack.js";

// Both packages are CommonJS; unwrap the default export under ESM.
const Ajv2020 = ((Ajv2020Module as any).default ?? Ajv2020Module) as any;
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as any;

const schema = JSON.parse(readFileSync(DATA_DIR + "schemas/authorization_event.schema.json", "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

/** Empty list = valid. */
export function eventErrors(event: unknown): string[] {
  if (validate(event)) return [];
  return (validate.errors ?? []).map((e: any) => `${e.instancePath || "(root)"} ${e.message}`);
}
