import type { RiskFinding } from "../domain/findings.js";

const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const EXTENSION_TYPE_TRANSFER_HOOK = 14;
const EXTENSION_TYPE_PERMANENT_DELEGATE = 19;
const EXTENSION_TYPE_DEFAULT_ACCOUNT_STATE = 12;
const EXTENSION_TYPE_NON_TRANSFERABLE = 18;
const EXTENSION_TYPE_TRANSFER_FEE = 1;
const EXTENSION_TYPE_CONFIDENTIAL_TRANSFER = 3;

const MINT_LAYOUT_SPAN = 82;
const EXTENSION_HEADER_SIZE = 4;

export type Token2022ExtensionInfo = {
  extensionType: number;
  extensionName: string;
  risky: boolean;
};

export function detectToken2022Extensions(
  mintData: Buffer,
  owner: string,
): Token2022ExtensionInfo[] {
  if (owner !== TOKEN_2022_PROGRAM_ID) return [];
  if (mintData.length <= MINT_LAYOUT_SPAN) return [];

  const extensions: Token2022ExtensionInfo[] = [];
  let offset = MINT_LAYOUT_SPAN;

  if (offset < mintData.length && mintData[offset] === 0x01) {
    offset += 1;
  }

  while (offset + EXTENSION_HEADER_SIZE <= mintData.length) {
    const extType = mintData.readUInt16LE(offset);
    const extLen = mintData.readUInt16LE(offset + 2);

    const info = classifyExtension(extType);
    if (info) extensions.push(info);

    offset += EXTENSION_HEADER_SIZE + extLen;
    if (extLen === 0) break;
  }

  return extensions;
}

function classifyExtension(extType: number): Token2022ExtensionInfo | null {
  switch (extType) {
    case EXTENSION_TYPE_TRANSFER_HOOK:
      return { extensionType: extType, extensionName: "TransferHook", risky: true };
    case EXTENSION_TYPE_PERMANENT_DELEGATE:
      return { extensionType: extType, extensionName: "PermanentDelegate", risky: true };
    case EXTENSION_TYPE_DEFAULT_ACCOUNT_STATE:
      return { extensionType: extType, extensionName: "DefaultAccountState", risky: false };
    case EXTENSION_TYPE_NON_TRANSFERABLE:
      return { extensionType: extType, extensionName: "NonTransferable", risky: false };
    case EXTENSION_TYPE_TRANSFER_FEE:
      return { extensionType: extType, extensionName: "TransferFee", risky: false };
    case EXTENSION_TYPE_CONFIDENTIAL_TRANSFER:
      return { extensionType: extType, extensionName: "ConfidentialTransfer", risky: false };
    default:
      return { extensionType: extType, extensionName: `Extension#${extType}`, risky: false };
  }
}

export function detectToken2022RiskFindings(
  mintDataByPubkey: Map<string, { data: Buffer; owner: string }>,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  for (const [pubkey, { data, owner }] of mintDataByPubkey) {
    const extensions = detectToken2022Extensions(data, owner);

    for (const ext of extensions) {
      if (ext.extensionName === "TransferHook") {
        findings.push({
          code: "TOKEN2022_TRANSFER_HOOK",
          severity: "high",
          message: `Token mint ${pubkey} has TransferHook extension — custom code runs on every transfer`,
          details: { mint: pubkey, extensionType: ext.extensionType },
        });
      }

      if (ext.extensionName === "PermanentDelegate") {
        findings.push({
          code: "TOKEN2022_PERMANENT_DELEGATE",
          severity: "high",
          message: `Token mint ${pubkey} has PermanentDelegate — tokens can be transferred without holder consent`,
          details: { mint: pubkey, extensionType: ext.extensionType },
        });
      }
    }
  }

  return findings;
}
