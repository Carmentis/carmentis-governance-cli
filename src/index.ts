#!/usr/bin/env -S deno run --allow-net --allow-env

import {parseArgs} from "jsr:@std/cli/parse-args";
import {
	BalanceAvailability, CryptoEncoderFactory,
	FeesCalculationFormulaFactory,
	Hash, PrivateSignatureKey,
	ProviderFactory,
	SectionType
} from "@cmts-dev/carmentis-sdk/client";


const PRIVATE_KEY_ENV = "CARMENTIS_PRIVATE_KEY";


async function getGovernancePrivateKey(): Promise<PrivateSignatureKey> {
  const encodedKey = Deno.env.get(PRIVATE_KEY_ENV);
  if (!encodedKey) {
    console.error(`Error: ${PRIVATE_KEY_ENV} environment variable is not set`);
    Deno.exit(1);
  }
  const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
  return await encoder.decodePrivateKey(encodedKey);
}

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
	  const orgId = await vb.getOrganizationId();
	  const orgVb = await client.loadOrganizationVirtualBlockchain(orgId);
	  const accountId = orgVb.getAccountId();
	  const accountState = await client.getAccountState(accountId.toBytes());
	  const breakdown = BalanceAvailability.createFromAccountStateAbciResponse(accountState);
	  const stacked = breakdown.getStaked();
      const internalState = vb.getInternalState();
      const pk = await vb.getCometbftPublicKeyDeclaration();
      const isApproved = internalState.getLastKnownApprovalStatus();


      console.log(`\n${index + 1}. Validator node ID: ${validator.encode()}`);
      console.log(`   Status: ${isApproved ? "✓ Approved" : "✗ Not Approved"}`);
	  console.log(`   Organization ID: ${orgId.encode()}`);
	  console.log(`   Account ID: ${accountId.encode()}`);
	  console.log(`   CometBFT Public Key: ${pk.cometbftPublicKey} (${pk.cometbftPublicKeyType})`)
	  console.log(`   Stacked: ${stacked.toString()}`);
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

/**
 * To approve a validator node, we need to have the validator node identifier of the node.
 * We (the governance) will write an approval directly on the validator node virtual blockchain.
 * @param validatorNodeId
 */
async function approveValidator(rpcUrl: string, validatorNodeId: string): Promise<void> {
	console.log(`Approving validator node with ID ${validatorNodeId} at ${rpcUrl}...`)

	// we recover the governance private signature key and the governance account ID
	console.log("Recovering governance account...")
	const client = ProviderFactory.createInMemoryProviderWithExternalProvider(rpcUrl);
	const governancePrivateKey = await getGovernancePrivateKey();
	const governancePublicKey = await governancePrivateKey.getPublicKey();
	const governanceAccountId = await client.getAccountIdByPublicKey(governancePublicKey)


	// we recover the validator node virtual blockchain and append the approval microblock
	const validatorNodeVb = await client.loadValidatorNodeVirtualBlockchain(Hash.from(validatorNodeId));
	const mb = await validatorNodeVb.createMicroblock();
	mb.addSection({
		type: SectionType.VN_APPROVAL,
		status: true,
	});

	// we compute the gas to get a conform microblock
	const protocolVariables = await client.getProtocolVariables();
	const feesCalculationVersion = protocolVariables.getFeesCalculationVersion();
	const feesCalculation = FeesCalculationFormulaFactory.getFeesCalculationFormulaByVersion(feesCalculationVersion);
	const gas = await feesCalculation.computeFees(governancePrivateKey.getSignatureSchemeId(), mb);
	mb.setGas(gas);

	// we seal the microblock
	console.log("Sealing approval microblock...")
	await mb.seal(governancePrivateKey, {
		feesPayerAccount: governanceAccountId
	});

	// publish the microblock
	console.log("Publishing approval microblock...")
	await client.publishMicroblock(mb);
}

async function revokeValidator(rpcUrl: string, validatorNodeId: string): Promise<void> {
	console.log(`Revoking validator node with ID ${validatorNodeId} at ${rpcUrl}...`)

	// we recover the governance private signature key and the governance account ID
	console.log("Recovering governance account...")
	const client = ProviderFactory.createInMemoryProviderWithExternalProvider(rpcUrl);
	const governancePrivateKey = await getGovernancePrivateKey();
	const governancePublicKey = await governancePrivateKey.getPublicKey();
	const governanceAccountId = await client.getAccountIdByPublicKey(governancePublicKey)


	// we recover the validator node virtual blockchain and append the approval microblock
	const validatorNodeVb = await client.loadValidatorNodeVirtualBlockchain(Hash.from(validatorNodeId));
	const mb = await validatorNodeVb.createMicroblock();
	mb.addSection({
		type: SectionType.VN_APPROVAL,
		status: false,
	});

	// we compute the gas to get a conform microblock
	const protocolVariables = await client.getProtocolVariables();
	const feesCalculationVersion = protocolVariables.getFeesCalculationVersion();
	const feesCalculation = FeesCalculationFormulaFactory.getFeesCalculationFormulaByVersion(feesCalculationVersion);
	const gas = await feesCalculation.computeFees(governancePrivateKey.getSignatureSchemeId(), mb);
	mb.setGas(gas);

	// we seal the microblock
	console.log("Sealing approval microblock...")
	await mb.seal(governancePrivateKey, {
		feesPayerAccount: governanceAccountId
	});

	// publish the microblock
	console.log("Publishing approval microblock...")
	await client.publishMicroblock(mb);
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
      await approveValidator(rpcUrl, address);
      break;
    }

    case "revoke": {
      const address = args._[1] as string;
      if (!address) {
        console.error("Error: Address is required for revoke command");
        console.log("Usage: carmentis-governance revoke <address>");
        Deno.exit(1);
      }
      await revokeValidator(rpcUrl, address);
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
