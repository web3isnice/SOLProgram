// Program constants
const TOKEN_PROGRAM_ID = new web3.PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new web3.PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const KLEND_PROGRAM_ID = new web3.PublicKey(
  "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
);

// Kamino lending market accounts
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

describe("Flash Loan Tests", () => {
  let userTokenAccount: web3.PublicKey;
  let userTransferAuthority: web3.Keypair;

  it("should create valid flash loan instructions", async () => {
    // Setup accounts
    userTransferAuthority = new web3.Keypair();
    console.log("Test authority:", userTransferAuthority.publicKey.toBase58());

    const [ataAddress] = await web3.PublicKey.findProgramAddress(
      [
        pg.wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        USDC_MINT.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    userTokenAccount = ataAddress;
    console.log("Test token account:", userTokenAccount.toBase58());

    // Create flash loan borrow instruction
    const amount = 1000000000; // 1000 USDC
    const borrowIx = new web3.TransactionInstruction({
      programId: pg.PROGRAM_ID,
      keys: [
        {
          pubkey: userTransferAuthority.publicKey,
          isSigner: true,
          isWritable: false,
        },
        {
          pubkey: LENDING_MARKET_AUTHORITY,
          isSigner: false,
          isWritable: false,
        },
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
      data: Buffer.from([
        23, // flashBorrowReserveLiquidity instruction
        ...new BN(amount).toArray("le", 8),
      ]),
    });

    // Create flash loan repay instruction
    const repayIx = new web3.TransactionInstruction({
      programId: pg.PROGRAM_ID,
      keys: [
        {
          pubkey: userTransferAuthority.publicKey,
          isSigner: true,
          isWritable: false,
        },
        {
          pubkey: LENDING_MARKET_AUTHORITY,
          isSigner: false,
          isWritable: false,
        },
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
      data: Buffer.from([
        22, // flashRepayReserveLiquidity instruction
        ...new BN(amount).toArray("le", 8),
        0, // borrow instruction index
      ]),
    });

    // Verify borrow instruction
    assert.ok(borrowIx.programId.equals(pg.PROGRAM_ID), "Program ID matches");
    assert.equal(borrowIx.keys.length, 12, "Correct number of accounts");
    assert.equal(
      borrowIx.data[0],
      23,
      "Correct borrow instruction discriminator"
    );
    assert.equal(
      new BN(borrowIx.data.slice(1, 9), "le").toNumber(),
      amount,
      "Correct amount"
    );

    // Verify repay instruction
    assert.ok(repayIx.programId.equals(pg.PROGRAM_ID), "Program ID matches");
    assert.equal(repayIx.keys.length, 12, "Correct number of accounts");
    assert.equal(
      repayIx.data[0],
      22,
      "Correct repay instruction discriminator"
    );
    assert.equal(
      new BN(repayIx.data.slice(1, 9), "le").toNumber(),
      amount,
      "Correct amount"
    );
    assert.equal(repayIx.data[9], 0, "Correct instruction index");

    // Verify key permissions
    borrowIx.keys.forEach((key, i) => {
      if (i === 0) assert.ok(key.isSigner, "Authority should be signer");
      if ([3, 5, 6, 7].includes(i))
        assert.ok(key.isWritable, "Writeable accounts verified");
    });

    console.log("Flash loan instructions verified successfully");
  });

  it("should validate instruction data format", () => {
    const amount = 1000000000;
    const borrowData = Buffer.from([
      23, // Borrow instruction
      ...new BN(amount).toArray("le", 8),
    ]);

    const repayData = Buffer.from([
      22, // Repay instruction
      ...new BN(amount).toArray("le", 8),
      0, // Instruction index
    ]);

    // Check data lengths
    assert.equal(borrowData.length, 9, "Borrow data length correct");
    assert.equal(repayData.length, 10, "Repay data length correct");

    // Check instruction discriminators
    assert.equal(borrowData[0], 23, "Borrow discriminator correct");
    assert.equal(repayData[0], 22, "Repay discriminator correct");

    // Check amount encoding
    assert.equal(
      new BN(borrowData.slice(1, 9), "le").toNumber(),
      amount,
      "Amount encoded correctly in borrow"
    );
    assert.equal(
      new BN(repayData.slice(1, 9), "le").toNumber(),
      amount,
      "Amount encoded correctly in repay"
    );

    console.log("Instruction data format validated successfully");
  });
});
