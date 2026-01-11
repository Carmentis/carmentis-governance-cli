#!/usr/bin/env -S deno run --allow-net --allow-env

import {parseArgs} from "jsr:@std/cli/parse-args";
import {ProviderFactory} from "@cmts-dev/carmentis-sdk/client";


const PRIVATE_KEY_ENV = "CARMENTIS_PRIVATE_KEY";

/*
async function getPrivateKey(): Promise<PrivateSignatureKey> {
  const encodedKey = Deno.env.get(PRIVATE_KEY_ENV);
  if (!encodedKey) {
    console.error(`Error: ${PRIVATE_KEY_ENV} environment variable is not set`);
    Deno.exit(1);
  }
  const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
  return await encoder.decodePrivateKey(encodedKey);
}

 */

async function listValidators(rpcUrl: string): Promise<void> {
  try {
    const client = await ProviderFactory.createInMemoryProviderWithExternalProvider(rpcUrl);
    const validators = await client.getAllValidatorNodes();

    if (validators.length === 0) {
      console.log("No validators found");
      return;
    }

    console.log("\nValidator Nodes:");
    console.log("================");
    let index = 0;
    for (const validator of validators) {
      const vb = await client.loadValidatorNodeVirtualBlockchain(validator);
      const internalState = vb.getInternalState();
      const pk = await vb.getCometbftPublicKeyDeclaration();
      const isApproved = internalState.getLastKnownApprovalStatus();


      console.log(`\n${index + 1}. Address: ${validator.encode()}`);
      console.log(`   Status: ${isApproved ? "✓ Approved" : "✗ Not Approved"}`);
      console.log(`   Pubic key: ${pk.cometbftPublicKey} (${pk.cometbftPublicKeyType})`);
      index++;
    }
    console.log();
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error listing validators:", error.message);
    } else {
      console.error("Error listing validators:", error);
    }
    Deno.exit(1);
  }
}

async function approveValidator(address: string): Promise<void> {
  //const privateKey = await getPrivateKey();
  //const publicKey = await privateKey.getPublicKey();
  try {
    //const client = await ProviderFactory.createInMemoryProviderWithExternalProvider(rpcUrl);
    console.log(`Approving validator: ${address}...`);
    //const governanceVbId = await client.getAccountIdFromPublicKey(publicKey);
    //const governanceVb = await client.loadAccountVirtualBlockchain(governanceVbId);
    // TODO: Implement approval logic
    console.warn("Approval not implemented yet...")

    console.log(`✓ Validator approved successfully`);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error approving validator:", error.message);
    }
    Deno.exit(1);
  }
}

async function revokeValidator(): Promise<void> {

  try {
    // TODO: Implement approval logic
    console.warn("Approval not implemented yet...")

    console.log(`✓ Validator revoked successfully`);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error revoking validator:", error.message);
    }
    Deno.exit(1);
  }
}

function printHelp(): void {
  console.log(`
Carmentis Governance CLI

Usage:
  carmentis-governance [OPTIONS] <COMMAND>

Commands:
  list              List all validator nodes
  approve <address> Approve a validator node
  revoke <address>  Revoke a validator node

Options:
  --node <url>   Node endpoint URL (example: https://node.server.com:26657)
  --help, -h        Show this help message

Environment Variables:
  ${PRIVATE_KEY_ENV}  Private key for signing transactions (required for approve/revoke)

Examples:
  carmentis-governance list
  carmentis-governance --node https://rpc.example.com list
  carmentis-governance approve 1234567890abcdef1234567890abcdef12345678
  carmentis-governance revoke 1234567890abcdef1234567890abcdef12345678
`);
}

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["node"],
    boolean: ["help"],
    alias: { h: "help" },
    default: {
      "rpc-url": "http://localhost:8545",
    },
  });

  if (args.help || args._.length === 0) {
    printHelp();
    Deno.exit(0);
  }

  const command = args._[0] as string;
  const rpcUrl = args["node"];
  if (!rpcUrl) {
    console.error("Error: Node URL is required");
    Deno.exit(1);
  }

  switch (command) {
    case "list":
      await listValidators(rpcUrl);
      break;

    case "approve": {
      const address = args._[1] as string;
      if (!address) {
        console.error("Error: Address is required for approve command");
        console.log("Usage: carmentis-governance approve <address>");
        Deno.exit(1);
      }
      await approveValidator(address);
      break;
    }

    case "revoke": {
      const address = args._[1] as string;
      if (!address) {
        console.error("Error: Address is required for revoke command");
        console.log("Usage: carmentis-governance revoke <address>");
        Deno.exit(1);
      }
      await revokeValidator();
      break;
    }

    default:
      console.error(`Error: Unknown command '${command}'`);
      console.log("Run 'carmentis-governance --help' for usage information");
      Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
