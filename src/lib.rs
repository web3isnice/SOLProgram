use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program_error::ProgramError,
    pubkey::Pubkey,
    instruction::{AccountMeta, Instruction},
    sysvar::instructions::load_current_index_checked,
};

// Declare the program ID
solana_program::declare_id!("5Ng59pnt4WjGPYa8b9QKna9qp5yAB4X5NG45t4UBXbD5");

// Kamino Lending program ID and account addresses
const KLEND_PROGRAM_ID: Pubkey = solana_program::pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
const LENDING_MARKET_AUTHORITY: Pubkey = solana_program::pubkey!("9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo");
const LENDING_MARKET: Pubkey = solana_program::pubkey!("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF");
const RESERVE_ADDRESS: Pubkey = solana_program::pubkey!("D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59");
const RESERVE_LIQUIDITY_MINT: Pubkey = solana_program::pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const SRC_LIQUIDITY_ADDRESS: Pubkey = solana_program::pubkey!("Bgq7trRgVMeq33yt235zM2onQ4bRDBsY5EWiTetF4qw6");
const FEE_RECEIVER_ADDRESS: Pubkey = solana_program::pubkey!("BbDUrk1bVtSixgQsPLBJFZEF7mwGstnD5joA1WzYvYFX");
const REFERRER: Pubkey = solana_program::pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

// Custom error enum
#[derive(Debug)]
pub enum FlashLoanError {
    InvalidInstruction,
    InvalidAmount,
    InvalidSigner,
}

impl From<FlashLoanError> for ProgramError {
    fn from(e: FlashLoanError) -> Self {
        ProgramError::Custom(1000 + match e {
            FlashLoanError::InvalidInstruction => 0,
            FlashLoanError::InvalidAmount => 1,
            FlashLoanError::InvalidSigner => 2,
        })
    }
}

// Instruction enum
#[derive(Debug)]
pub enum FlashLoanInstruction {
    InitiateFlashLoan { amount: u64 },
}

impl FlashLoanInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (&tag, rest) = input.split_first().ok_or(FlashLoanError::InvalidInstruction)?;
        Ok(match tag {
            0 => {
                let amount = rest
                    .get(..8)
                    .and_then(|slice| slice.try_into().ok())
                    .map(u64::from_le_bytes)
                    .ok_or(FlashLoanError::InvalidInstruction)?;
                Self::InitiateFlashLoan { amount }
            }
            _ => return Err(FlashLoanError::InvalidInstruction.into()),
        })
    }
}

// Entrypoint
entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = FlashLoanInstruction::unpack(instruction_data)?;

    match instruction {
        FlashLoanInstruction::InitiateFlashLoan { amount } => {
            process_flash_loan(accounts, amount)
        }
    }
}

fn process_flash_loan(
    accounts: &[AccountInfo],
    amount: u64,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();

    // Parse accounts
    let user_transfer_authority = next_account_info(accounts_iter)?;
    let user_token_account = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let sysvar_info = next_account_info(accounts_iter)?;

    // Basic validation
    if !user_transfer_authority.is_signer {
        msg!("User authority must be a signer");
        return Err(FlashLoanError::InvalidSigner.into());
    }

    if amount == 0 {
        msg!("Invalid amount: cannot be zero");
        return Err(FlashLoanError::InvalidAmount.into());
    }

    // Get current instruction index for the repay instruction
    let current_ix_index = load_current_index_checked(sysvar_info)?;

    // Execute flash borrow
    let borrow_ix = create_flash_borrow_ix(
        user_transfer_authority.key,
        user_token_account.key,
        amount,
    );

    invoke(
        &borrow_ix,
        &[
            user_transfer_authority.clone(),
            user_token_account.clone(),
            token_program.clone(),
            sysvar_info.clone(),
        ],
    )?;

    // Execute flash repay
    let repay_ix = create_flash_repay_ix(
        user_transfer_authority.key,
        user_token_account.key,
        amount,
        current_ix_index as u8,
    );

    invoke(
        &repay_ix,
        &[
            user_transfer_authority.clone(),
            user_token_account.clone(),
            token_program.clone(),
            sysvar_info.clone(),
        ],
    )?;

    msg!("Flash loan completed successfully");
    Ok(())
}

fn create_flash_borrow_ix(
    user_authority: &Pubkey,
    user_token_account: &Pubkey,
    amount: u64,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new(*user_authority, true),
        AccountMeta::new_readonly(LENDING_MARKET_AUTHORITY, false),
        AccountMeta::new_readonly(LENDING_MARKET, false),
        AccountMeta::new(RESERVE_ADDRESS, false),
        AccountMeta::new_readonly(RESERVE_LIQUIDITY_MINT, false),
        AccountMeta::new(SRC_LIQUIDITY_ADDRESS, false),
        AccountMeta::new(*user_token_account, false),
        AccountMeta::new(FEE_RECEIVER_ADDRESS, false),
        AccountMeta::new(REFERRER, false),
        AccountMeta::new_readonly(REFERRER, false),
        AccountMeta::new_readonly(solana_program::sysvar::instructions::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    let mut data = vec![23]; // Flash borrow instruction discriminator
    data.extend_from_slice(&amount.to_le_bytes());

    Instruction {
        program_id: KLEND_PROGRAM_ID,
        accounts,
        data,
    }
}

fn create_flash_repay_ix(
    user_authority: &Pubkey,
    user_token_account: &Pubkey,
    amount: u64,
    borrow_instruction_index: u8,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new(*user_authority, true),
        AccountMeta::new_readonly(LENDING_MARKET_AUTHORITY, false),
        AccountMeta::new_readonly(LENDING_MARKET, false),
        AccountMeta::new(RESERVE_ADDRESS, false),
        AccountMeta::new_readonly(RESERVE_LIQUIDITY_MINT, false),
        AccountMeta::new(SRC_LIQUIDITY_ADDRESS, false),
        AccountMeta::new(*user_token_account, false),
        AccountMeta::new(FEE_RECEIVER_ADDRESS, false),
        AccountMeta::new(REFERRER, false),
        AccountMeta::new_readonly(REFERRER, false),
        AccountMeta::new_readonly(solana_program::sysvar::instructions::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    let mut data = vec![22]; // Flash repay instruction discriminator
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(borrow_instruction_index);

    Instruction {
        program_id: KLEND_PROGRAM_ID,
        accounts,
        data,
    }
}