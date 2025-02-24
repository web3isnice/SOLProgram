const PROGRAM_ID = pg.PROGRAM_ID;
const KLEND_PROGRAM_ID = new web3.PublicKey(
  "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
);
const LENDING_MARKET_AUTHORITY = new web3.PublicKey(
  "9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo"
);
const LENDING_MARKET = new web3.PublicKey(
  "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF"
);
const RESERVE_ADDRESS = new web3.PublicKey(
  "D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59"
);
const USDC_MINT = new web3.PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
const SRC_LIQUIDITY_ADDRESS = new web3.PublicKey(
  "Bgq7trRgVMeq33yt235zM2onQ4bRDBsY5EWiTetF4qw6"
);
const FEE_RECEIVER_ADDRESS = new web3.PublicKey(
  "BbDUrk1bVtSixgQsPLBJFZEF7mwGstnD5joA1WzYvYFX"
);
const TOKEN_PROGRAM_ID = new web3.PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new web3.PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

async function executeFlashLoan(amount) {
  console.log("Starting flash loan execution...");

  // Create transfer authority
  const userTransferAuthority = web3.Keypair.generate();
  console.log(
    "Created transfer authority:",
    userTransferAuthority.publicKey.toString()
  );

  // Find ATA
  const [userTokenAccount] = await web3.PublicKey.findProgramAddress(
    [
      pg.wallet.publicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      USDC_MINT.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  console.log("User token account:", userTokenAccount.toString());

  // Create instructions
  const priorityFeeIx = web3.ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1,
  });

  const borrowIx = new web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      {
        pubkey: userTransferAuthority.publicKey,
        isSigner: true,
        isWritable: false,
      },
      { pubkey: LENDING_MARKET_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: LENDING_MARKET, isSigner: false, isWritable: false },
      { pubkey: RESERVE_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: SRC_LIQUIDITY_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: FEE_RECEIVER_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: KLEND_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: KLEND_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([23, ...new BN(amount).toArray("le", 8)]),
  });

  const repayIx = new web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      {
        pubkey: userTransferAuthority.publicKey,
        isSigner: true,
        isWritable: false,
      },
      { pubkey: LENDING_MARKET_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: LENDING_MARKET, isSigner: false, isWritable: false },
      { pubkey: RESERVE_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: SRC_LIQUIDITY_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: FEE_RECEIVER_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: KLEND_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: KLEND_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([22, ...new BN(amount).toArray("le", 8), 0]),
  });

  // Create and send transaction
  const tx = new web3.Transaction()
    .add(priorityFeeIx)
    .add(borrowIx)
    .add(repayIx);

  const blockhash = await pg.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash.blockhash;
  tx.feePayer = pg.wallet.publicKey;

  // Just sign and send, don't wait for confirmation
  tx.sign(pg.wallet.keypair, userTransferAuthority);

  console.log("Sending transaction...");
  const signature = await pg.connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });

  console.log("Transaction sent:", signature);
  return signature;
}

// Execute test
console.log("Starting flash loan test...");
const amount = 1000000000; // 1000 USDC
executeFlashLoan(amount)
  .then((signature) => console.log("Flash loan sent:", signature))
  .catch((error) => console.error("Failed to send flash loan:", error));
